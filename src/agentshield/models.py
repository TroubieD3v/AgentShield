"""Core domain types shared by the runtime, policy engine, evaluation and API."""

from __future__ import annotations

import time
import uuid
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


class Provenance(StrEnum):
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"
    TOOL_RESULT = "tool_result"
    RETRIEVED = "retrieved_document"
    MEMORY = "memory"
    AGENT_MESSAGE = "agent_message"
    TOOL_DESCRIPTION = "tool_description"


TRUSTED_PROVENANCE = {Provenance.SYSTEM, Provenance.USER, Provenance.ASSISTANT}


class Message(BaseModel):
    role: str  # system | user | assistant | tool
    content: str
    provenance: Provenance = Provenance.USER
    name: str | None = None  # tool name for tool results
    meta: dict[str, Any] = Field(default_factory=dict)

    @property
    def trusted(self) -> bool:
        return self.provenance in TRUSTED_PROVENANCE


class ToolCall(BaseModel):
    id: str = Field(default_factory=lambda: new_id("call"))
    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)


class Severity(StrEnum):
    INFO = "info"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


SEVERITY_WEIGHT = {
    Severity.INFO: 0.5,
    Severity.LOW: 1,
    Severity.MEDIUM: 2,
    Severity.HIGH: 3,
    Severity.CRITICAL: 4,
}


class Status(StrEnum):
    PASS = "PASS"
    FAIL = "FAIL"
    SUSPICIOUS = "SUSPICIOUS"
    INCONCLUSIVE = "INCONCLUSIVE"
    ERROR = "ERROR"


class PolicyMode(StrEnum):
    MONITOR = "monitor"
    ENFORCE = "enforce"


class Violation(BaseModel):
    rule_id: str
    severity: Severity
    reason: str
    effect: str = "deny"  # deny | audit
    owasp: list[str] = Field(default_factory=list)


class PolicyDecision(BaseModel):
    """Outcome of a policy evaluation for one tool call."""

    decision: str  # allow | block | would_block | audit
    mode: PolicyMode
    violations: list[Violation] = Field(default_factory=list)
    blocked: bool = False  # the call was stopped before execution

    @property
    def violated(self) -> bool:
        return bool(self.violations)

    @property
    def effective(self) -> bool:
        """A violation that actually took effect (call was executed)."""
        return self.violated and not self.blocked


class EventType(StrEnum):
    USER_MESSAGE = "user_message"
    FIXTURE = "fixture_injection"
    RETRIEVAL = "document_retrieval"
    MODEL = "model_generation"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    POLICY = "policy_decision"
    MEMORY = "memory_write"
    AGENT_MESSAGE = "agent_message"
    BUDGET = "budget"
    CONFIRMATION = "confirmation"
    FINAL = "final_response"
    ERROR = "error"


class TraceEvent(BaseModel):
    model_config = ConfigDict(use_enum_values=False)

    id: str = Field(default_factory=lambda: new_id("evt"))
    trace_id: str
    seq: int
    ts: float = Field(default_factory=time.time)
    type: EventType
    title: str
    input: Any = None
    output: Any = None
    duration_ms: float = 0.0
    status: str = "ok"  # ok | violation | blocked | error
    executed: bool | None = None  # tool_call events only
    untrusted: bool = False  # event carries untrusted content
    policy: PolicyDecision | None = None
    attributes: dict[str, Any] = Field(default_factory=dict)


class Usage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    estimated: bool = False
    cost_usd: float | None = None

    def add(self, other: Usage) -> None:
        self.input_tokens += other.input_tokens
        self.output_tokens += other.output_tokens
        self.estimated = self.estimated or other.estimated
        if other.cost_usd is not None:
            self.cost_usd = (self.cost_usd or 0.0) + other.cost_usd


class Telemetry(BaseModel):
    """What a target can actually show us. Missing telemetry is never read as 'no violation'."""

    tool_calls: bool = False
    retrieval: bool = False
    memory: bool = False
    policy_enforcement: bool = False
    world_control: bool = False  # we can inject fixtures / seed state
    response_text: bool = True
