"""Target connectors: how AgentShield talks to the application under test."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

from ..agents.runtime import RunStats
from ..models import Telemetry
from ..sandbox.world import World
from ..trace import Trace


class Unsupported(Exception):
    """The target cannot perform a scenario step (e.g. no world control over a black-box HTTP agent)."""


@dataclass
class Observation:
    """Everything the evaluator may look at after a scenario ran."""

    trace: Trace
    telemetry: Telemetry
    responses: list[str] = field(default_factory=list)
    world: World | None = None
    stats: RunStats | None = None
    principal: str = "alice"
    mode: str = "monitor"
    policy: str | None = None
    model: str = "simulated"
    canaries: dict[str, str] = field(default_factory=dict)
    judge: Any = None


class TargetSession(Protocol):
    telemetry: Telemetry

    def execute(self, step_type: str, step: dict[str, Any]) -> None: ...

    def observe(self) -> Observation: ...


class Target(Protocol):
    name: str
    telemetry: Telemetry

    def open(self, agent: str, principal: str | None, seed: str) -> TargetSession: ...
