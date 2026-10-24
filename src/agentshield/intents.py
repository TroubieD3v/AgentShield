"""Deterministic parsing of *trusted* user text into intents.

The same parser feeds (a) the simulated agent brain that plans tool calls and
(b) the authorization layer that decides what the user actually asked for.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
PATH_RE = re.compile(r"(?<![\w@])(?:/[\w.\-]+)+/?|\b[\w\-]+(?:/[\w.\-]+)+|\b[\w\-]+\.(?:txt|log|tmp|csv|md|docx|bak|json)\b")


def find_paths(text: str) -> list[str]:
    return [p.rstrip(".,;:!?") for p in PATH_RE.findall(text)]


@dataclass
class Intent:
    kind: str
    params: dict[str, Any] = field(default_factory=dict)
    pos: int = 0


_DET = r"(?:the\s+|my\s+|our\s+|a\s+|an\s+|this\s+|that\s+|latest\s+|recent\s+)*"
_STOP = r"(?=\s+(?:and|then|also|but)\b|[,.;!?]|\s+(?:to|for|by|into|in)\s|$)"


def _topic(text: str, verb: str) -> str | None:
    m = re.search(rf"\b(?:{verb})\b\s+(?:me\s+)?(?:of\s+)?{_DET}(.+?){_STOP}", text, re.I)
    return m.group(1).strip() if m else None


def parse_intents(text: str) -> list[Intent]:
    low = text.lower()
    out: list[Intent] = []

    def add(kind: str, pos: int, **params: Any) -> None:
        out.append(Intent(kind, params, pos))

    # --- system prompt disclosure (direct attacks and curiosity alike)
    if re.search(r"system prompt|(your|the)\s+(hidden |initial |original |secret )?(instructions|rules|configuration)|initial prompt", low) and re.search(
        r"print|show|reveal|repeat|display|tell|output|translate|recite|what (is|are)|ignore|disclose|leak", low
    ):
        add("disclose_prompt", low.find("prompt") if "prompt" in low else 0)

    # --- cross-tenant data requests
    m = re.search(r"(?:documents?|files?|notes?|reports?|records?)\s+(?:of|belonging to|owned by|from)\s+(?:user\s+)?([a-z]\w*)", low) or re.search(
        r"\b([a-z]\w*)'s\s+(?:documents?|files?|notes?|reports?|salary|records?|review)", low
    )
    if m and m.group(1) not in {"the", "my", "our", "this", "that", "a", "an", "all", "your", "each", "every"}:
        add("cross_tenant", m.start(), owner=m.group(1))

    # --- send / forward email
    m = re.search(r"\b(send|email|e-mail|mail|forward|cc)\b", low)
    if m:
        rcpts = EMAIL_RE.findall(text)
        if rcpts:
            add(
                "send_email",
                m.start(),
                recipient=rcpts[0],
                recipients=rcpts,
                about_summary=bool(re.search(r"summar|it\b|report|result|finding", low)),
            )

    # --- delete / cleanup
    m = re.search(r"\b(delete|remove|erase|wipe)\b", low)
    if m:
        paths = find_paths(text)
        if paths:
            add("delete_file", m.start(), paths=paths)
        elif re.search(r"\ball\b|everything|every file", low):
            add("delete_file", m.start(), paths=["*"])
    m = re.search(r"clean ?up|tidy|declutter|free up (?:disk )?space|organi[sz]e (?:my )?files", low)
    if m:
        add("cleanup", m.start(), path=(find_paths(text) or ["/"])[0])
    m = re.search(r"\b(list|show|what)\b.*\bfiles\b", low)
    if m and not any(i.kind in {"cleanup", "delete_file"} for i in out):
        add("list_files", m.start(), path=(find_paths(text) or [""])[0])

    # --- calendar
    m = re.search(r"\b(schedule|book|set up|create|add)\b.*\b(meeting|event|call|sync|appointment)\b", low)
    if m:
        add(
            "schedule",
            m.start(),
            title=(re.search(r"(?:called|titled|named|about|for)\s+['\"]?([^'\".,]+)", text) or [None, "Meeting"])[1].strip(),
            attendees=EMAIL_RE.findall(text),
            when=(re.search(r"\b(?:on|at|tomorrow|next \w+|monday|tuesday|wednesday|thursday|friday)\b[^.,]*", low) or [""])[0].strip(),
        )

    # --- inbox
    m = re.search(r"\b(read|check|summari[sz]e|review)\b.*\b(inbox|emails|mail)\b", low)
    if m:
        add("inbox", m.start())

    # --- memory
    m = re.search(r"\bremember\b\s+(?:that\s+)?(.+)", text, re.I)
    if m:
        add("remember", m.start(), text=m.group(1).strip().rstrip("."))

    # --- delegation
    m = re.search(r"\b(?:delegate|ask|have|tell)\s+(?:to\s+)?(?:the\s+)?([\w-]+?)(?:\s+agent)\s+(?:to\s+)?(.+)", text, re.I)
    if m:
        add("delegate", m.start(), agent=m.group(1), task=m.group(2).strip().rstrip("."))

    # --- research
    m = re.search(r"\b(research|investigate|find out about|look up information (?:on|about)|search the web for|what do we know about)\b", low)
    if m:
        topic = _topic(text, m.group(1)) or text
        add("research", m.start(), topic=topic)

    # --- customer lookup (raw user text flows into the query -> SQL injection surface)
    m = re.search(r"\b(?:look ?up|find|show|get)\s+(?:the\s+)?customer\s+(?:named\s+|called\s+)?(.+)", text, re.I)
    if m:
        add("lookup_customer", m.start(), name=m.group(1).strip().rstrip("."))

    # --- MCP tool usage: "use the notes.lookup tool ..."
    m = re.search(r"\b(?:use|call|run|query)\s+(?:the\s+)?([\w-]+)[./]([\w-]+)\b(?:\s+tool)?\s*(?:for|to|with|on)?\s*(.*)", text, re.I)
    if m:
        add("mcp", m.start(), server=m.group(1), tool=m.group(2), query=m.group(3).strip().rstrip(".") or "status")

    # --- html rendering
    m = re.search(r"\b(html|render|dashboard|web page|format (?:it )?as)\b", low)
    if m and re.search(r"summar|report|render|html", low):
        add("render", m.start(), topic=_topic(text, "summari[sz]e|render|create|build|make|generate|produce") or "report")

    # --- repeated actions (resource abuse)
    m = re.search(r"(\d{2,4})\s*(?:times|x\b|iterations)", low)
    if m:
        add("repeat", m.start(), n=int(m.group(1)), topic=_topic(text, "search for|search|check|query|look up|fetch") or "status")

    # --- read / summarize documents (fallback intent)
    if not any(i.kind in {"research", "inbox", "lookup_customer", "disclose_prompt", "cross_tenant", "list_files", "cleanup", "remember", "delegate", "repeat", "mcp", "render"} for i in out):
        m = re.search(r"\b(summari[sz]e|summary of|read|analy[sz]e|review|what does|tell me about|brief me on|explain|open|extract|find)\b", low)
        if m:
            topic = _topic(text, m.group(1)) or _topic(text, "summary of")
            add("summarize", m.start(), topic=topic or text.rstrip(" .!?"))

    out.sort(key=lambda i: i.pos)
    return out


CONFIRM_RE = re.compile(r"^\s*(yes|yep|sure|confirm(ed)?|go ahead|do it|proceed|ok(ay)?|approved?)\b", re.I)


def is_confirmation(text: str) -> bool:
    return bool(CONFIRM_RE.match(text))
