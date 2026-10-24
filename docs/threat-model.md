# Threat model

AgentShield deliberately talks to AI applications that may be hostile or buggy, and handles attack payloads. This
document lists what it protects, from whom, and how.

## Assets

- The operator's machine and network (AgentShield must not become an SSRF or exfiltration tool).
- API keys for model endpoints and target applications.
- Test evidence (traces, reports) that may contain content produced by the application under test.
- The integrity of results: a wrong PASS is worse than a missing result.

## Trust boundaries and mitigations

| Boundary | Threat | Mitigation |
|---|---|---|
| Operator → target / model URL | A configured URL points at an internal service, cloud metadata or an attacker host (SSRF) | Host allowlist checked at registration and on every request; redirects never followed; link-local and metadata addresses always denied; only `http`/`https` |
| Target response → AgentShield | A huge or malicious response; instructions aimed at AgentShield's own judge | 1 MB response cap; responses are data; the judge can never produce FAIL alone; HTML reports escape all content and ship without scripts |
| Browser → API | DNS rebinding, CSRF, cross-origin writes | Loopback bind; `Host` header check; JSON-only writes; CORS limited to the dev origin; optional bearer token; refusal to bind a public address without one |
| Secrets → storage | Keys or tokens end up in traces, reports or logs | Keys come from environment variables only; exact-value and pattern redaction on traces, case results and exports; a test plants a key and checks every format |
| Scenario content → host | A scenario instructs the sandbox to do something real | The sandbox has no real tools: email, files, web, database and rendering are mocks; scenario fixtures are data |
| Parallel / runaway agents | Cost and resource exhaustion | Caps on iterations, tool calls, tokens, requests per run, repeats, scenarios per run and parallel runs; a hard stop is recorded as a BUDGET event |
| Evaluation | A target hides violations by withholding telemetry | Telemetry is declared; missing telemetry gives INCONCLUSIVE; black-box fixture steps give INCONCLUSIVE |
| Policy engine | A permissive policy hides an excessive action | The evaluator reconstructs authorization from the trace independently of the policy |

## Out of scope

- Hardening the application under test. AgentShield reports; it does not fix.
- Real exploitation. Findings describe what an agent did in a controlled environment, not a working exploit chain
  against production systems.
- Multi-user authorization inside AgentShield. The bearer token is a single shared secret for a trusted operator.

## Known limits

- The simulated decision engine models susceptibility with transparent rules. It demonstrates the evaluator and the
  policies; it does not predict how a specific language model will behave.
- Taint tracking is textual (substring and phrase overlap). A model that paraphrases an injected instruction can evade
  the taint-based policy rules; the authorization rules still apply.
- Policies only see tool calls. Pure-text disclosures (system prompt, secrets in a reply) need application-level
  defenses, which is why the library reports them as unmitigated by Enforce.
