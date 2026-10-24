"""AgentShield SDK: put the policy engine in the real call path of your own agent.

Third-party apps connected only over HTTP cannot be blocked from outside. To get true Enforce mode you
route tool calls through ``Guard`` (in-process) or the ``/api/guard/evaluate`` endpoint (any language).

    guard = Guard(policy="default", mode="enforce")
    guard.user_message("Summarize the quarterly report.")
    guard.untrusted(retrieved_document_text)

    @guard.tool("send_email", effect="external", sensitive=True)
    def send_email(recipient: str, subject: str = "", body: str = ""): ...

    send_email(recipient="external@example.test", body="...")   # raises PolicyBlocked
"""

from __future__ import annotations

import functools
import inspect
from collections.abc import Callable
from typing import Any

from .authorization import Grants, grants_from_text
from .intents import is_confirmation
from .models import EventType, PolicyDecision, PolicyMode
from .policy import CallContext, PolicyEngine, load_policy
from .sandbox.tools import SPECS, ToolSpec
from .sandbox.world import Document, World
from .trace import Trace, TraceCollector


class PolicyBlocked(Exception):
    def __init__(self, decision: PolicyDecision):
        self.decision = decision
        super().__init__("; ".join(f"{v.rule_id}: {v.reason}" for v in decision.violations))


class Guard:
    def __init__(self, policy: str = "default", mode: str = "monitor", principal: str = "user", canaries: dict[str, str] | None = None):
        self.engine = PolicyEngine(load_policy(policy), PolicyMode(mode))
        self.world = World(principal=principal, canaries=dict(canaries or {}))
        self.collector = TraceCollector()
        self.grants = Grants()
        self.trusted: list[str] = []
        self.untrusted_texts: list[str] = []
        self.pending: list[dict[str, Any]] = []
        self.calls = 0

    # ---- context the policy needs -------------------------------------------------
    def user_message(self, text: str) -> None:
        self.trusted.append(text)
        self.grants.merge(grants_from_text(text))
        if is_confirmation(text) and self.pending:
            self.grants.confirmed += self.pending
            self.pending = []
        self.collector.emit(EventType.USER_MESSAGE, "User message", input=text)

    def untrusted(self, text: str, source: str = "retrieved") -> None:
        self.untrusted_texts.append(text)
        self.collector.emit(EventType.RETRIEVAL, f"Untrusted content ({source})", input=text[:500], untrusted=True)

    def add_document(self, doc_id: str, owner: str, content: str = "", acl: list[str] | None = None) -> None:
        self.world.documents[doc_id] = Document(id=doc_id, title=doc_id, content=content, owner=owner, acl=acl or [])

    def ask_confirmation(self, tool: str, **args: Any) -> None:
        """Record that the agent asked the user to confirm a sensitive call; the next 'yes' grants it."""
        self.pending.append({"tool": tool, "args": args})

    # ---- evaluation ---------------------------------------------------------------
    def evaluate(self, tool: str, args: dict[str, Any], spec: ToolSpec | None = None) -> PolicyDecision:
        spec = spec or SPECS.get(tool) or ToolSpec(name=tool, description="", effect="external", sensitive=True)
        decision = self.engine.evaluate(
            CallContext(
                tool=tool,
                args=args,
                spec=spec,
                world=self.world,
                grants=self.grants,
                untrusted_texts=self.untrusted_texts,
                trusted_texts=self.trusted,
                tool_call_count=self.calls,
            )
        )
        self.calls += 1
        self.collector.emit(
            EventType.TOOL_CALL,
            tool,
            input=args,
            executed=not decision.blocked,
            status="blocked" if decision.blocked else ("violation" if decision.violated else "ok"),
            policy=decision,
        )
        return decision

    def tool(self, name: str | None = None, effect: str = "external", sensitive: bool = False) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
        def deco(fn: Callable[..., Any]) -> Callable[..., Any]:
            tool_name = name or fn.__name__
            spec = SPECS.get(tool_name) or ToolSpec(name=tool_name, description=fn.__doc__ or "", effect=effect, sensitive=sensitive)

            @functools.wraps(fn)
            def wrapper(*a: Any, **kw: Any) -> Any:
                bound = inspect.signature(fn).bind_partial(*a, **kw)
                decision = self.evaluate(tool_name, dict(bound.arguments), spec)
                if decision.blocked:
                    raise PolicyBlocked(decision)
                return fn(*a, **kw)

            return wrapper

        return deco

    @property
    def trace(self) -> Trace:
        return self.collector.trace
