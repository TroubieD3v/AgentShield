"""Trace collection with OpenTelemetry GenAI semantic-convention attributes."""

from __future__ import annotations

import time
from typing import Any

from pydantic import BaseModel, Field

from .models import EventType, PolicyDecision, TraceEvent, new_id
from .redaction import redact

# gen_ai.operation.name values from the OpenTelemetry GenAI semantic conventions.
OTEL_OPERATION = {
    EventType.MODEL: "chat",
    EventType.RETRIEVAL: "retrieval",
    EventType.TOOL_CALL: "execute_tool",
    EventType.TOOL_RESULT: "execute_tool",
    EventType.AGENT_MESSAGE: "invoke_agent",
}


class Trace(BaseModel):
    trace_id: str = Field(default_factory=lambda: new_id("trace"))
    events: list[TraceEvent] = Field(default_factory=list)
    started_at: float = Field(default_factory=time.time)

    def of_type(self, *types: EventType) -> list[TraceEvent]:
        return [e for e in self.events if e.type in types]

    def tool_calls(self) -> list[TraceEvent]:
        return self.of_type(EventType.TOOL_CALL)

    def redacted(self) -> Trace:
        data = self.model_dump(mode="json")
        return Trace.model_validate(redact(data))

    def to_otel_spans(self, service: str = "agentshield") -> list[dict[str, Any]]:
        """Export as OTLP-style span dicts (GenAI semantic conventions)."""
        spans = []
        for e in self.events:
            attrs = {"gen_ai.system": service, **e.attributes}
            op = OTEL_OPERATION.get(e.type)
            if op:
                attrs["gen_ai.operation.name"] = op
            if e.policy:
                attrs["agentshield.policy.decision"] = e.policy.decision
                attrs["agentshield.policy.violations"] = [v.rule_id for v in e.policy.violations]
            spans.append(
                {
                    "trace_id": self.trace_id,
                    "span_id": e.id,
                    "name": f"{op or e.type.value} {e.title}",
                    "start_time_unix_nano": int(e.ts * 1e9),
                    "end_time_unix_nano": int((e.ts + e.duration_ms / 1000) * 1e9),
                    "status": "ERROR" if e.status in {"error", "violation"} else "OK",
                    "attributes": attrs,
                }
            )
        return spans


class TraceCollector:
    """Append-only event sink for one run."""

    def __init__(self, trace: Trace | None = None, otel_exporter: Any | None = None):
        self.trace = trace or Trace()
        self._seq = len(self.trace.events)
        self._otel = otel_exporter

    def emit(
        self,
        type: EventType,
        title: str,
        *,
        input: Any = None,
        output: Any = None,
        duration_ms: float = 0.0,
        status: str = "ok",
        executed: bool | None = None,
        untrusted: bool = False,
        policy: PolicyDecision | None = None,
        attributes: dict[str, Any] | None = None,
    ) -> TraceEvent:
        self._seq += 1
        ev = TraceEvent(
            trace_id=self.trace.trace_id,
            seq=self._seq,
            type=type,
            title=title,
            input=input,
            output=output,
            duration_ms=round(duration_ms, 3),
            status=status,
            executed=executed,
            untrusted=untrusted,
            policy=policy,
            attributes=attributes or {},
        )
        self.trace.events.append(ev)
        if self._otel:
            try:
                self._otel(ev)
            except Exception:  # telemetry must never break a run
                pass
        return ev


def make_otel_exporter(service_name: str = "agentshield"):
    """Return a callable that mirrors events as real OpenTelemetry spans, if the SDK is configured."""
    try:
        from opentelemetry import trace as otel_trace
    except ImportError:  # pragma: no cover
        return None
    tracer = otel_trace.get_tracer(service_name)

    def _export(ev: TraceEvent) -> None:
        with tracer.start_as_current_span(f"{ev.type.value} {ev.title}") as span:
            span.set_attribute("agentshield.trace_id", ev.trace_id)
            op = OTEL_OPERATION.get(ev.type)
            if op:
                span.set_attribute("gen_ai.operation.name", op)
            for k, v in ev.attributes.items():
                if isinstance(v, str | int | float | bool):
                    span.set_attribute(k, v)
            if ev.policy and ev.policy.violated:
                span.set_attribute("agentshield.policy.violation", True)

    return _export
