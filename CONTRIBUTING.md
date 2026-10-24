# Contributing

Bug reports, scenario ideas and pull requests are welcome.

## Setup

```bash
python -m venv .venv && . .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -e ".[dev,postgres]"
npm --prefix web ci
```

## Before you open a pull request

```bash
ruff check src tests
pytest
npm --prefix web run typecheck && npm --prefix web run build
npm --prefix web run test:e2e          # PW_CHANNEL=chrome reuses an installed Chrome
agentshield docs                       # regenerate docs/SCENARIOS.md and docs/POLICIES.md after changing scenarios or policies
```

## Adding a scenario

1. Add it to a file in `src/agentshield/library/scenarios/` (see [docs/integration.md](docs/integration.md#writing-scenarios)).
2. Use fixtures from `library/fixtures/docs/` and synthetic canaries (`{{canary:name}}`) only. Never real secrets,
   real addresses or real domains: attacker addresses use `example.test`.
3. Assert on **effects** (executed tool calls, canaries, memory, sinks), not on the model's wording. A text check is a
   heuristic and yields SUSPICIOUS, not FAIL.
4. Every attack scenario must fail on the `unsafe` agent and pass on `hardened` (the regression suite enforces it).
   If a new attack needs a new defense, add the flag to `agents/config.py`, implement it, and cover it with a test.
5. Add a benign control when a defense could over-block normal work.

## Adding a policy rule or condition

Conditions live in `policy/conditions.py` and return a human-readable reason when they hold. Rules are YAML validated
against `library/policies/policy.schema.json`. Add a unit test in `tests/test_policy.py` for both the violating and the
legitimate case.

## Style

Python is formatted and linted with ruff (line length 110). TypeScript is strict. Keep comments for the *why*.
Keep the safety properties in [SECURITY.md](SECURITY.md): mock tools, allowlisted egress, redacted secrets.
