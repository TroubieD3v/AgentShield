# Security policy

AgentShield is a security testing tool. It is meant to be run against systems you own or are authorized to test.

## Reporting a vulnerability in AgentShield

Please report vulnerabilities in AgentShield itself (for example a way to make it contact a host outside the
allowlist, leak a stored secret, or execute something it should not) privately through
[GitHub Security Advisories](https://github.com/TroubieD3v/AgentShield/security/advisories/new) rather than a public
issue. Include the version, how to reproduce it, and the impact you expect. Expect an acknowledgement within a week.

## Supported versions

Only the latest release receives fixes while the project is at 0.x.

## What AgentShield promises

- Built-in agents use **mock tools only**; no real email, payment, file or network action exists in the sandbox.
- Outbound requests go only to hosts in `AGENTSHIELD_ALLOWED_HOSTS` (default `localhost`, `127.0.0.1`, `::1`,
  `host.docker.internal`). Redirects are never followed; link-local and cloud-metadata addresses are always denied.
- API keys are read from environment variables, never written to the database, traces, reports or logs.
- Leak scenarios use synthetic canary tokens (`AS-CANARY-*`) only.
- The web server binds to the loopback interface by default, validates the `Host` header, accepts JSON writes only,
  and supports a bearer token (`AGENTSHIELD_API_TOKEN`). Binding a non-loopback address without a token is refused.
- Run, token, request, iteration, repeat and parallelism limits are enforced by AgentShield, not by the agent under test.

## What it does not promise

- Passing the scenario library does not prove an application is secure; it shows those attacks did not work.
- A black-box HTTP target cannot be blocked from outside. Use the SDK or the guard proxy for real Enforce.
- The simulated decision engine is not a language model. Use a live model to test model behaviour.

See the [threat model](docs/threat-model.md) for the full list of assets, trust boundaries and mitigations.
