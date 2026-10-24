"""Scenario schema: multi-step, stateful, parameterized, repeatable."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..models import Severity

STEP_TYPES = {
    "user_message",
    "confirm",
    "inject_document",
    "inject_email",
    "inject_web_page",
    "register_mcp_tool",
    "peer_response",
    "agent_message",
    "set_memory",
    "add_file",
    "new_session",
    "switch_principal",
    "run_agent",
}

CATEGORIES = {
    "direct_prompt_injection",
    "indirect_prompt_injection",
    "tool_misuse",
    "excessive_agency",
    "rag_data_isolation",
    "memory_poisoning",
    "sensitive_data_exposure",
    "system_instruction_disclosure",
    "multi_agent_trust",
    "mcp_tool_trust",
    "output_handling",
    "resource_abuse",
    "benign_control",
}


class Step(BaseModel):
    model_config = ConfigDict(extra="allow")

    type: str
    content: str | None = None
    fixture: str | None = None
    document_id: str | None = None
    title: str | None = None
    owner: str | None = None
    acl: list[str] | None = None
    max_turns: int | None = None

    @field_validator("type")
    @classmethod
    def _known(cls, v: str) -> str:
        if v not in STEP_TYPES:
            raise ValueError(f"unknown step type '{v}' (known: {sorted(STEP_TYPES)})")
        return v


class Assertion(BaseModel):
    model_config = ConfigDict(extra="allow")

    type: str
    description: str | None = None

    def params(self) -> dict[str, Any]:
        return {k: v for k, v in self.model_dump().items() if k not in {"type", "description"}}


class Target(BaseModel):
    agent: str = "document-assistant"
    principal: str | None = None


class Setup(BaseModel):
    model_config = ConfigDict(extra="allow")

    fixture: str | None = None  # human-readable fixture label


class Scenario(BaseModel):
    id: str
    name: str
    version: str = "1.0"
    category: str
    severity: Severity = Severity.HIGH
    description: str = ""
    owasp: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    target: Target = Field(default_factory=Target)
    setup: Setup = Field(default_factory=Setup)
    parameters: dict[str, list[Any]] = Field(default_factory=dict)
    steps: list[Step]
    assertions: list[Assertion]
    repeat: int = 1
    remediation: str = ""
    variant: dict[str, Any] = Field(default_factory=dict)  # filled in by parameter expansion
    source: str = ""  # file the scenario was loaded from (set by the loader)

    @field_validator("category")
    @classmethod
    def _cat(cls, v: str) -> str:
        if v not in CATEGORIES:
            raise ValueError(f"unknown category '{v}'")
        return v

    @property
    def key(self) -> str:
        suffix = ",".join(f"{k}={v}" for k, v in sorted(self.variant.items()))
        return f"{self.id}[{suffix}]" if suffix else self.id
