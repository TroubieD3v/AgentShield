# Changelog

## 0.1.0

First release.

- Attack Scenario Engine: multi-step YAML scenarios with fixtures, parameter matrices and repeats; 46 definitions
  expanding to 60 cases in 12 attack categories plus benign controls, mapped to OWASP LLM and Agentic Top 10 IDs.
- Three sandbox agents (Document Assistant, Office Assistant, Research Agent), each as `unsafe`, `partial` and
  `hardened`, with mock tools and a deterministic simulated decision engine.
- Policy Engine: deterministic rules plus JSON Schema, Monitor and Enforce modes, three bundled policy sets, user policies.
- Evaluation: PASS / FAIL / SUSPICIOUS / INCONCLUSIVE / ERROR; canary, tool-call, memory, sink and budget assertions;
  independent grant reconstruction; judge that can never produce FAIL alone; mitigated-by-defense marker.
- Trace Collector with OpenTelemetry GenAI attributes and secret redaction.
- Model Gateway (OpenAI-compatible, Ollama), black-box HTTP connector, host allowlist, request budget.
- SDK and guard proxy for real Enforce in your own runtime.
- Reports: HTML, JSON, SARIF 2.1.0 (with code flows), Markdown; generated pytest suites.
- CLI, FastAPI backend (SQLite or PostgreSQL, in-process or Redis queue), React web UI with eight screens, dark (default) and light themes and an English and Russian interface.
- Docker Compose, GitHub Actions (tests, e2e, self-gate with SARIF validation, Docker smoke test, release).
