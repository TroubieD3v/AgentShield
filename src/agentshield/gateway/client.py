"""Model Gateway: OpenAI-compatible and Ollama chat clients with allowlist, limits and redaction."""

from __future__ import annotations

import json
import os
import threading
import time
from typing import Any

import httpx
from pydantic import BaseModel, Field

from ..models import ToolCall, Usage
from ..redaction import register_secret
from .allowlist import AllowList, default_allowlist


class ModelSpec(BaseModel):
    name: str
    kind: str = "openai"  # openai | ollama
    base_url: str = "http://localhost:11434"
    model: str = ""
    api_key_env: str | None = None  # name of an environment variable; the key itself is never stored
    price_in_per_1m: float | None = None
    price_out_per_1m: float | None = None
    timeout_s: float = 60.0
    max_tokens: int = 1024
    temperature: float = 0.0
    description: str = ""


class ChatResult(BaseModel):
    content: str = ""
    tool_calls: list[ToolCall] = Field(default_factory=list)
    usage: Usage = Field(default_factory=Usage)
    model: str = ""


class RateLimiter:
    """Request-count and spacing limits shared by every call of one client."""

    def __init__(self, max_requests: int = 500, min_interval_s: float = 0.0):
        self.max_requests = max_requests
        self.min_interval_s = min_interval_s
        self.count = 0
        self._last = 0.0
        self._lock = threading.Lock()

    def acquire(self) -> None:
        with self._lock:
            if self.count >= self.max_requests:
                raise RuntimeError(f"request budget exhausted ({self.max_requests} requests)")
            wait = self._last + self.min_interval_s - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            self._last = time.monotonic()
            self.count += 1


class ModelClient:
    def __init__(
        self,
        spec: ModelSpec,
        allowlist: AllowList | None = None,
        limiter: RateLimiter | None = None,
        transport: httpx.BaseTransport | None = None,
    ):
        self.spec = spec
        self.allowlist = allowlist or default_allowlist()
        self.limiter = limiter or RateLimiter()
        self._http = httpx.Client(timeout=spec.timeout_s, follow_redirects=False, transport=transport)
        self._key = os.environ.get(spec.api_key_env) if spec.api_key_env else None
        register_secret(self._key)

    # -------------------------------------------------------------- URL / headers
    def _url(self) -> str:
        base = self.spec.base_url.rstrip("/")
        if self.spec.kind == "ollama":
            return f"{base}/api/chat"
        return f"{base}/chat/completions" if base.endswith("/v1") else f"{base}/v1/chat/completions"

    def _headers(self) -> dict[str, str]:
        h = {"Content-Type": "application/json"}
        if self._key:
            h["Authorization"] = f"Bearer {self._key}"
        return h

    # -------------------------------------------------------------- chat
    def chat(self, messages: list[dict[str, Any]], model: str | None = None, tools: list[dict[str, Any]] | None = None) -> ChatResult:
        url = self._url()
        self.allowlist.check(url)
        self.limiter.acquire()
        model_name = model or self.spec.model
        if self.spec.kind == "ollama":
            body: dict[str, Any] = {
                "model": model_name,
                "messages": messages,
                "stream": False,
                "options": {"temperature": self.spec.temperature, "num_predict": self.spec.max_tokens},
            }
        else:
            body = {"model": model_name, "messages": messages, "temperature": self.spec.temperature, "max_tokens": self.spec.max_tokens}
        if tools:
            body["tools"] = tools
        r = self._http.post(url, headers=self._headers(), content=json.dumps(body))
        if r.is_redirect:
            raise RuntimeError("redirect refused: AgentShield does not follow redirects")
        r.raise_for_status()
        return self._parse(r.json(), model_name)

    def _cost(self, u: Usage) -> float | None:
        if self.spec.price_in_per_1m is None and self.spec.price_out_per_1m is None:
            return None
        return round(
            (u.input_tokens * (self.spec.price_in_per_1m or 0) + u.output_tokens * (self.spec.price_out_per_1m or 0)) / 1e6, 6
        )

    def _parse(self, data: dict[str, Any], model: str) -> ChatResult:
        if self.spec.kind == "ollama":
            msg = data.get("message", {})
            calls = [
                ToolCall(name=c["function"]["name"], arguments=c["function"].get("arguments") or {})
                for c in msg.get("tool_calls", []) or []
            ]
            usage = Usage(input_tokens=data.get("prompt_eval_count", 0), output_tokens=data.get("eval_count", 0))
        else:
            choice = (data.get("choices") or [{}])[0]
            msg = choice.get("message", {})
            calls = []
            for c in msg.get("tool_calls", []) or []:
                raw = c["function"].get("arguments") or "{}"
                try:
                    args = json.loads(raw) if isinstance(raw, str) else raw
                except json.JSONDecodeError:
                    args = {"_raw": raw}
                calls.append(ToolCall(id=c.get("id") or ToolCall(name="x").id, name=c["function"]["name"], arguments=args))
            u = data.get("usage") or {}
            usage = Usage(input_tokens=u.get("prompt_tokens", 0), output_tokens=u.get("completion_tokens", 0))
        usage.cost_usd = self._cost(usage)
        return ChatResult(content=msg.get("content") or "", tool_calls=calls, usage=usage, model=data.get("model", model))

    def close(self) -> None:
        self._http.close()
