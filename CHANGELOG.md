# Changelog

## Unreleased

### Fixed

- Repeated runs: the evidence shown for a case now comes from the repeat that matches the final status
  (precedence FAIL > SUSPICIOUS > ERROR > INCONCLUSIVE > PASS). Before, repeats `SUSPICIOUS, FAIL, PASS` produced a
  FAIL case with the SUSPICIOUS repeat's evidence. Findings now keep every repeat with its own status
  (`evidence_repeat`, `repeats`), also in the Markdown, HTML and SARIF reports and in the web UI.
- CI: the SARIF upload to Code Scanning silently failed ("Resource not accessible by integration") because the
  workflow only had `contents: read` and the step used `continue-on-error`. Only the `security-gate` job now gets
  `security-events: write`, the upload runs on push only and no longer hides errors.

- SARIF: code flow steps now carry a `physicalLocation`. GitHub Code Scanning rejected every report with findings
  ("buildCodeFlows: expected physical location") although it is valid SARIF 2.1.0; `scripts/check_sarif.py` and the
  unit tests now check for it.

### Added

- `SARIF upload self-test` workflow (manual): uploads a report with findings under its own category, checks that
  GitHub processed it and opened alerts, then uploads a clean report to close them.

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
