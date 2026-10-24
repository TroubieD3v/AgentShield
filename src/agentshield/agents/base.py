"""Brain interface: decides the next step of an agent given its context."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Protocol

from ..models import Message, ToolCall, Usage
from ..sandbox.tools import ToolSpec
from .config import Hardening


@dataclass
class ToolResult:
    call_id: str
    name: str
    data: Any = None
    error: str | None = None
    blocked: bool = False

    @property
    def content(self) -> str:
        if self.error:
            return json.dumps({"error": self.error})
        return json.dumps(self.data, default=str)


@dataclass
class Final:
    text: str
    pending: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class Action:
    tool_calls: list[ToolCall] = field(default_factory=list)
    final: str | None = None
    pending: list[dict[str, Any]] = field(default_factory=list)
    usage: Usage | None = None
    model: str = ""
    note: str = ""


@dataclass
class BrainView:
    messages: list[Message]
    new_messages: list[Message]
    tools: list[ToolSpec]
    hardening: Hardening
    principal: str
    system_prompt: str
    pending: list[dict[str, Any]] = field(default_factory=list)

    def last_user_text(self) -> str:
        for m in reversed(self.messages):
            if m.role == "user" and m.provenance.value == "user":
                return m.content
        return ""


class Brain(Protocol):
    name: str

    def start_turn(self, view: BrainView) -> None: ...

    def decide(self, view: BrainView, results: list[ToolResult]) -> Action: ...
