"""Policy engine: deterministic rules + JSON Schema, with Monitor and Enforce modes."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import jsonschema
import yaml
from pydantic import BaseModel, Field

from ..authorization import Grants
from ..models import PolicyDecision, PolicyMode, Severity, Violation
from ..sandbox.tools import ToolSpec
from ..sandbox.world import LIBRARY, World
from .conditions import CONDITIONS

POLICY_DIR = LIBRARY / "policies"


class Rule(BaseModel):
    id: str
    description: str = ""
    severity: Severity = Severity.HIGH
    tools: list[str] = Field(default_factory=lambda: ["*"])
    when: dict[str, Any] = Field(default_factory=dict)  # all must hold
    when_any: dict[str, Any] = Field(default_factory=dict)  # at least one holds
    effect: str = "deny"  # deny | audit
    owasp: list[str] = Field(default_factory=list)
    remediation: str = ""


class Policy(BaseModel):
    id: str
    version: str = "1.0"
    description: str = ""
    trusted_domains: list[str] = Field(default_factory=lambda: ["corp.test"])
    allowed_fetch_domains: list[str] = Field(default_factory=list)
    rules: list[Rule] = Field(default_factory=list)


@dataclass
class CallContext:
    tool: str
    args: dict[str, Any]
    spec: ToolSpec
    world: World
    grants: Grants
    untrusted_texts: list[str] = field(default_factory=list)
    trusted_texts: list[str] = field(default_factory=list)
    tool_call_count: int = 0
    iteration: int = 0


def _schema() -> dict[str, Any]:
    return json.loads((POLICY_DIR / "policy.schema.json").read_text(encoding="utf-8"))


def validate_policy_doc(doc: dict[str, Any]) -> None:
    jsonschema.validate(doc, _schema())
    for rule in doc.get("rules", []):
        unknown = (set(rule.get("when", {})) | set(rule.get("when_any", {}))) - set(CONDITIONS)
        if unknown:
            raise ValueError(f"rule {rule.get('id')}: unknown condition(s) {sorted(unknown)}")


def user_policy_dir() -> Path:
    return Path(os.environ.get("AGENTSHIELD_HOME", ".agentshield")) / "policies"


def load_policy(name_or_path: str) -> Policy:
    p = Path(name_or_path)
    if not p.is_file():
        p = POLICY_DIR / f"{name_or_path}.yaml"
    if not p.is_file():
        p = user_policy_dir() / f"{name_or_path}.yaml"
    if not p.is_file():
        raise FileNotFoundError(f"policy not found: {name_or_path}")
    doc = yaml.safe_load(p.read_text(encoding="utf-8"))
    validate_policy_doc(doc)
    return Policy.model_validate(doc)


def list_policies() -> list[Policy]:
    files = sorted(POLICY_DIR.glob("*.yaml")) + sorted(user_policy_dir().glob("*.yaml"))
    return [load_policy(str(p)) for p in files]


class PolicyEngine:
    def __init__(self, policy: Policy, mode: PolicyMode = PolicyMode.MONITOR):
        self.policy = policy
        self.mode = PolicyMode(mode)

    def evaluate(self, ctx: CallContext) -> PolicyDecision:
        violations: list[Violation] = []
        for rule in self.policy.rules:
            if "*" not in rule.tools and ctx.tool not in rule.tools:
                continue
            reasons: list[str] = []
            ok = True
            for cond, param in rule.when.items():
                r = CONDITIONS[cond](ctx, param, self.policy)
                if r:
                    reasons.append(r)
                else:
                    ok = False
                    break
            if ok and rule.when_any:
                any_reasons = [r for c, p in rule.when_any.items() if (r := CONDITIONS[c](ctx, p, self.policy))]
                if any_reasons:
                    reasons.extend(any_reasons)
                else:
                    ok = False
            if ok and (rule.when or rule.when_any):
                violations.append(
                    Violation(
                        rule_id=rule.id,
                        severity=rule.severity,
                        reason="; ".join(reasons),
                        effect=rule.effect,
                        owasp=rule.owasp,
                    )
                )
        deny = any(v.effect == "deny" for v in violations)
        if not violations:
            return PolicyDecision(decision="allow", mode=self.mode)
        if deny and self.mode == PolicyMode.ENFORCE:
            return PolicyDecision(decision="block", mode=self.mode, violations=violations, blocked=True)
        if deny:
            return PolicyDecision(decision="would_block", mode=self.mode, violations=violations)
        return PolicyDecision(decision="audit", mode=self.mode, violations=violations)
