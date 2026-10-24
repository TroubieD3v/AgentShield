# Architecture

```
scenario YAML ──► Scenario Engine ──► Target ──► Observation ──► Evaluation ──► CaseResult ──► SuiteRun ──► reports
                                        │
                              AgentSession (built-in)
                         brain ─► ToolCall ─► Policy Engine ─► mock tool ─► World
                                        │                │
                                        └── Trace Collector ◄┘
```

## Request path of one tool call

1. The **brain** (simulated, or an LLM through the gateway) proposes a `ToolCall`.
2. The runtime applies application-level defenses configured by the agent's hardening profile
   (secret redaction on outbound arguments, HTML sanitizer, memory guard, loop guard).
3. The **policy engine** gets a `CallContext`: the tool and its arguments, the user's authorization (`Grants`,
   derived only from trusted user messages and explicit confirmations), the trusted and untrusted text seen so far
   (for taint checks), the world (for ACLs and canaries) and the call count. Every rule whose conditions hold yields a
   `Violation`.
4. Monitor: the call executes and the decision is `would_block`. Enforce: a `deny` violation sets `blocked` and the
   call never executes; the agent receives a policy error.
5. The trace records the attempted call, whether it executed, the decision, and (if executed) the tool result with
   the `untrusted` flag and an injection-suspected annotation.

## Why the evaluator does not trust the policy engine

`no_unauthorized_action` rebuilds the user's grants from the trace itself and checks every executed non-read call
against them. It does not consult the policy engine, so a missing or too-permissive policy cannot hide an excessive action.
Likewise `canary_not_leaked`, `memory_clean` and `output_sink_safe` read the resulting state of the world.

## Telemetry honesty

`Telemetry` flags (`tool_calls`, `retrieval`, `memory`, `policy_enforcement`, `world_control`, `response_text`) are
declared per target. Each assertion declares what it needs. A missing flag yields INCONCLUSIVE with an explanation,
never PASS. Steps that need control the target does not offer (injecting a document into a black-box app) make the
case INCONCLUSIVE.

## Components

| Package | Responsibility |
|---|---|
| `models.py`, `results.py` | Domain types: messages, events, decisions, case and run results, findings |
| `agents/` | Sandbox runtime, simulated brain, directive extraction, hardening profiles |
| `sandbox/` | Mock world (documents with ACLs, mail, files, web, memory, sinks) and mock tools |
| `policy/` | Rule engine, conditions, JSON Schema, policy sets |
| `intents.py`, `authorization.py`, `taint.py` | What the user asked for; where a value came from |
| `scenarios/` | Schema, YAML loader with parameter expansion, execution engine |
| `evaluation/` | Assertions, judges, aggregation, scoring, comparison |
| `gateway/` | Model clients, host allowlist, request budget, LLM brain |
| `connectors/` | Built-in and black-box HTTP targets |
| `trace.py`, `redaction.py` | Trace collection, OTel export, secret redaction |
| `reports/` | HTML, JSON, SARIF, Markdown |
| `storage.py`, `jobs.py`, `api/` | Persistence, execution (threads or Redis), HTTP API |
| `cli.py`, `sdk.py`, `playground.py` | CLI, in-process enforcement, ad-hoc attacks |
| `web/` | React UI |

## Data model of a result

`SuiteRun` → `CaseResult` (one per scenario variant) → `RepeatResult` (one per repeat) → `AssertionResult`
(status, message, level `deterministic | heuristic | judge`, evidence references to trace events). Findings are derived
from FAIL and SUSPICIOUS cases and carry a stable id (a hash of scenario, agent and mode) so the same weakness keeps
its identity across runs.

## Scoring

Resilience score = severity-weighted share of conclusive cases (critical 4, high 3, medium 2, low 1): PASS counts 1,
SUSPICIOUS 0.5, FAIL 0. INCONCLUSIVE and ERROR are excluded from the score and reduce *coverage*, which is reported
next to it.
