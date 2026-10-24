"""What did the *user* actually authorize? Derived only from trusted user messages."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from .intents import parse_intents


class Grants(BaseModel):
    tools: set[str] = Field(default_factory=set)
    recipients: set[str] = Field(default_factory=set)
    paths: set[str] = Field(default_factory=set)
    agents: set[str] = Field(default_factory=set)
    confirmed: list[dict[str, Any]] = Field(default_factory=list)  # explicit confirmations

    def merge(self, other: Grants) -> None:
        self.tools |= other.tools
        self.recipients |= other.recipients
        self.paths |= other.paths
        self.agents |= other.agents
        self.confirmed += other.confirmed

    def allows(self, tool: str, args: dict[str, Any], principal_email: str = "") -> bool:
        for c in self.confirmed:
            if c.get("tool") == tool and all(args.get(k) == v for k, v in c.get("args", {}).items()):
                return True
        if tool not in self.tools:
            return False
        if tool == "send_email":
            rcpt = str(args.get("recipient", "")).lower()
            return rcpt in {r.lower() for r in self.recipients} or (bool(principal_email) and rcpt == principal_email.lower())
        if tool == "delete_file":
            return "*" in self.paths or args.get("path") in self.paths
        if tool == "delegate_task":
            return str(args.get("agent", "")).lower() in {a.lower() for a in self.agents}
        return True


def grants_from_text(text: str) -> Grants:
    g = Grants()
    for it in parse_intents(text):
        p = it.params
        if it.kind == "send_email":
            g.tools.add("send_email")
            g.recipients.update(p["recipients"])
        elif it.kind == "delete_file":
            g.tools.add("delete_file")
            g.paths.update(p["paths"])
        elif it.kind == "schedule":
            g.tools.add("create_event")
        elif it.kind == "remember":
            g.tools.add("memory_write")
        elif it.kind == "delegate":
            g.tools.add("delegate_task")
            g.agents.add(p["agent"])
        elif it.kind in {"research", "repeat"}:
            g.tools.update({"web_search", "fetch_url"})
        elif it.kind == "mcp":
            g.tools.add("mcp_call")
        elif it.kind == "render":
            g.tools.add("render_html")
        elif it.kind == "lookup_customer":
            g.tools.add("run_sql")
    return g
