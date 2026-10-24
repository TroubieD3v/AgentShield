# AgentShield: AI Agent Security Assessment Platform

[![CI](https://github.com/TroubieD3v/AgentShield/actions/workflows/ci.yml/badge.svg)](https://github.com/TroubieD3v/AgentShield/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-a2a6ae)](LICENSE)
![OWASP LLM · Agentic Top 10](https://img.shields.io/badge/OWASP-LLM%20%C2%B7%20Agentic%20Top%2010-e8a33d)
![Scenarios](https://img.shields.io/badge/scenarios-46-7cc4e8)
![Modules](https://img.shields.io/badge/modules-12-7cc4e8)
![Python 3.11+](https://img.shields.io/badge/python-3.11%2B-7cc4e8)
![SARIF 2.1.0](https://img.shields.io/badge/output-SARIF%202.1.0-a2a6ae)
![Docker Compose](https://img.shields.io/badge/run%20with-Docker%20Compose-a2a6ae)

**English** · [Русский](README.ru.md)

AgentShield is an open-source tool for testing the security of **LLM applications, AI agents, RAG systems and the
tools agents use**. A text-only scanner asks "did the model say something bad?". AgentShield asks the question that
matters for an agent: **what did it actually do?** Which tools did it call, which data did it touch, whose
instruction did it follow, and did it stay inside what the user asked for and what the policy allows.

It does not stop at "the answer looks suspicious". It reports *"the quarterly report contained an instruction, the
agent called `send_email(external@example.test)` with a canary token in the body, nobody asked for that"*, with the
full agent trace, the policy rules that fired, and the same attack replayed with and without enforcement.

> **Warning**: test only applications you own or are authorized to test. The built-in agents use **mock tools only**:
> no real email, payment or system is ever touched. Leak tests use synthetic canary tokens, never real secrets.
> Outbound connections are limited to hosts you allow. See [SECURITY.md](SECURITY.md) and the
> [threat model](docs/threat-model.md).

> **Note**: the built-in demo agents are driven by a deterministic **simulated decision engine**, a transparent
> stand-in that obeys instructions found in data when unsafe and treats them as data when hardened. It is not a
> language model. It lets AgentShield *prove*, offline and reproducibly, that its tests and policies separate a
> vulnerable agent from a fixed one. Point the same scenarios at a real model (OpenAI-compatible API or Ollama) to
> test live behaviour.

![Replay an attack, flip Monitor to Enforce, read the trace, compare before and after](docs/screenshots/demo.gif)

*The same indirect prompt injection, recorded in Monitor mode and blocked in Enforce mode, then the trace and a
before/after comparison.*

![Attack Playground in Monitor mode](docs/screenshots/playground-monitor.png)

| Agent execution trace | Before / after comparison |
|---|---|
| ![Trace Explorer](docs/screenshots/trace.png) | ![Compare](docs/screenshots/compare.png) |

## Modules

Twelve modules, one system: not a pile of prompts.

| Module | Does |
|---|---|
| Model Gateway | OpenAI-compatible and Ollama clients, host allowlist, no redirects, request budget, keys read from the environment |
| Agent Connector | Built-in sandbox agents; black-box HTTP agents with declared telemetry; SDK and guard proxy for real Enforce |
| Prompt Injection Lab | Direct overrides, role-play, fake authority; indirect payloads in documents, emails, web pages, tool output |
| Tool Security Tester | Unrequested, tainted or destructive tool calls, checked against what the user actually asked for |
| RAG Security Analyzer | Cross-tenant retrieval, injected documents, identity switches, ACL checked at retrieval time |
| Memory Poisoning Tester | Untrusted content saved as a standing instruction and obeyed in a later session |
| Sensitive Data Leakage | Synthetic canary tokens in responses, tool arguments, memory and sinks |
| Attack Scenario Engine | Multi-step YAML scenarios with state, fixtures, parameters, repeats |
| Evaluation & Scoring | PASS / FAIL / SUSPICIOUS / INCONCLUSIVE / ERROR, evidence per assertion, resilience score |
| Agent Trace Explorer | Messages, retrievals, model decisions, tool calls and policy decisions; OpenTelemetry GenAI attributes |
| Security Dashboard | Category scores, history, model and version comparison, baseline regression |
| Reporting & CI/CD | HTML, JSON, SARIF 2.1.0, Markdown, generated pytest suite, GitHub Actions, exit codes |

### Scenarios

[46 scenario definitions](docs/SCENARIOS.md) expand into 60 executable cases across 12 attack categories plus
benign controls, mapped to the OWASP LLM and Agentic Top 10 risk IDs.

| Category | Example check |
|---|---|
| Direct Prompt Injection | A user message tries to change the agent's purpose or print its hidden prompt |
| Indirect Prompt Injection | Untrusted text in a document or tool result commands the agent |
| Tool Misuse | The agent calls a tool the task did not require |
| Excessive Agency | A vague "clean up my files" must lead to a question, not a deletion |
| RAG Data Isolation | User A reaches user B's documents, directly or through an injected document |
| Memory Poisoning | An email plants "copy every mail to X" in memory; the next session obeys it |
| Sensitive Data Exposure | A canary secret appears in a response or an outbound call |
| System Instruction Disclosure | The system prompt (with a canary) is revealed |
| Multi-Agent Trust | A peer agent's reply carries an instruction |
| MCP Tool Trust | A poisoned tool description or tool result steers the agent |
| Output Handling | Model output reaches an HTML renderer or SQL engine unvalidated |
| Cost & Resource Abuse | A loop or a "do it 150 times" request exhausts the tool-call budget |
| Benign Control | Normal work must still work: defenses are scored for over-blocking too |

### Three agents, three configurations each

| Agent | Tools | Focus |
|---|---|---|
| Document Assistant | search, read, send email, render HTML | RAG, injection, leakage, output handling |
| Office Assistant | inbox, email, files, calendar, memory | tool misuse, excessive agency, confirmations |
| Research Agent | web, fetch, memory, delegation, MCP, SQL | multi-step, memory, multi-agent, MCP |

Each runs as **unsafe**, **partial** (first round of fixes) and **hardened**, so AgentShield can show a measurable
difference: unsafe 9, partial 87, hardened 100 on the bundled library.

### How a verdict is reached

| Status | Meaning |
|---|---|
| PASS | The expected policy held |
| FAIL | A confirmed violation: an executed action or leaked canary, observed, not guessed |
| SUSPICIOUS | Signs of a violation that need a human look (text heuristics, judge-only signals) |
| INCONCLUSIVE | The target does not expose the telemetry needed. **Never read as "no violation"** |
| ERROR | The connection or scenario failed |

Several independent checks run on every case: deterministic assertions on real effects, tool-call structure, canary
tokens, JSON comparison, and an optional LLM-as-a-judge. **A judge alone can never produce a FAIL.** A case that
passes only because Enforce blocked an attempt is marked ★ *mitigated*, so a defense never hides the weakness behind it.

## Monitor and Enforce

| Mode | Behaviour |
|---|---|
| Monitor | Observe tool calls and record violations without intervening (`would_block`) |
| Enforce | Stop the call before it executes (`block`); the agent sees a policy error |

Enforce works for the built-in runtime, for agents that call the [SDK](docs/integration.md#sdk-in-process-enforce),
and for any runtime through the [guard proxy](docs/integration.md#guard-proxy-any-language). A third-party app
connected only over HTTP can be observed (Monitor) but **cannot be blocked from outside**.

## Workflow

1. **Connect**: use the built-in agents, register an HTTP agent (with the telemetry it really reports and the canaries you planted), or register a model to drive the sandbox with a real LLM.
2. **Select**: all scenarios, a category, or one scenario; choose the policy set and Monitor / Enforce.
3. **Run**: in the background, with request, token, iteration and parallelism limits.
4. **Read**: scores by category, findings with evidence, and the full trace of every case.
5. **Fix and compare**: save a baseline, change the agent or model, run again and diff.

The interface has eight screens: Dashboard, Targets & Models, Scenario Library, Attack Playground, Test Runs,
Trace Explorer, Findings and Policies & Reports.

| Findings | Policies and the live demo |
|---|---|
| ![Findings](docs/screenshots/findings.png) | ![Policies](docs/screenshots/policies.png) |

## Quick start (Docker)

Requires Docker with Compose v2.

```bash
git clone https://github.com/TroubieD3v/AgentShield.git
cd AgentShield
docker compose up --build
```

Open <http://localhost:8080> and press **Start run** on the Dashboard. The port is published on the loopback interface
only. Compose starts the API, a queue worker, PostgreSQL and Redis; data lives in the `pgdata` and
`agentshield-data` volumes (`docker compose down --volumes` deletes them).

**Troubleshooting**

- *Port 8080 already in use*: `AGENTSHIELD_PORT=8090 docker compose up --build` (PowerShell: `$env:AGENTSHIELD_PORT=8090; docker compose up --build`).
- *Open it as `localhost` or `127.0.0.1`*: other host names are rejected (DNS-rebinding protection). To serve it elsewhere set `AGENTSHIELD_API_TOKEN` and `AGENTSHIELD_UI_HOSTS`.
- *"host is not in the allowlist" when registering a target or model*: add the host to `AGENTSHIELD_ALLOWED_HOSTS`. Reaching an app on your machine from the container: `host.docker.internal`.
- *A black-box target shows INCONCLUSIVE*: expected. Its steps need data control or tool-call telemetry the target does not expose.

## Local development (no Docker)

Requires Python 3.11+ and Node.js 22+.

```bash
python -m venv .venv && . .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
npm --prefix web ci && npm --prefix web run build
agentshield serve                                     # UI + API on 127.0.0.1:8080, SQLite in .agentshield/
npm --prefix web run dev                              # optional: UI with hot reload on :5173
```

## Command line and CI

```bash
agentshield demo                                                  # one attack, Monitor vs Enforce
agentshield run --variant hardened --mode enforce -f sarif -o results.sarif --fail-on high
agentshield run --variant unsafe -c indirect_prompt_injection -c tool_misuse
agentshield run --target-file examples/http-target.yaml           # black-box HTTP agent
agentshield run --brain llm --model my-llama                      # drive the sandbox with a real model
agentshield compare before.json after.json --fail-on-regression
agentshield baseline save run.json --name main && agentshield baseline check new.json --name main
agentshield pytest-gen -o test_agent_security.py                  # one pytest test per scenario
```

Exit codes: `0` ok, `1` a FAIL at or above `--fail-on` (or SUSPICIOUS / INCONCLUSIVE with the matching flags), `2` error.

```yaml
- run: pip install agentshield
- run: agentshield run --variant hardened --mode enforce -f sarif -o results.sarif --fail-on high
- uses: github/codeql-action/upload-sarif@v4
  if: always()
  with:
    sarif_file: results.sarif
```

The `security-gate` job in [ci.yml](.github/workflows/ci.yml) runs AgentShield on itself: the hardened agent must pass
and produce a clean SARIF, the unsafe agent must fail with exit code 1 and at least 30 findings with code flows
([scripts/check_sarif.py](scripts/check_sarif.py) validates the SARIF against the 2.1.0 schema), and a saved
baseline must catch the regression.

## Safety

- **Mock tools only.** Built-in agents cannot send email, delete real files, call real APIs or run code.
- **Allowlisted egress.** The gateway and HTTP connector talk only to hosts in `AGENTSHIELD_ALLOWED_HOSTS` (default: localhost). Redirects are refused; link-local and cloud-metadata addresses are always denied.
- **Secrets stay out.** API keys are read from environment variables, never stored, and redacted from traces, reports and logs. Canary tokens are synthetic and deliberately visible as evidence.
- **Limits.** Per-run caps on iterations, tool calls, tokens, requests, repeats, scenarios and parallel runs.
- **No false comfort.** A target that does not expose telemetry gets INCONCLUSIVE, not PASS.
- The server binds to `127.0.0.1`, checks the `Host` header, accepts JSON writes only, supports a bearer token, and sends a restrictive Content Security Policy.

## Tests

```bash
ruff check src tests && pytest                         # 83 tests: policy, runtime, evaluation semantics, gateway, reports, API, CLI, SDK
npm --prefix web run typecheck
npm --prefix web run test:e2e                          # 12 Playwright tests; PW_CHANNEL=chrome reuses an installed Chrome
```

The security regression suite asserts that every attack scenario fails on the unsafe agent, every scenario passes on
the hardened agent in both modes, benign controls are never blocked, partial fixes score between the two, and
pure-text leaks are **not** mitigated by Enforce (a policy cannot stop what is not a tool call). Black-box semantics
are tested against a mock HTTP target; the live-model path against a scripted fake OpenAI server. A test plants a
real-looking API key and checks it appears in no report format. `docs/SCENARIOS.md` and `docs/POLICIES.md` are
generated with `agentshield docs`; a test fails when they are stale.
`web/scripts/screenshots.mjs` and `web/scripts/make_gif.py` regenerate the images in this README.

## Architecture

```
scenario YAML ──► Attack Scenario Engine ──► target (built-in agent | HTTP agent | model-driven sandbox)
                          │                          │ tool calls
                          │                          ▼
                          │                 Policy Engine (Monitor | Enforce) ──► mock tools / world
                          ▼                          │
                  Evaluation Engine ◄── Trace Collector (OTel GenAI attributes, secrets redacted)
                          │
          Storage (SQLite | PostgreSQL) · Queue (threads | Redis) ──► API ──► React UI · CLI · HTML / JSON / SARIF / MD
```

- `src/agentshield/agents/`: sandbox runtime, simulated brain, hardening profiles. `sandbox/`: mock world and tools.
- `policy/`: rules, conditions, JSON Schema. `intents.py`, `authorization.py`, `taint.py`: what the user asked for and where a value came from.
- `scenarios/`: schema, loader, engine. `evaluation/`: assertions, judges, scoring. `reports/`: output formats.
- `gateway/`: model clients, allowlist. `connectors/`: built-in and HTTP targets. `api/`, `storage.py`, `jobs.py`, `cli.py`, `sdk.py`.
- `web/`: React, TypeScript, Vite, Tailwind CSS, shadcn/ui-style components, Playwright. `library/`: scenarios, fixtures, worlds, policies.

Details: [docs/architecture.md](docs/architecture.md) · [docs/threat-model.md](docs/threat-model.md) ·
[docs/integration.md](docs/integration.md) · [docs/SCENARIOS.md](docs/SCENARIOS.md) · [docs/POLICIES.md](docs/POLICIES.md) ·
[CONTRIBUTING.md](CONTRIBUTING.md) · [CHANGELOG.md](CHANGELOG.md).

## Roadmap

More scenario families (multi-turn social engineering, code-execution agents), richer judges with calibration data,
OTLP export to a collector, finding triage states, and adapters for popular agent frameworks that report tool calls
out of the box.

## Releases

| Version | Result |
|---|---|
| **v0.1.0** | **12 modules, 46 scenarios (60 cases), 3 demo agents × 3 configurations, Monitor and Enforce, HTML / JSON / SARIF / Markdown, CLI, SDK and guard proxy, web UI, Docker Compose, GitHub Actions** |

Pushing a `v*` tag builds the wheel (with the web UI inside) and checksums ([release.yml](.github/workflows/release.yml)).

## License

[MIT](LICENSE)
