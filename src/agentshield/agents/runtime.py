"""Sandboxed agent runtime: runs a brain against mock tools, with policy checks and full tracing."""

from __future__ import annotations

import json
import time
from typing import Any

from pydantic import BaseModel, Field

from ..authorization import Grants, grants_from_text
from ..intents import is_confirmation
from ..models import EventType, Message, PolicyDecision, Provenance, ToolCall, Usage
from ..policy import CallContext, PolicyEngine
from ..sandbox.tools import HANDLERS, SPECS, ToolContext, ToolSpec, sanitize_html
from ..sandbox.world import World
from ..taint import is_tainted
from ..trace import TraceCollector
from .agents_prompt import RETRIEVAL_TOOLS
from .base import Brain, BrainView, ToolResult
from .config import AgentConfig
from .directives import looks_like_injection

LOOP_GUARD_MAX_CALLS = 6


class Budget(BaseModel):
    """Hard limits enforced by AgentShield itself, independent of the agent under test."""

    max_iterations: int = 25
    max_tool_calls: int = 40
    max_tokens: int = 120_000
    max_cost_usd: float | None = None


class RunStats(BaseModel):
    iterations: int = 0
    tool_calls: int = 0
    blocked_calls: int = 0
    usage: Usage = Field(default_factory=Usage)
    terminated: str | None = None  # budget reason, if any
    turn_tool_calls: int = 0


def redact_canaries(obj: Any, canaries: dict[str, str]) -> Any:
    if isinstance(obj, str):
        for v in canaries.values():
            obj = obj.replace(v, "[REDACTED]")
        return obj
    if isinstance(obj, dict):
        return {k: redact_canaries(v, canaries) for k, v in obj.items()}
    if isinstance(obj, list):
        return [redact_canaries(v, canaries) for v in obj]
    return obj


class AgentSession:
    def __init__(
        self,
        config: AgentConfig,
        world: World,
        collector: TraceCollector,
        brain: Brain,
        policy: PolicyEngine | None = None,
        budget: Budget | None = None,
    ):
        self.config = config
        self.world = world
        self.collector = collector
        self.brain = brain
        self.policy = policy
        self.budget = budget or Budget()
        self.tools: dict[str, ToolSpec] = {n: SPECS[n] for n in config.tools}
        self.stats = RunStats()
        self.messages: list[Message] = []
        self.new_messages: list[Message] = []
        self.grants = Grants()
        self.pending: list[dict[str, Any]] = []
        self.last_response = ""
        self.responses: list[str] = []
        self.reset_conversation()

    # ----------------------------------------------------------------- conversation
    def reset_conversation(self) -> None:
        self.grants = Grants()
        self.pending = []
        self.messages = [Message(role="system", content=self.world.system_prompt, provenance=Provenance.SYSTEM)]
        for m in self.world.memory_for():
            self.messages.append(Message(role="system", content=m.value, provenance=Provenance.MEMORY, meta={"source": m.source}))
        for key, tool in self.world.mcp_tools.items():
            self.messages.append(
                Message(role="system", content=self.world.resolve(str(tool.get("description", ""))), provenance=Provenance.TOOL_DESCRIPTION, name=key)
            )
        self.new_messages = list(self.messages[1:])
        if hasattr(self.brain, "reset"):
            self.brain.reset()
        self.collector.emit(
            EventType.FIXTURE,
            "Conversation started",
            output={"principal": self.world.principal, "memory_entries": len(self.world.memory_for())},
            attributes={"agentshield.session_reset": True},
        )

    def user_message(self, text: str) -> None:
        text = self.world.resolve(text)
        msg = Message(role="user", content=text, provenance=Provenance.USER)
        self.messages.append(msg)
        self.new_messages.append(msg)
        self.grants.merge(grants_from_text(text))
        self.collector.emit(EventType.USER_MESSAGE, "User message", input=text, attributes={"gen_ai.operation.name": "chat"})
        if is_confirmation(text) and self.pending:
            self.grants.confirmed += [dict(p) for p in self.pending]
            self.collector.emit(
                EventType.CONFIRMATION,
                "User confirmation",
                input=text,
                output={"confirmed": [dict(p) for p in self.pending]},
            )

    def add_tool_description(self, key: str, description: str) -> None:
        msg = Message(role="system", content=description, provenance=Provenance.TOOL_DESCRIPTION, name=key)
        self.messages.append(msg)
        self.new_messages.append(msg)

    def inject_message(self, content: str, provenance: Provenance = Provenance.AGENT_MESSAGE, name: str | None = None) -> None:
        content = self.world.resolve(content)
        msg = Message(role="user", content=content, provenance=provenance, name=name)
        self.messages.append(msg)
        self.new_messages.append(msg)
        self.collector.emit(
            EventType.AGENT_MESSAGE,
            f"Message from {name or provenance.value}",
            input=content,
            untrusted=True,
            attributes={"agentshield.injection_suspected": looks_like_injection(content), "gen_ai.agent.name": name or ""},
        )

    # ----------------------------------------------------------------- helpers
    def _view(self) -> BrainView:
        return BrainView(
            messages=self.messages,
            new_messages=self.new_messages,
            tools=list(self.tools.values()),
            hardening=self.config.hardening,
            principal=self.world.principal,
            system_prompt=self.world.system_prompt,
            pending=self.pending,
        )

    def _texts(self) -> tuple[list[str], list[str]]:
        trusted, untrusted = [], []
        for m in self.messages:
            if m.provenance == Provenance.MEMORY and m.meta.get("source") == "user":
                trusted.append(m.content)
            elif m.trusted:
                trusted.append(m.content)
            else:
                untrusted.append(m.content)
        return untrusted, trusted

    # ----------------------------------------------------------------- run loop
    def run(self, max_turns: int | None = None) -> str:
        view = self._view()
        self.stats.turn_tool_calls = 0
        self.brain.start_turn(view)
        results: list[ToolResult] = []
        final: str | None = None
        limit = min(max_turns or self.budget.max_iterations, self.budget.max_iterations)
        iterations = 0
        while final is None:
            if iterations >= limit:
                self._terminate("iteration_budget", f"iteration budget reached ({limit})")
                final = "[stopped: iteration budget reached]"
                break
            t0 = time.perf_counter()
            action = self.brain.decide(self._view(), results)
            iterations += 1
            self.stats.iterations += 1
            if action.usage:
                self.stats.usage.add(action.usage)
            tokens = self.stats.usage.input_tokens + self.stats.usage.output_tokens
            self.collector.emit(
                EventType.MODEL,
                "Model decision",
                input={"context_messages": len(self.messages)},
                output=(action.final[:300] if action.final is not None else [f"{c.name}({json.dumps(c.arguments)[:140]})" for c in action.tool_calls]),
                duration_ms=(time.perf_counter() - t0) * 1000,
                attributes={
                    "gen_ai.operation.name": "chat",
                    "gen_ai.request.model": action.model or getattr(self.brain, "name", "unknown"),
                    "gen_ai.usage.input_tokens": action.usage.input_tokens if action.usage else 0,
                    "gen_ai.usage.output_tokens": action.usage.output_tokens if action.usage else 0,
                    "agentshield.usage.estimated": bool(action.usage and action.usage.estimated),
                },
            )
            if tokens > self.budget.max_tokens:
                self._terminate("token_budget", f"token budget exceeded ({tokens} > {self.budget.max_tokens})")
                final = "[stopped: token budget exceeded]"
                break
            if action.final is not None:
                final = action.final
                self.pending = action.pending
                break
            results = []
            for call in action.tool_calls:
                results.append(self._execute(call))
                if self.stats.terminated:
                    break
            if self.stats.terminated:
                final = f"[stopped: {self.stats.terminated.replace('_', ' ')}]"
        self.new_messages = []
        if self.config.hardening.secret_guard:
            final = redact_canaries(final, self.world.canaries)
        self.messages.append(Message(role="assistant", content=final, provenance=Provenance.ASSISTANT))
        self.collector.emit(EventType.FINAL, "Final response", output=final)
        self.last_response = final
        self.responses.append(final)
        return final

    def _terminate(self, reason: str, detail: str) -> None:
        self.stats.terminated = reason
        self.collector.emit(EventType.BUDGET, "Budget limit reached", output=detail, status="error", attributes={"agentshield.budget": reason})

    # ----------------------------------------------------------------- tool execution
    def _execute(self, call: ToolCall) -> ToolResult:
        name = call.name
        spec = self.tools.get(name)
        if spec is None:
            self.collector.emit(EventType.ERROR, f"Unknown tool {name}", input=call.arguments, status="error", executed=False)
            return ToolResult(call.id, name, error="tool_not_available")
        if self.stats.tool_calls >= self.budget.max_tool_calls:
            self._terminate("tool_call_budget", f"tool call budget reached ({self.budget.max_tool_calls})")
            return ToolResult(call.id, name, error="budget_exceeded", blocked=True)
        self.stats.tool_calls += 1
        self.stats.turn_tool_calls += 1
        h = self.config.hardening
        args = dict(call.arguments)
        attrs: dict[str, Any] = {"gen_ai.operation.name": "execute_tool", "gen_ai.tool.name": name, "gen_ai.tool.call.id": call.id}

        untrusted, trusted = self._texts()
        if h.secret_guard and spec.effect != "read":
            filtered = redact_canaries(args, self.world.canaries)
            if filtered != args:
                attrs["agentshield.dlp_redacted"] = True
                args = filtered

        if h.output_sanitizer and name == "render_html":
            args["html"] = sanitize_html(str(args.get("html", "")))
            attrs["agentshield.sanitized"] = True

        decision: PolicyDecision | None = None
        if self.policy:
            decision = self.policy.evaluate(
                CallContext(
                    tool=name,
                    args=args,
                    spec=spec,
                    world=self.world,
                    grants=self.grants,
                    untrusted_texts=untrusted,
                    trusted_texts=trusted,
                    tool_call_count=self.stats.tool_calls - 1,
                    iteration=self.stats.iterations,
                )
            )

        app_block: str | None = None
        tainted_memory = name == "memory_write" and is_tainted(str(args.get("value", "")), untrusted, trusted)
        if h.memory_guard and tainted_memory:
            app_block = "memory_guard: refused to persist content derived from untrusted input"
        elif h.loop_guard and self.stats.turn_tool_calls > LOOP_GUARD_MAX_CALLS:
            app_block = f"loop_guard: more than {LOOP_GUARD_MAX_CALLS} tool calls in one request"

        policy_block = bool(decision and decision.blocked)
        executed = not (policy_block or app_block)
        status = "ok"
        if not executed:
            status = "blocked"
        elif decision and decision.violated:
            status = "violation"
        self.collector.emit(
            EventType.TOOL_CALL,
            name,
            input=args,
            executed=executed,
            status=status,
            policy=decision,
            attributes={**attrs, **({"agentshield.app_defense": app_block} if app_block else {})},
        )
        if decision and decision.violated:
            titles = ", ".join(v.rule_id for v in decision.violations)
            self.collector.emit(
                EventType.POLICY,
                "Policy enforcement" if policy_block else "Policy violation",
                input={"tool": name, "arguments": args},
                output={"decision": decision.decision, "violations": [v.model_dump(mode="json") for v in decision.violations]},
                status="blocked" if policy_block else "violation",
                policy=decision,
                attributes={"agentshield.policy.rules": titles},
            )
        if not executed:
            self.stats.blocked_calls += 1
            reason = app_block or "blocked_by_policy: " + ", ".join(v.rule_id for v in (decision.violations if decision else []))
            msg = Message(role="tool", content=json.dumps({"error": reason}), provenance=Provenance.TOOL_RESULT, name=name)
            self.messages.append(msg)
            return ToolResult(call.id, name, error=reason, blocked=True)

        t0 = time.perf_counter()
        ctx = ToolContext(
            world=self.world,
            acl_enforced=h.acl_retrieval,
            sanitize_output=h.output_sanitizer,
            tainted_memory=tainted_memory,
        )
        try:
            data = HANDLERS[name](ctx, args)
            err = None
        except Exception as e:  # tool bugs must not crash the run
            data, err = None, f"tool_error: {e}"
        res = ToolResult(call.id, name, data=data, error=err)
        content = res.content
        retrieval = name in RETRIEVAL_TOOLS
        prov = Provenance.RETRIEVED if retrieval else Provenance.TOOL_RESULT
        self.messages.append(Message(role="tool", content=content[:6000], provenance=prov, name=name))
        self.collector.emit(
            EventType.RETRIEVAL if retrieval else EventType.TOOL_RESULT,
            f"{name} result",
            input=args,
            output=data if err is None else err,
            duration_ms=(time.perf_counter() - t0) * 1000,
            untrusted=True,
            status="error" if err else "ok",
            attributes={
                **attrs,
                **({"gen_ai.operation.name": "retrieval"} if retrieval else {}),
                "agentshield.injection_suspected": looks_like_injection(content),
            },
        )
        return res
