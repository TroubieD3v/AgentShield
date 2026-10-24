"""Simulated world state for built-in agents. Nothing here touches a real system."""

from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field

LIBRARY = Path(__file__).resolve().parent.parent / "library"
ATTACKER_EMAIL = "external@example.test"

_PLACEHOLDER = re.compile(r"\{\{\s*(canary:[\w\-]+|attacker_email|principal)\s*\}\}")


def canary_value(name: str, seed: str = "agentshield") -> str:
    digest = hashlib.sha256(f"{seed}:{name}".encode()).hexdigest()[:8]
    return f"AS-CANARY-{name.upper().replace('_', '-')}-{digest}"


class Document(BaseModel):
    id: str
    title: str
    content: str
    owner: str
    acl: list[str] = Field(default_factory=list)  # users allowed besides the owner
    tags: list[str] = Field(default_factory=list)

    def accessible_by(self, user: str) -> bool:
        return user == self.owner or user in self.acl or "*" in self.acl


class Email(BaseModel):
    sender: str
    recipient: str
    subject: str = ""
    body: str = ""


class MemoryEntry(BaseModel):
    key: str
    value: str
    source: str = "user"  # user | untrusted
    tainted: bool = False
    owner: str = ""


class CalendarEvent(BaseModel):
    title: str
    when: str = ""
    attendees: list[str] = Field(default_factory=list)


class SinkRecord(BaseModel):
    sink: str  # render_html | run_sql
    payload: str
    dangerous: bool = False
    reason: str = ""


class World(BaseModel):
    seed: str = "agentshield"
    principal: str = "alice"
    users: dict[str, dict[str, Any]] = Field(default_factory=dict)
    documents: dict[str, Document] = Field(default_factory=dict)
    inbox: list[Email] = Field(default_factory=list)
    outbox: list[Email] = Field(default_factory=list)  # mock-sent mail
    files: dict[str, str] = Field(default_factory=dict)
    deleted_files: list[str] = Field(default_factory=list)
    calendar: list[CalendarEvent] = Field(default_factory=list)
    web: dict[str, str] = Field(default_factory=dict)
    memory: list[MemoryEntry] = Field(default_factory=list)
    sinks: list[SinkRecord] = Field(default_factory=list)
    customers: list[dict[str, Any]] = Field(default_factory=list)
    mcp_tools: dict[str, dict[str, Any]] = Field(default_factory=dict)
    delegations: list[dict[str, Any]] = Field(default_factory=list)
    peer_responses: dict[str, str] = Field(default_factory=dict)
    system_prompt: str = "You are a helpful assistant."
    canaries: dict[str, str] = Field(default_factory=dict)

    # ---- helpers -------------------------------------------------------
    def resolve(self, text: str) -> str:
        """Substitute {{canary:x}}, {{attacker_email}} and {{principal}} placeholders."""

        def repl(m: re.Match[str]) -> str:
            token = m.group(1)
            if token == "attacker_email":
                return ATTACKER_EMAIL
            if token == "principal":
                return self.principal
            name = token.split(":", 1)[1]
            value = canary_value(name, self.seed)
            self.canaries[name] = value
            return value

        return _PLACEHOLDER.sub(repl, text)

    def user_email(self, user: str | None = None) -> str:
        user = user or self.principal
        return self.users.get(user, {}).get("email", f"{user}@corp.test")

    def memory_for(self, user: str | None = None) -> list[MemoryEntry]:
        user = user or self.principal
        return [m for m in self.memory if m.owner in ("", user)]

    def add_document(self, doc: Document) -> None:
        doc.content = self.resolve(doc.content)
        doc.title = self.resolve(doc.title)
        self.documents[doc.id] = doc

    def canary_values(self) -> dict[str, str]:
        return dict(self.canaries)


def _read_fixture_text(name: str) -> str:
    path = LIBRARY / "fixtures" / "docs" / name
    if not path.is_file():
        raise FileNotFoundError(f"fixture not found: {name}")
    return path.read_text(encoding="utf-8")


def load_fixture_text(name: str) -> str:
    return _read_fixture_text(name)


def build_world(name: str, seed: str = "agentshield", principal: str | None = None) -> World:
    """Build a world from library/worlds/<name>.yaml."""
    path = LIBRARY / "worlds" / f"{name}.yaml"
    if not path.is_file():
        raise FileNotFoundError(f"world not found: {name}")
    spec = yaml.safe_load(path.read_text(encoding="utf-8"))
    world = World(seed=seed, principal=principal or spec.get("principal", "alice"))
    world.users = spec.get("users", {})
    world.system_prompt = world.resolve(spec.get("system_prompt", world.system_prompt))
    for d in spec.get("documents", []):
        content = d.get("content")
        if content is None and d.get("fixture"):
            content = _read_fixture_text(d["fixture"])
        world.add_document(
            Document(
                id=d["id"],
                title=d["title"],
                content=content or "",
                owner=d["owner"],
                acl=d.get("acl", []),
                tags=d.get("tags", []),
            )
        )
    for e in spec.get("inbox", []):
        world.inbox.append(Email(**{k: world.resolve(v) for k, v in e.items()}))
    world.files = {p: world.resolve(c) for p, c in spec.get("files", {}).items()}
    world.web = {u: world.resolve(c) for u, c in spec.get("web", {}).items()}
    world.customers = [
        {k: (world.resolve(v) if isinstance(v, str) else v) for k, v in c.items()} for c in spec.get("customers", [])
    ]
    for m in spec.get("memory", []):
        world.memory.append(MemoryEntry(**{**m, "value": world.resolve(m["value"])}))
    for c in spec.get("canaries", []):
        world.resolve(f"{{{{canary:{c}}}}}")
    return world
