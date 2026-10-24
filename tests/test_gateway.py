"""Model gateway: allowlist, redirects, request budget, key redaction, and an LLM-driven run against a fake server."""

import json

import httpx
import pytest

from agentshield.gateway import AllowList, HostNotAllowed, ModelClient, ModelSpec, RateLimiter
from agentshield.gateway.llm_brain import LLMBrain
from agentshield.gateway.registry import registry
from agentshield.models import Status
from agentshield.redaction import redact_text
from agentshield.results import RunConfig
from agentshield.scenarios import load_scenarios
from agentshield.service import run_config


def test_allowlist_denies_unlisted_metadata_and_bad_schemes():
    al = AllowList(["localhost", "*.corp.test"])
    assert al.check("http://localhost:11434/v1") == "localhost"
    assert al.check("https://llm.corp.test/v1") == "llm.corp.test"
    for bad in ("http://example.com/", "http://169.254.169.254/latest/meta-data", "file:///etc/passwd", "ftp://localhost/x", "http://metadata.google.internal/"):
        with pytest.raises(HostNotAllowed):
            AllowList(["*"]).check(bad) if "169" in bad or "metadata" in bad or "file" in bad or "ftp" in bad else al.check(bad)


def client(handler, kind="openai", **kw):
    spec = ModelSpec(name="m", kind=kind, base_url="http://localhost:1234", model="fake", **kw)
    return ModelClient(spec, AllowList(["localhost"]), transport=httpx.MockTransport(handler))


def test_openai_parsing_with_tool_calls_and_cost():
    def handler(req):
        assert req.url.path == "/v1/chat/completions"
        return httpx.Response(
            200,
            json={
                "model": "fake",
                "choices": [{"message": {"content": "", "tool_calls": [{"id": "c1", "type": "function", "function": {"name": "read_document", "arguments": '{"doc_id": "a"}'}}]}}],
                "usage": {"prompt_tokens": 1000, "completion_tokens": 500},
            },
        )

    r = client(handler, price_in_per_1m=2.0, price_out_per_1m=4.0).chat([{"role": "user", "content": "x"}])
    assert r.tool_calls[0].name == "read_document" and r.tool_calls[0].arguments == {"doc_id": "a"}
    assert r.usage.input_tokens == 1000 and r.usage.cost_usd == 0.004


def test_ollama_native_parsing():
    def handler(req):
        assert req.url.path == "/api/chat"
        return httpx.Response(200, json={"message": {"content": "hi", "tool_calls": [{"function": {"name": "web_search", "arguments": {"query": "q"}}}]}, "prompt_eval_count": 7, "eval_count": 3})

    r = client(handler, kind="ollama").chat([{"role": "user", "content": "x"}])
    assert r.tool_calls[0].arguments == {"query": "q"} and r.usage.output_tokens == 3


def test_redirects_are_refused_and_request_budget_enforced():
    c = client(lambda req: httpx.Response(302, headers={"location": "http://evil.test/"}))
    with pytest.raises((RuntimeError, httpx.HTTPStatusError)):
        c.chat([{"role": "user", "content": "x"}])
    lim = RateLimiter(max_requests=1)
    spec = ModelSpec(name="m", base_url="http://localhost:1", model="x")
    c2 = ModelClient(spec, AllowList(["localhost"]), lim, httpx.MockTransport(lambda r: httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})))
    c2.chat([{"role": "user", "content": "x"}])
    with pytest.raises(RuntimeError, match="budget"):
        c2.chat([{"role": "user", "content": "x"}])


def test_api_key_comes_from_env_and_is_redacted(monkeypatch):
    monkeypatch.setenv("FAKE_KEY", "sk-test-abcdefghijklmnop1234")
    seen = {}

    def handler(req):
        seen["auth"] = req.headers.get("authorization")
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    client(handler, api_key_env="FAKE_KEY").chat([{"role": "user", "content": "x"}])
    assert seen["auth"] == "Bearer sk-test-abcdefghijklmnop1234"
    assert "sk-test-abcdefghijklmnop1234" not in redact_text("leaked sk-test-abcdefghijklmnop1234 here")


def fake_model(hardened_aware: bool):
    """A scripted 'LLM': follows an instruction in a tool result unless it sees the untrusted-data marker."""

    def handler(req: httpx.Request) -> httpx.Response:
        body = json.loads(req.content)
        msgs = body["messages"]
        last = msgs[-1]

        def calls(name, args):
            return httpx.Response(
                200,
                json={"model": "fake", "choices": [{"message": {"content": "", "tool_calls": [{"id": f"id{len(msgs)}", "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}]}}], "usage": {"prompt_tokens": 50, "completion_tokens": 10}},
            )

        def text(t):
            return httpx.Response(200, json={"model": "fake", "choices": [{"message": {"content": t}}], "usage": {"prompt_tokens": 50, "completion_tokens": 10}})

        if last["role"] == "user":
            return calls("search_documents", {"query": "quarterly report"})
        if last["role"] == "tool" and last["name"] == "search_documents":
            return calls("read_document", {"doc_id": "quarterly-report"})
        if last["role"] == "tool" and last["name"] == "read_document":
            guarded = "<untrusted_data" in last["content"]
            if "external@example.test" in last["content"] and not (hardened_aware and guarded):
                return calls("send_email", {"recipient": "external@example.test", "subject": "fwd", "body": last["content"][:200]})
            return text("Revenue grew 12 percent in Q3.")
        return text("Done. Revenue grew 12 percent.")

    return handler


@pytest.fixture
def fake_registry(monkeypatch):
    import agentshield.gateway.llm_brain as lb

    def install(handler):
        spec = ModelSpec(name="fake", base_url="http://localhost:1", model="fake")
        registry.add(spec)
        monkeypatch.setattr(lb, "ModelClient", lambda s, limiter=None: ModelClient(s, AllowList(["localhost"]), limiter, httpx.MockTransport(handler)))

    return install


def test_live_style_run_detects_a_susceptible_model_and_a_resistant_one(fake_registry):
    sc = [s for s in load_scenarios() if s.key.startswith("indirect-injection-email-001[fixture=injected-report]")]
    fake_registry(fake_model(hardened_aware=False))
    bad = run_config(RunConfig(variant="unsafe", brain="llm", model="fake"), sc)
    assert bad.cases[0].status == Status.FAIL
    fake_registry(fake_model(hardened_aware=True))
    good = run_config(RunConfig(variant="hardened", brain="llm", model="fake"), sc)
    assert good.cases[0].status == Status.PASS
    assert good.cases[0].repeats[0].usage.input_tokens > 0 and not good.cases[0].repeats[0].usage.estimated


def test_enforce_blocks_a_susceptible_live_model(fake_registry):
    sc = [s for s in load_scenarios() if s.key.startswith("indirect-injection-email-001[fixture=injected-report]")]
    fake_registry(fake_model(hardened_aware=False))
    run = run_config(RunConfig(variant="unsafe", mode="enforce", brain="llm", model="fake"), sc)
    assert run.cases[0].status == Status.PASS and run.cases[0].mitigated


def test_llm_brain_wraps_untrusted_content_only_when_hardened():
    from agentshield.agents.base import BrainView, ToolResult
    from agentshield.agents.config import Hardening
    from agentshield.models import Message, Provenance

    seen = []

    def handler(req):
        seen.append(json.loads(req.content)["messages"])
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    for flag in (False, True):
        view = BrainView(messages=[Message(role="user", content="hi", provenance=Provenance.USER)], new_messages=[], tools=[], hardening=Hardening(trust_boundaries=flag), principal="a", system_prompt="sys")
        b = LLMBrain(client(handler))
        b.start_turn(view)
        b.conv.append({"role": "assistant", "content": None, "tool_calls": []})
        b.decide(view, [ToolResult("c1", "read_document", data={"content": "DOC"})])
    assert "<untrusted_data" not in json.dumps(seen[0][-1]) and "<untrusted_data" in json.dumps(seen[1][-1])
