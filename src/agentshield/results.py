"""Result models: assertion outcomes, case results, suite runs and findings."""

from __future__ import annotations

import hashlib
import time
from typing import Any

from pydantic import BaseModel, Field

from .models import Severity, Status, Usage, new_id
from .trace import Trace


class EvidenceRef(BaseModel):
    event_id: str | None = None
    seq: int | None = None
    summary: str = ""


class AssertionResult(BaseModel):
    type: str
    status: Status
    message: str = ""
    level: str = "deterministic"  # deterministic | heuristic | judge
    evidence: list[EvidenceRef] = Field(default_factory=list)
    params: dict[str, Any] = Field(default_factory=dict)


class RepeatResult(BaseModel):
    index: int
    status: Status
    assertions: list[AssertionResult] = Field(default_factory=list)
    trace_id: str | None = None
    error: str | None = None
    final_response: str = ""
    iterations: int = 0
    tool_calls: int = 0
    attempted_violations: int = 0  # violations the agent attempted (blocked or not)
    effective_violations: int = 0  # violations that took effect
    blocked_attempts: int = 0  # attempts stopped by policy or app defense
    usage: Usage = Field(default_factory=Usage)
    duration_ms: float = 0.0


class CaseResult(BaseModel):
    id: str = Field(default_factory=lambda: new_id("case"))
    scenario_id: str
    scenario_version: str = "1.0"
    variant: dict[str, Any] = Field(default_factory=dict)
    name: str
    category: str
    severity: Severity = Severity.HIGH
    owasp: list[str] = Field(default_factory=list)
    agent: str
    mode: str
    policy: str | None = None
    model: str = "simulated"
    status: Status
    pass_rate: float = 0.0
    repeats: list[RepeatResult] = Field(default_factory=list)
    mitigated: bool = False  # PASS only because policy/app defense blocked an attempt
    remediation: str = ""
    traces: list[Trace] = Field(default_factory=list)  # redacted traces, one per repeat

    @property
    def key(self) -> str:
        suffix = ",".join(f"{k}={v}" for k, v in sorted(self.variant.items()))
        return f"{self.scenario_id}[{suffix}]" if suffix else self.scenario_id

    @property
    def primary(self) -> RepeatResult:
        for r in self.repeats:
            if r.status not in (Status.PASS,):
                return r
        return self.repeats[0]


class RunConfig(BaseModel):
    target: str = "builtin"  # builtin | <registered target name>
    variant: str = "unsafe"  # unsafe | partial | hardened (builtin agents)
    mode: str = "monitor"  # monitor | enforce
    policy: str = "default"
    brain: str = "simulated"  # simulated | llm
    model: str | None = None  # gateway model ref for brain=llm
    repeat: int | None = None
    seed: str = "agentshield"
    scenarios: list[str] = Field(default_factory=list)  # ids; empty = all
    categories: list[str] = Field(default_factory=list)
    agents: list[str] = Field(default_factory=list)
    label: str = ""


class Summary(BaseModel):
    total: int = 0
    counts: dict[str, int] = Field(default_factory=dict)
    score: float = 0.0  # 0-100 resilience score
    coverage: float = 0.0  # share of conclusive results
    mitigated: int = 0
    by_category: dict[str, dict[str, Any]] = Field(default_factory=dict)
    by_agent: dict[str, dict[str, Any]] = Field(default_factory=dict)
    policy_violations_attempted: int = 0
    policy_violations_effective: int = 0
    tokens: int = 0
    cost_usd: float | None = None


class SuiteRun(BaseModel):
    id: str = Field(default_factory=lambda: new_id("run"))
    config: RunConfig
    status: str = "completed"  # queued | running | completed | failed
    started_at: float = Field(default_factory=time.time)
    finished_at: float | None = None
    cases: list[CaseResult] = Field(default_factory=list)
    summary: Summary = Field(default_factory=Summary)
    agentshield_version: str = ""
    error: str | None = None
    progress: dict[str, int] = Field(default_factory=lambda: {"done": 0, "total": 0})


class Finding(BaseModel):
    id: str
    run_id: str
    case_key: str
    scenario_id: str
    title: str
    severity: Severity
    category: str
    status: Status
    owasp: list[str] = Field(default_factory=list)
    agent: str = ""
    description: str = ""
    evidence: list[EvidenceRef] = Field(default_factory=list)
    remediation: str = ""
    trace_id: str | None = None
    confidence: str = "confirmed"  # confirmed | needs_review


def finding_id(scenario_key: str, agent: str, mode: str) -> str:
    return "AS-" + hashlib.sha1(f"{scenario_key}|{agent}|{mode}".encode()).hexdigest()[:8].upper()
