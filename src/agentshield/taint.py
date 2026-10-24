"""Lightweight taint analysis: did a value originate in untrusted content rather than from the user?"""

from __future__ import annotations

import re
from typing import Any


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.lower()).strip()


def is_tainted(value: str, untrusted: list[str], trusted: list[str], window: int = 5) -> bool:
    v = _norm(value)
    if len(v) < 4:
        return False
    trusted_n = [_norm(t) for t in trusted]
    untrusted_n = [_norm(u) for u in untrusted]
    if any(v in t for t in trusted_n):
        return False
    if any(v in u for u in untrusted_n):
        return True
    words = v.split()
    if len(words) >= window:
        blob = " | ".join(untrusted_n)
        trusted_blob = " | ".join(trusted_n)
        for i in range(len(words) - window + 1):
            shingle = " ".join(words[i : i + window])
            if shingle in blob and shingle not in trusted_blob:
                return True
    return False


def string_leaves(obj: Any) -> list[str]:
    if isinstance(obj, str):
        return [obj]
    if isinstance(obj, dict):
        return [s for v in obj.values() for s in string_leaves(v)]
    if isinstance(obj, list | tuple):
        return [s for v in obj for s in string_leaves(v)]
    return []


def tainted_values(args: dict[str, Any], keys: list[str], untrusted: list[str], trusted: list[str]) -> list[str]:
    found = []
    for k in keys:
        if k in args:
            for s in string_leaves(args[k]):
                if is_tainted(s, untrusted, trusted):
                    found.append(f"{k}={s[:80]!r}")
    return found
