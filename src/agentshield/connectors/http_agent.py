"""Black-box HTTP agent connector.

A third-party application reachable only over HTTP exposes just its text responses (and, if it
reports them, its tool calls). AgentShield therefore:
  * cannot inject fixtures (no world control) -> such steps make the case INCONCLUSIVE;
  * cannot block real tool calls (no Enforce) -> use the SDK or the guard proxy for that;
  * never reads missing telemetry as "no violation".
"""

from __future__ import annotations

import os
import re
import time
from typing import Any

import httpx
from pydantic import BaseModel, Field

from ..gateway.allowlist import AllowList, default_allowlist
from ..models import EventType, Telemetry
from ..redaction import register_secret
from ..trace import TraceCollector
from .base import Observation, Unsupported

MAX_RESPONSE_BYTES = 1_000_000


class TargetSpec(BaseModel):
    name: str
    kind: str = "http"
    url: str
    method: str = "POST"
    headers: dict[str, str] = Field(default_factory=dict)  # values may use ${env:VAR}
    request_template: dict[str, Any] = Field(default_factory=lambda: {"message": "{{message}}"})
    response_path: str = "response"
    tool_calls_path: str | None = None  # path to a list of {name, arguments}
    telemetry: str = "none"  # none | tool_calls
    canaries: dict[str, str] = Field(default_factory=dict)  # synthetic secrets you planted in the app under test
    timeout_s: float = 30.0
    description: str = ""


_ENV = re.compile(r"\$\{env:(\w+)\}")


def _expand_env(value: str) -> str:
    def repl(m: re.Match[str]) -> str:
        v = os.environ.get(m.group(1), "")
        register_secret(v)
        return v

    return _ENV.sub(repl, value)


def _render(obj: Any, ctx: dict[str, Any]) -> Any:
    if isinstance(obj, str):
        if obj.strip() == "{{messages}}":
            return ctx["messages"]
        return obj.replace("{{message}}", ctx["message"]).replace("{{conversation_id}}", ctx["conversation_id"])
    if isinstance(obj, dict):
        return {k: _render(v, ctx) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_render(v, ctx) for v in obj]
    return obj


def get_path(data: Any, path: str | None) -> Any:
    if not path:
        return None
    cur = data
    for part in path.split("."):
        if isinstance(cur, list):
            try:
                cur = cur[int(part)]
            except (ValueError, IndexError):
                return None
        elif isinstance(cur, dict):
            cur = cur.get(part)
        else:
            return None
    return cur


class HttpSession:
    def __init__(self, spec: TargetSpec, allowlist: AllowList, transport: httpx.BaseTransport | None, telemetry: Telemetry):
        self.spec = spec
        self.allowlist = allowlist
        self.telemetry = telemetry
        self.collector = TraceCollector()
        self.messages: list[dict[str, str]] = []
        self.responses: list[str] = []
        self.conversation_id = f"agentshield-{int(time.time())}"
        self.pending_user = ""
        self._http = httpx.Client(timeout=spec.timeout_s, follow_redirects=False, transport=transport)

    def execute(self, step_type: str, step: dict[str, Any]) -> None:
        if step_type in {"user_message", "confirm"}:
            text = step.get("content") or "Yes, go ahead."
            self.messages.append({"role": "user", "content": text})
            self.pending_user = text
            self.collector.emit(EventType.USER_MESSAGE, "User message", input=text)
        elif step_type == "run_agent":
            self._call()
        elif step_type == "new_session":
            self.messages = []
            self.conversation_id += "-n"
        else:
            raise Unsupported("this HTTP target gives AgentShield no control over its data or identity")

    def _call(self) -> None:
        self.allowlist.check(self.spec.url)
        headers = {k: _expand_env(v) for k, v in self.spec.headers.items()}
        body = _render(self.spec.request_template, {"message": self.pending_user, "messages": self.messages, "conversation_id": self.conversation_id})
        t0 = time.perf_counter()
        r = self._http.request(self.spec.method, self.spec.url, headers=headers, json=body)
        if r.is_redirect:
            raise RuntimeError("redirect refused: AgentShield does not follow redirects")
        r.raise_for_status()
        if len(r.content) > MAX_RESPONSE_BYTES:
            raise RuntimeError("response too large")
        data = r.json()
        text = get_path(data, self.spec.response_path)
        text = text if isinstance(text, str) else str(text if text is not None else "")
        self.messages.append({"role": "assistant", "content": text})
        self.responses.append(text)
        ms = (time.perf_counter() - t0) * 1000
        if self.telemetry.tool_calls:
            for c in get_path(data, self.spec.tool_calls_path) or []:
                self.collector.emit(
                    EventType.TOOL_CALL,
                    str(c.get("name")),
                    input=c.get("arguments", {}),
                    executed=True,  # reported by the target, not verified by AgentShield
                    attributes={"agentshield.source": "target-reported", "gen_ai.tool.name": str(c.get("name"))},
                )
        self.collector.emit(EventType.FINAL, "Final response", output=text, duration_ms=ms)

    def observe(self) -> Observation:
        return Observation(
            trace=self.collector.trace,
            telemetry=self.telemetry,
            responses=list(self.responses),
            world=None,
            stats=None,
            mode="monitor",
            policy=None,
            model=self.spec.name,
            canaries=dict(self.spec.canaries),
        )


class HttpTarget:
    kind = "http"

    def __init__(self, spec: TargetSpec, allowlist: AllowList | None = None, transport: httpx.BaseTransport | None = None):
        self.spec = spec
        self.name = spec.name
        self.allowlist = allowlist or default_allowlist()
        self.transport = transport
        self.telemetry = Telemetry(tool_calls=spec.telemetry == "tool_calls", response_text=True)
        self.allowlist.check(spec.url)  # fail early, at registration time

    def open(self, agent: str, principal: str | None, seed: str) -> HttpSession:
        return HttpSession(self.spec, self.allowlist, self.transport, self.telemetry)
