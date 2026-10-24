"""Agent configurations: three demo agents, each with an intentionally unsafe and a hardened variant."""

from __future__ import annotations

from pydantic import BaseModel, Field


class Hardening(BaseModel):
    trust_boundaries: bool = False  # retrieved/tool/peer/memory content is data, never instructions
    acl_retrieval: bool = False  # retrieval filters by the caller's identity
    confirm_sensitive: bool = False  # ask before ambiguous sensitive actions
    memory_guard: bool = False  # never persist instructions derived from untrusted content
    output_sanitizer: bool = False  # validate/sanitize model output before it reaches sinks
    secret_guard: bool = False  # DLP filter on responses and outbound tool arguments
    prompt_guard: bool = False  # refuse to disclose the system prompt
    loop_guard: bool = False  # cap repeated / runaway tool calls

    @classmethod
    def unsafe(cls) -> Hardening:
        return cls()

    @classmethod
    def hardened(cls) -> Hardening:
        return cls(**{k: True for k in cls.model_fields})

    @classmethod
    def partial(cls) -> Hardening:
        """A typical first round of fixes: some defenses added, others still missing."""
        return cls(trust_boundaries=True, acl_retrieval=True, prompt_guard=True)


class AgentConfig(BaseModel):
    name: str
    variant: str = "unsafe"  # unsafe | partial | hardened
    title: str = ""
    description: str = ""
    world: str
    tools: list[str]
    hardening: Hardening = Field(default_factory=Hardening)
    principal: str = "alice"

    @property
    def ref(self) -> str:
        return f"{self.name}:{self.variant}"


_DEFS = {
    "document-assistant": dict(
        title="Document Assistant",
        description="RAG assistant over a multi-user document store. Surfaces prompt injection, retrieval isolation and data leakage risks.",
        world="document-assistant",
        tools=["search_documents", "read_document", "send_email", "render_html"],
    ),
    "office-assistant": dict(
        title="Office Assistant",
        description="Mock email, calendar and files. Surfaces tool misuse, excessive agency and missing confirmations.",
        world="office-assistant",
        tools=["read_inbox", "send_email", "list_files", "read_file", "delete_file", "create_event", "memory_write", "memory_read"],
    ),
    "research-agent": dict(
        title="Research Agent",
        description="Multi-tool agent with memory, delegation, MCP tools and an analytics database. Surfaces memory poisoning and multi-step attacks.",
        world="research-agent",
        tools=["web_search", "fetch_url", "memory_write", "memory_read", "delegate_task", "run_sql", "mcp_call"],
    ),
}


VARIANTS = ("unsafe", "partial", "hardened")


def agent_names() -> list[str]:
    return list(_DEFS)


def get_agent_config(ref: str) -> AgentConfig:
    """`name` or `name:variant` (variant: unsafe | hardened)."""
    name, _, variant = ref.partition(":")
    variant = variant or "unsafe"
    if name not in _DEFS:
        raise KeyError(f"unknown agent '{name}' (known: {', '.join(_DEFS)})")
    if variant not in VARIANTS:
        raise KeyError(f"unknown variant '{variant}' ({' | '.join(VARIANTS)})")
    hard = {"hardened": Hardening.hardened, "partial": Hardening.partial, "unsafe": Hardening.unsafe}[variant]()
    return AgentConfig(name=name, variant=variant, hardening=hard, **_DEFS[name])


def all_agent_refs() -> list[str]:
    return [f"{n}:{v}" for n in _DEFS for v in VARIANTS]


def agents_info() -> list[dict]:
    out = []
    for name, d in _DEFS.items():
        out.append(
            {
                "name": name,
                "title": d["title"],
                "description": d["description"],
                "tools": d["tools"],
                "variants": [
                    {"variant": v, "hardening": get_agent_config(f"{name}:{v}").hardening.model_dump()} for v in VARIANTS
                ],
            }
        )
    return out
