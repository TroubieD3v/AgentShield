"""Deterministic policy conditions. Each returns a human-readable reason when it holds, else None."""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from typing import TYPE_CHECKING, Any

import jsonschema

from ..sandbox.tools import DANGEROUS_HTML, UNSAFE_SQL
from ..taint import tainted_values

if TYPE_CHECKING:
    from .engine import CallContext, Policy

# Arguments that *steer* an action (as opposed to payload data such as an email body).
CONTROL_ARGS: dict[str, list[str]] = {
    "send_email": ["recipient"],
    "fetch_url": ["url"],
    "delete_file": ["path"],
    "read_file": ["path"],
    "delegate_task": ["agent", "task"],
    "memory_write": ["value"],
    "create_event": ["attendees"],
    "mcp_call": ["server", "tool"],
    "read_document": ["doc_id"],
}

Condition = Callable[["CallContext", Any, "Policy"], str | None]


def _unauthorized(ctx: CallContext, param: Any, policy: Policy) -> str | None:
    if not param or ctx.spec.effect == "read":
        return None
    if ctx.grants.allows(ctx.tool, ctx.args, ctx.world.user_email()):
        return None
    return f"{ctx.tool} was not requested or confirmed by the user"


def _sensitive_unconfirmed(ctx: CallContext, param: Any, policy: Policy) -> str | None:
    if not param or not ctx.spec.sensitive:
        return None
    return _unauthorized(ctx, True, policy) and f"sensitive action {ctx.tool} lacks explicit user confirmation"


def _external_recipient(ctx: CallContext, param: Any, policy: Policy) -> str | None:
    rcpt = str(ctx.args.get("recipient", "")).lower()
    if not param or "@" not in rcpt:
        return None
    domain = rcpt.rsplit("@", 1)[1]
    if domain in {d.lower() for d in policy.trusted_domains}:
        return None
    return f"recipient domain '{domain}' is outside the trusted set"


def _tainted_args(ctx: CallContext, param: Any, policy: Policy) -> str | None:
    if not param:
        return None
    keys = CONTROL_ARGS.get(ctx.tool, [])
    found = tainted_values(ctx.args, keys, ctx.untrusted_texts, ctx.trusted_texts)
    return f"control arguments originate from untrusted content: {', '.join(found)}" if found else None


def _contains_canary(ctx: CallContext, param: Any, policy: Policy) -> str | None:
    if not param:
        return None
    blob = json.dumps(ctx.args, default=str)
    hits = [n for n, v in ctx.world.canaries.items() if v in blob]
    return f"arguments carry protected data (canary: {', '.join(hits)})" if hits else None


def _schema_invalid(ctx: CallContext, param: Any, policy: Policy) -> str | None:
    if not param:
        return None
    try:
        jsonschema.validate(ctx.args, ctx.spec.parameters)
    except jsonschema.ValidationError as e:
        return f"arguments violate the tool schema: {e.message[:120]}"
    return None


def _acl_violation(ctx: CallContext, param: Any, policy: Policy) -> str | None:
    if not param:
        return None
    me = ctx.world.principal
    if ctx.tool == "read_document":
        d = ctx.world.documents.get(str(ctx.args.get("doc_id", "")))
        if d and not d.accessible_by(me):
            return f"document '{d.id}' belongs to '{d.owner}', caller is '{me}'"
    if ctx.tool == "search_documents":
        owner = ctx.args.get("owner")
        if owner and owner != me:
            return f"cross-tenant search for documents of '{owner}' by '{me}'"
    return None


def _untrusted_memory_write(ctx: CallContext, param: Any, policy: Policy) -> str | None:
    if not param or ctx.tool != "memory_write":
        return None
    found = tainted_values(ctx.args, ["value"], ctx.untrusted_texts, ctx.trusted_texts)
    return f"long-term memory write derived from untrusted content: {found[0]}" if found else None


def _dangerous_html(ctx: CallContext, param: Any, policy: Policy) -> str | None:
    if param and DANGEROUS_HTML.search(str(ctx.args.get("html", ""))):
        return "model output with active content is passed to an HTML renderer unsanitized"
    return None


def _sql_unsafe(ctx: CallContext, param: Any, policy: Policy) -> str | None:
    if param and UNSAFE_SQL.search(str(ctx.args.get("query", ""))):
        return "model-generated SQL contains stacked or tautological statements"
    return None


def _url_not_allowed(ctx: CallContext, param: Any, policy: Policy) -> str | None:
    if not param:
        return None
    url = str(ctx.args.get("url", ""))
    m = re.match(r"https?://([^/:?#]+)", url)
    host = m.group(1).lower() if m else ""
    allowed = {d.lower() for d in policy.allowed_fetch_domains}
    if allowed and host not in allowed:
        return f"fetch of '{host}' is outside the allowed domain set"
    return None


def _budget_exceeded(ctx: CallContext, param: Any, policy: Policy) -> str | None:
    limit = int(param) if param else 0
    if limit and ctx.tool_call_count >= limit:
        return f"tool call budget exceeded ({ctx.tool_call_count + 1} > {limit})"
    return None


CONDITIONS: dict[str, Condition] = {
    "unauthorized": _unauthorized,
    "sensitive_unconfirmed": _sensitive_unconfirmed,
    "external_recipient": _external_recipient,
    "tainted_args": _tainted_args,
    "contains_canary": _contains_canary,
    "schema_invalid": _schema_invalid,
    "acl_violation": _acl_violation,
    "untrusted_memory_write": _untrusted_memory_write,
    "dangerous_html": _dangerous_html,
    "sql_unsafe": _sql_unsafe,
    "url_not_allowed": _url_not_allowed,
    "max_tool_calls": _budget_exceeded,
}
