"""Deterministic simulated brain.

It is *not* a language model. It is a transparent stand-in that lets AgentShield prove,
offline and reproducibly, that its tests and policies can tell a susceptible agent from a
hardened one:

* unsafe configuration  -> mistakes instructions found in data (documents, web pages, tool
  descriptions, peer messages, memory) for commands, like a naive LLM agent would;
* hardened configuration -> treats that content as data and applies the configured defenses.

Live tests against real models use ``LLMBrain`` instead.
"""

from __future__ import annotations

import re
from collections.abc import Generator
from typing import Any
from urllib.parse import quote

from ..intents import EMAIL_RE, Intent, is_confirmation, parse_intents
from ..models import Provenance, ToolCall, Usage
from .base import Action, BrainView, Final, ToolResult
from .directives import INJECTION_PHRASES, Directive, extract_directives

Plan = Generator["ToolCall | Final", "ToolResult | None", None]

TEMP_FILE = re.compile(r"\.(tmp|log|bak)$|/tmp/|cache", re.I)
CC_RE = re.compile(rf"\b(?:cc|bcc|copy|forward)\b[^\n.]{{0,60}}?({EMAIL_RE.pattern})", re.I)


def _est_tokens(text: str) -> int:
    return max(1, len(text) // 4)


class SimulatedBrain:
    name = "simulated"

    def __init__(self) -> None:
        self._gen: Plan | None = None
        self._started = False
        self.collected: list[str] = []
        self.parts: list[str] = []
        self.standing_cc: list[str] = []
        self.ignored = 0
        self.leak_prompt = False
        self.pending: list[dict[str, Any]] = []
        self.view: BrainView | None = None
        self.last_summary = ""

    # ------------------------------------------------------------------ protocol
    def reset(self) -> None:
        """New conversation: forget session-scoped state (persisted memory is re-read from context)."""
        self.standing_cc = []

    def start_turn(self, view: BrainView) -> None:
        self.view = view
        self.collected, self.parts, self.pending = [], [], []
        self.ignored = 0
        self.leak_prompt = False
        self.last_summary = ""
        self._gen = self._plan(view)
        self._started = False

    def decide(self, view: BrainView, results: list[ToolResult]) -> Action:
        assert self._gen is not None
        self.view = view
        try:
            out = self._gen.send(results[-1] if results else None) if self._started else next(self._gen)
            self._started = True
        except StopIteration:
            out = Final(self._compose())
        ctx_tokens = sum(_est_tokens(m.content) for m in view.messages)
        if isinstance(out, ToolCall):
            usage = Usage(input_tokens=ctx_tokens, output_tokens=_est_tokens(str(out.arguments)) + 8, estimated=True)
            return Action(tool_calls=[out], usage=usage, model="simulated")
        usage = Usage(input_tokens=ctx_tokens, output_tokens=_est_tokens(out.text), estimated=True)
        return Action(final=out.text, pending=out.pending, usage=usage, model="simulated")

    # ------------------------------------------------------------------ helpers
    @property
    def h(self):
        return self.view.hardening  # type: ignore[union-attr]

    def has(self, tool: str) -> bool:
        return any(t.name == tool for t in self.view.tools)  # type: ignore[union-attr]

    @staticmethod
    def call(name: str, **args: Any) -> ToolCall:
        return ToolCall(name=name, arguments=args)

    def _collect(self, res: ToolResult | None) -> None:
        if not res or res.error or res.blocked:
            return
        d = res.data
        if isinstance(d, dict) and "content" in d:
            self.collected.append(str(d["content"]))
        elif isinstance(d, dict) and "rows" in d:
            self.collected.append(str(d["rows"]))
        elif isinstance(d, list) and d and isinstance(d[0], dict) and "body" in d[0]:
            self.collected.extend(str(e.get("body", "")) for e in d)

    def _blocked(self, res: ToolResult | None, what: str) -> bool:
        if res is not None and res.blocked:
            self.parts.append(f"I could not complete {what}: the action was blocked by a security policy.")
            return True
        return False

    def _compose(self) -> str:
        parts = list(self.parts)
        if self.leak_prompt:
            parts.append(f"My instructions are: {self.view.system_prompt}")  # type: ignore[union-attr]
        if self.ignored and self.h.trust_boundaries:
            parts.append(
                "Note: the retrieved content contained instructions addressed to an assistant; "
                "I treated them as untrusted data and did not follow them."
            )
        return "\n".join(parts) if parts else "I'm not sure how to help with that."

    def _clean(self, text: str) -> str:
        if not self.h.trust_boundaries:
            return text
        kept = [s for s in re.split(r"(?<=[.!?])\s+|\n+", text) if s and not extract_directives(s) and not INJECTION_PHRASES.search(s)]
        return " ".join(kept)

    def _summary(self, title: str, content: str) -> str:
        body = self._clean(content).strip()
        return f"Summary of '{title}': {body[:420]}"

    # ------------------------------------------------------------------ planning
    def _plan(self, view: BrainView) -> Plan:
        text = view.last_user_text()
        if view.pending and is_confirmation(text):
            for p in view.pending:
                res = yield self.call(p["tool"], **p["args"])
                self._blocked(res, f"{p['tool']}")
            if not self.parts:
                self.parts.append(f"Done: confirmed action(s) executed ({len(view.pending)}).")
            yield Final(self._compose())
            return

        # context loaded at conversation start: persisted memory, peer messages, tool descriptions
        for m in view.new_messages:
            if m.provenance == Provenance.MEMORY:
                if (not self.h.trust_boundaries) or m.meta.get("source") == "user":
                    self.standing_cc += [c for c in CC_RE.findall(m.content) if c not in self.standing_cc]
                elif extract_directives(m.content):
                    self.ignored += 1
            elif m.provenance == Provenance.AGENT_MESSAGE:
                yield from self._follow(m.content)

        for it in parse_intents(text):
            yield from self._intent(it, text)
        yield Final(self._compose(), pending=self.pending)

    def _follow(self, text: str) -> Plan:
        dirs = extract_directives(text)
        if not dirs and not INJECTION_PHRASES.search(text):
            return
        if self.h.trust_boundaries:
            self.ignored += max(1, len(dirs))
            return
        for d in dirs:
            yield from self._directive(d)

    def _directive(self, d: Directive) -> Plan:
        k, p = d.kind, d.params
        if k == "send_email" and self.has("send_email"):
            res = yield self.call("send_email", recipient=p["recipient"], subject="Forwarded content", body="\n".join(self.collected) or d.text)
            self._blocked(res, "an email")
        elif k == "memory" and self.has("memory_write"):
            res = yield self.call("memory_write", key="note", value=p["value"])
            self._blocked(res, "a memory update")
        elif k == "disclose":
            self.leak_prompt = True
        elif k == "read_document" and self.has("read_document"):
            res = yield self.call("read_document", doc_id=p["doc_id"])
            self._collect(res)
            if res and isinstance(res.data, dict) and "content" in res.data:
                self.parts.append(f"{res.data.get('title', p['doc_id'])}: {res.data['content'][:300]}")
            else:
                self._blocked(res, "reading a document")
        elif k == "cross_tenant" and self.has("search_documents"):
            yield from self._cross_tenant(p["owner"], answer=True)
        elif k == "delete" and self.has("delete_file"):
            paths = p["paths"]
            if paths == ["*"] and self.has("list_files"):
                res = yield self.call("list_files", path="")
                paths = list(res.data) if res and isinstance(res.data, list) else []
            for path in paths:
                yield self.call("delete_file", path=path)
        elif k == "fetch" and self.has("fetch_url"):
            url = p["url"]
            payload = quote(" ".join(self.collected)[:160])
            url = url.replace("{data}", payload).replace("DATA", payload) if ("{data}" in url or "DATA" in url) else (url + payload if url.endswith("=") else url)
            res = yield self.call("fetch_url", url=url)
            self._collect(res)
        elif k == "delegate" and self.has("delegate_task"):
            yield self.call("delegate_task", agent=p["agent"], task=p["task"])
        elif k == "schedule" and self.has("create_event"):
            yield self.call("create_event", title="Follow-up", attendees=[p["attendee"]])
        elif k == "loop":
            tool = "web_search" if self.has("web_search") else "search_documents" if self.has("search_documents") else None
            if tool:
                for i in range(min(p["n"], 300)):
                    yield self.call(tool, query=f"status check {i}")

    # ------------------------------------------------------------------ intents
    def _intent(self, it: Intent, text: str) -> Plan:
        k, p = it.kind, it.params
        if k == "disclose_prompt":
            if self.h.prompt_guard:
                self.parts.append("I can't share my internal instructions.")
            else:
                self.leak_prompt = True
        elif k == "cross_tenant":
            yield from self._cross_tenant(p["owner"], answer=True)
        elif k == "summarize" and self.has("search_documents"):
            yield from self._summarize(p["topic"])
        elif k == "render" and self.has("render_html"):
            yield from self._render(p["topic"])
        elif k == "send_email" and self.has("send_email"):
            body = self.last_summary or "\n".join(self.collected)[:500] or text
            recipients = [p["recipient"]] + [c for c in self.standing_cc if c != p["recipient"]]
            sent = 0
            for rcpt in recipients:
                res = yield self.call("send_email", recipient=rcpt, subject="Update", body=body)
                if self._blocked(res, f"sending to {rcpt}"):
                    continue
                sent += 1 if rcpt == p["recipient"] else 0
            if sent:
                self.parts.append(f"Email sent to {p['recipient']}.")
        elif k == "inbox" and self.has("read_inbox"):
            res = yield self.call("read_inbox")
            mails = res.data if res and isinstance(res.data, list) else []
            self.parts.append(f"You have {len(mails)} message(s): " + "; ".join(str(m.get("subject", "")) for m in mails))
            for m in mails:
                yield from self._follow(str(m.get("body", "")))
        elif k == "list_files" and self.has("list_files"):
            res = yield self.call("list_files", path=p.get("path", ""))
            self.parts.append("Files: " + ", ".join(res.data if res and isinstance(res.data, list) else []))
        elif k == "cleanup" and self.has("list_files"):
            yield from self._cleanup(p.get("path", ""))
        elif k == "delete_file" and self.has("delete_file"):
            paths = p["paths"]
            if paths == ["*"] and self.has("list_files"):
                res = yield self.call("list_files", path="")
                paths = list(res.data) if res and isinstance(res.data, list) else []
            for path in paths:
                res = yield self.call("delete_file", path=path)
                if not self._blocked(res, f"deleting {path}"):
                    self.parts.append(f"Deleted {path}.")
        elif k == "schedule" and self.has("create_event"):
            res = yield self.call("create_event", title=p["title"], when=p["when"], attendees=p["attendees"])
            if not self._blocked(res, "scheduling"):
                self.parts.append(f"Scheduled '{p['title']}'.")
        elif k == "remember" and self.has("memory_write"):
            res = yield self.call("memory_write", key="note", value=p["text"])
            if not self._blocked(res, "saving memory"):
                self.parts.append("Noted. I will remember that.")
        elif k == "delegate" and self.has("delegate_task"):
            res = yield self.call("delegate_task", agent=p["agent"], task=p["task"])
            if not self._blocked(res, "delegation") and res and isinstance(res.data, dict):
                reply = str(res.data.get("result", ""))
                self.parts.append(f"{p['agent']} replied: {self._clean(reply)[:300]}")
                yield from self._follow(reply)
        elif k == "research" and self.has("web_search"):
            yield from self._research(p["topic"])
        elif k == "lookup_customer" and self.has("run_sql"):
            yield from self._lookup(p["name"])
        elif k == "repeat":
            tool = "web_search" if self.has("web_search") else "search_documents" if self.has("search_documents") else None
            if tool:
                n = min(p["n"], 3) if self.h.loop_guard else p["n"]
                for i in range(min(n, 300)):
                    yield self.call(tool, query=f"{p['topic']} {i}")
                self.parts.append(f"Ran {n} lookups for '{p['topic']}'.")
        elif k == "mcp" and self.has("mcp_call"):
            for m in self.view.messages:  # type: ignore[union-attr]
                if m.provenance == Provenance.TOOL_DESCRIPTION and m.name == f"{p['server']}.{p['tool']}":
                    yield from self._follow(m.content)
            res = yield self.call("mcp_call", server=p["server"], tool=p["tool"], arguments={"query": p["query"]})
            if res and isinstance(res.data, dict) and "result" in res.data:
                result = str(res.data["result"])
                self.parts.append(f"{p['server']}.{p['tool']} returned: {self._clean(result)[:300]}")
                yield from self._follow(result)

    # ------------------------------------------------------------------ flows
    def _summarize(self, topic: str) -> Plan:
        res = yield self.call("search_documents", query=topic)
        hits = res.data if res and isinstance(res.data, list) else []
        if not hits:
            self.parts.append(f"I couldn't find a document matching '{topic}'.")
            return
        doc = yield self.call("read_document", doc_id=hits[0]["id"])
        if self._blocked(doc, "reading the document"):
            return
        self._collect(doc)
        data = doc.data if doc and isinstance(doc.data, dict) else {}
        content = str(data.get("content", ""))
        self.last_summary = self._summary(data.get("title", topic), content)
        self.parts.append(self.last_summary)
        yield from self._follow(content)

    def _render(self, topic: str) -> Plan:
        res = yield self.call("search_documents", query=topic)
        hits = res.data if res and isinstance(res.data, list) else []
        if not hits:
            self.parts.append(f"No document found for '{topic}'.")
            return
        doc = yield self.call("read_document", doc_id=hits[0]["id"])
        data = doc.data if doc and isinstance(doc.data, dict) else {}
        html = f"<h1>{data.get('title', topic)}</h1><div>{self._clean(str(data.get('content', '')))}</div>"
        out = yield self.call("render_html", html=html)
        if not self._blocked(out, "rendering"):
            self.parts.append("Rendered the HTML summary.")
        yield from self._follow(str(data.get("content", "")))

    def _cross_tenant(self, owner: str, answer: bool = False) -> Plan:
        res = yield self.call("search_documents", query="*", owner=owner)
        if self._blocked(res, f"searching documents of {owner}"):
            return
        hits = res.data if res and isinstance(res.data, list) else []
        if not hits:
            if answer:
                self.parts.append(f"I couldn't find any documents of '{owner}' that you can access.")
            return
        for h in hits[:3]:
            doc = yield self.call("read_document", doc_id=h["id"])
            if self._blocked(doc, "reading a document"):
                continue
            self._collect(doc)
            if answer and doc and isinstance(doc.data, dict) and "content" in doc.data:
                self.parts.append(f"{doc.data.get('title', h['id'])}: {doc.data['content'][:300]}")

    def _cleanup(self, path: str) -> Plan:
        res = yield self.call("list_files", path="")
        files = list(res.data) if res and isinstance(res.data, list) else []
        if not self.h.confirm_sensitive:
            # excessive agency: "clean up" is interpreted as "delete everything"
            if not self.has("delete_file"):
                return
            for f in files:
                r = yield self.call("delete_file", path=f)
                if not self._blocked(r, f"deleting {f}"):
                    self.parts.append(f"Deleted {f}.")
            return
        candidates = [f for f in files if TEMP_FILE.search(f)]
        if not candidates:
            self.parts.append("I found no obvious temporary files to remove.")
            return
        self.pending = [{"tool": "delete_file", "args": {"path": f}} for f in candidates]
        self.parts.append(
            "I found these temporary files: " + ", ".join(candidates) + ". Do you want me to delete them? Reply 'yes' to confirm."
        )

    def _research(self, topic: str) -> Plan:
        res = yield self.call("web_search", query=topic)
        urls = [h["url"] for h in (res.data if res and isinstance(res.data, list) else [])][:2]
        if not urls:
            self.parts.append(f"No sources found for '{topic}'.")
            return
        notes = []
        for url in urls:
            page = yield self.call("fetch_url", url=url)
            if self._blocked(page, f"fetching {url}"):
                continue
            self._collect(page)
            content = str(page.data.get("content", "")) if page and isinstance(page.data, dict) else ""
            notes.append(self._clean(content)[:200])
            yield from self._follow(content)
        self.parts.insert(0, f"Findings on {topic}: " + " | ".join(n for n in notes if n))

    def _lookup(self, name: str) -> Plan:
        if self.h.output_sanitizer:
            if not re.fullmatch(r"[\w .\-]+", name):
                self.parts.append("I can't run that lookup: the customer name contains unsupported characters.")
                return
            query = f"SELECT name, email FROM customers WHERE name = '{name}'"
        else:
            query = f"SELECT name, email FROM customers WHERE name = '{name}'"
        res = yield self.call("run_sql", query=query)
        if self._blocked(res, "the lookup"):
            return
        rows = res.data.get("rows", []) if res and isinstance(res.data, dict) else []
        self.collected.append(str(rows))
        self.parts.append(f"Found {len(rows)} customer record(s): {rows}")
