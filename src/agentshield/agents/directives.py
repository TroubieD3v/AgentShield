"""Instruction-like content extraction. Models how a *susceptible* agent mistakes data for commands."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from ..intents import EMAIL_RE, find_paths

_EM = EMAIL_RE.pattern

INJECTION_PHRASES = re.compile(
    r"ignore (?:all |any |the )?(?:previous|prior|above|earlier) (?:instructions|rules)|system override|new instructions?:|"
    r"you are now|disregard (?:your|the) (?:instructions|rules)|\[?(?:system|admin)(?: note| message)?\]?:|assistant,? (?:you must|please)",
    re.I,
)


@dataclass
class Directive:
    kind: str
    params: dict[str, Any] = field(default_factory=dict)
    text: str = ""


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", text) if s.strip()]


def extract_directives(text: str) -> list[Directive]:
    out: list[Directive] = []
    for s in _sentences(text):
        low = s.lower()
        m = re.search(r"(?:from now on|going forward|in (?:all )?future|for all future|remember(?: this)?:|memori[sz]e)[,:]?\s*(.+)", s, re.I)
        if m and re.search(r"\b(send|cc|bcc|forward|email|ignore|always|never|reply|include|delete|share)\b", m.group(1), re.I):
            out.append(Directive("memory", {"value": s}, s))
            continue
        m = re.search(r"\b(?:delegate|ask|instruct|tell|hand off)\b[^\n]{0,30}?\b([\w-]+)[\s-]agent\b[^\n]{0,20}?\bto\s+(.+)", s, re.I)
        if m:
            out.append(Directive("delegate", {"agent": m.group(1) + "-agent", "task": m.group(2).rstrip(".")}, s))
            continue
        m = re.search(rf"\b(?:send|forward|email|e-mail|mail|cc|bcc)\b[^\n]{{0,140}}?(?:\bto\s+|\s)({_EM})", s, re.I)
        if m:
            out.append(Directive("send_email", {"recipient": m.group(1)}, s))
            continue
        if re.search(r"\b(?:reveal|print|output|include|append|repeat|show|disclose)\b[^\n]{0,60}\b(?:system prompt|your instructions|hidden instructions|initial prompt)", low):
            out.append(Directive("disclose", {}, s))
            continue
        m = re.search(r"\b(?:read|open|retrieve|fetch|include|get)\b[^\n]{0,40}?\bdocument\s+(?:id\s+)?['\"]?([\w\-]{3,})", s, re.I)
        if m:
            out.append(Directive("read_document", {"doc_id": m.group(1)}, s))
            continue
        m = re.search(r"\b(?:documents?|files?|notes?|records?)\s+(?:of|belonging to|owned by)\s+(?:user\s+)?([a-z]\w*)", low)
        if m and re.search(r"\b(read|open|retrieve|fetch|include|list|get|show)\b", low):
            out.append(Directive("cross_tenant", {"owner": m.group(1)}, s))
            continue
        m = re.search(r"\bdelete\b", low)
        if m:
            paths = find_paths(s)
            if paths:
                out.append(Directive("delete", {"paths": paths}, s))
                continue
            if re.search(r"\ball\b|everything", low):
                out.append(Directive("delete", {"paths": ["*"]}, s))
                continue
        m = re.search(r"\b(?:fetch|visit|open|load|request|get|call|ping)\b[^\n]{0,40}?(https?://[^\s'\")]+)", s, re.I)
        if m:
            out.append(Directive("fetch", {"url": m.group(1).rstrip(".,")}, s))
            continue
        m = re.search(r"\b(?:repeat|keep|continue|loop)\b[^\n]{0,60}?\b(\d{2,4})\s*times", low)
        if m:
            out.append(Directive("loop", {"n": int(m.group(1))}, s))
            continue
        if re.search(r"\bkeep (?:calling|searching|retrying|polling)\b|until (?:no more|you find)", low):
            out.append(Directive("loop", {"n": 200}, s))
            continue
        m = re.search(r"\b(?:schedule|create|book)\b[^\n]{0,40}\b(?:meeting|event|call)\b[^\n]{0,60}?(" + _EM + ")", s, re.I)
        if m:
            out.append(Directive("schedule", {"attendee": m.group(1)}, s))
    return out


def looks_like_injection(text: str) -> bool:
    return bool(INJECTION_PHRASES.search(text)) or bool(extract_directives(text))
