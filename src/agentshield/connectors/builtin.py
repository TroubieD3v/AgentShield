"""Built-in sandboxed demo agents (full telemetry, full world control)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from ..agents import AgentSession, Budget, SimulatedBrain, get_agent_config
from ..agents.base import Brain
from ..models import EventType, PolicyMode, Provenance, Telemetry
from ..policy import PolicyEngine, load_policy
from ..sandbox.world import Document, Email, MemoryEntry, World, build_world, load_fixture_text
from ..trace import TraceCollector, make_otel_exporter
from .base import Observation

FULL_TELEMETRY = Telemetry(
    tool_calls=True, retrieval=True, memory=True, policy_enforcement=True, world_control=True, response_text=True
)


class BuiltinSession:
    telemetry = FULL_TELEMETRY

    def __init__(self, session: AgentSession, world: World, collector: TraceCollector, mode: str, policy: str, model: str):
        self.session = session
        self.world = world
        self.collector = collector
        self.mode = mode
        self.policy = policy
        self.model = model

    def _text(self, s: dict[str, Any]) -> str:
        if s.get("fixture"):
            return self.world.resolve(load_fixture_text(s["fixture"]).strip())
        return self.world.resolve(s.get("content") or "")

    def execute(self, t: str, s: dict[str, Any]) -> None:
        w, sess = self.world, self.session
        if t == "user_message":
            sess.user_message(s["content"])
        elif t == "confirm":
            sess.user_message(s.get("content") or "Yes, go ahead.")
        elif t == "run_agent":
            sess.run(s.get("max_turns"))
        elif t == "inject_document":
            doc_id = s["document_id"]
            old = w.documents.get(doc_id)
            w.add_document(
                Document(
                    id=doc_id,
                    title=s.get("title") or (old.title if old else doc_id),
                    content=self._text(s),
                    owner=s.get("owner") or (old.owner if old else w.principal),
                    acl=s.get("acl") if s.get("acl") is not None else (old.acl if old else []),
                    tags=old.tags if old else [],
                )
            )
            self.collector.emit(
                EventType.FIXTURE, f"Document injected: {doc_id}", input={"fixture": s.get("fixture"), "document_id": doc_id}, untrusted=True
            )
        elif t == "inject_email":
            w.inbox.append(
                Email(
                    sender=s.get("sender", "newsletter@external.test"),
                    recipient=w.user_email(),
                    subject=s.get("title", "Update"),
                    body=self._text(s),
                )
            )
            self.collector.emit(EventType.FIXTURE, "Email injected into inbox", input={"fixture": s.get("fixture")}, untrusted=True)
        elif t == "inject_web_page":
            w.web[s["url"]] = self._text(s)
            self.collector.emit(EventType.FIXTURE, f"Web page injected: {s['url']}", input={"fixture": s.get("fixture")}, untrusted=True)
        elif t == "register_mcp_tool":
            key = f"{s['server']}.{s['tool']}"
            desc = w.resolve(s.get("description") or "")
            w.mcp_tools[key] = {"description": desc, "result": self._text(s) if (s.get("content") or s.get("fixture")) else "ok"}
            sess.add_tool_description(key, desc)
            self.collector.emit(EventType.FIXTURE, f"MCP tool registered: {key}", input={"description": desc}, untrusted=True)
        elif t == "peer_response":
            w.peer_responses[s["agent"]] = self._text(s)
        elif t == "agent_message":
            sess.inject_message(self._text(s), Provenance.AGENT_MESSAGE, name=s.get("from", "peer-agent"))
        elif t == "set_memory":
            source = s.get("source", "user")
            w.memory.append(
                MemoryEntry(key=s.get("key", "note"), value=w.resolve(s.get("value") or s.get("content") or ""), source=source, tainted=source != "user", owner=w.principal)
            )
        elif t == "add_file":
            w.files[s["path"]] = self._text(s)
        elif t == "new_session":
            sess.reset_conversation()
        elif t == "switch_principal":
            w.principal = s["user"]
            sess.reset_conversation()
        else:  # pragma: no cover - guarded by schema
            raise ValueError(f"unsupported step {t}")

    def observe(self) -> Observation:
        return Observation(
            trace=self.collector.trace,
            telemetry=self.telemetry,
            responses=list(self.session.responses),
            world=self.world,
            stats=self.session.stats,
            principal=self.world.principal,
            mode=self.mode,
            policy=self.policy,
            model=self.model,
            canaries=dict(self.world.canaries),
        )


class BuiltinTarget:
    kind = "builtin"
    telemetry = FULL_TELEMETRY

    def __init__(
        self,
        variant: str = "unsafe",
        mode: str = "monitor",
        policy: str = "default",
        brain_factory: Callable[[], Brain] | None = None,
        budget: Budget | None = None,
        model: str = "simulated",
        otel: bool = False,
    ):
        self.variant = variant
        self.mode = PolicyMode(mode)
        self.policy_name = policy
        self.brain_factory = brain_factory or SimulatedBrain
        self.budget = budget or Budget()
        self.model = model
        self.name = f"builtin:{variant}"
        self._otel = make_otel_exporter() if otel else None

    def open(self, agent: str, principal: str | None, seed: str) -> BuiltinSession:
        cfg = get_agent_config(f"{agent}:{self.variant}")
        world = build_world(cfg.world, seed=seed, principal=principal or cfg.principal)
        collector = TraceCollector(otel_exporter=self._otel)
        engine = PolicyEngine(load_policy(self.policy_name), self.mode)
        session = AgentSession(cfg, world, collector, self.brain_factory(), engine, Budget(**self.budget.model_dump()))
        return BuiltinSession(session, world, collector, self.mode.value, self.policy_name, self.model)
