"""Secret redaction for everything that is persisted or exported (traces, reports, logs).

Synthetic canary tokens (``AS-CANARY-*``) are deliberately *not* redacted: they are
fake by construction and are the evidence of a leak.
"""

from __future__ import annotations

import re
import threading
from typing import Any

_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\bsk-[A-Za-z0-9_\-]{16,}\b"),
    re.compile(r"\bBearer\s+[A-Za-z0-9._\-~+/=]{12,}"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b"),
    re.compile(r"\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\b"),
    re.compile(r"(?i)\b(api[_-]?key|secret|token|password)\b(\s*[=:]\s*)([^\s,;\"']{6,})"),
]

_lock = threading.Lock()
_registered: set[str] = set()
REDACTED = "[REDACTED]"


def register_secret(value: str | None) -> None:
    """Register an exact secret value (e.g. an API key loaded from the environment)."""
    if value and len(value) >= 6:
        with _lock:
            _registered.add(value)


def redact_text(text: str) -> str:
    if not text:
        return text
    with _lock:
        known = sorted(_registered, key=len, reverse=True)
    for secret in known:
        if secret in text:
            text = text.replace(secret, REDACTED)
    for pat in _PATTERNS:
        if pat.groups >= 3:
            text = pat.sub(
                lambda m: m.group(0) if m.group(3).startswith("AS-CANARY-") else f"{m.group(1)}{m.group(2)}{REDACTED}", text
            )
        else:
            text = pat.sub(REDACTED, text)
    return text


def redact(obj: Any) -> Any:
    """Deep-redact any JSON-like structure."""
    if isinstance(obj, str):
        return redact_text(obj)
    if isinstance(obj, dict):
        return {k: (REDACTED if _is_secret_key(k) and isinstance(v, str) else redact(v)) for k, v in obj.items()}
    if isinstance(obj, list):
        return [redact(v) for v in obj]
    if isinstance(obj, tuple):
        return [redact(v) for v in obj]
    return obj


def _is_secret_key(key: Any) -> bool:
    return isinstance(key, str) and key.lower() in {
        "api_key",
        "apikey",
        "authorization",
        "password",
        "secret",
        "access_token",
        "x-api-key",
    }
