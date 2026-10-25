from __future__ import annotations

import time

from ..evaluation.scoring import build_findings
from ..models import Status
from ..results import SuiteRun


def _esc(s: str) -> str:
    return s.replace("|", "\\|").replace("\n", " ")


def render_markdown(run: SuiteRun) -> str:
    s = run.summary
    cfg = run.config
    when = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(run.started_at))
    lines = [
        f"# AgentShield report: {cfg.label or cfg.target + ':' + cfg.variant}",
        "",
        f"- Run `{run.id}` · {when} · AgentShield {run.agentshield_version}",
        f"- Target `{cfg.target}` ({cfg.variant}) · mode **{cfg.mode}** · policy `{cfg.policy}` · brain `{cfg.brain}`",
        f"- Resilience score **{s.score}/100** · conclusive coverage {round(s.coverage * 100)}% · "
        f"{s.mitigated} case(s) passed only because a defense blocked an attempt",
        f"- Policy violations: {s.policy_violations_attempted} attempted, {s.policy_violations_effective} took effect",
        "",
        "| PASS | FAIL | SUSPICIOUS | INCONCLUSIVE | ERROR |",
        "|---|---|---|---|---|",
        "| " + " | ".join(str(s.counts.get(k, 0)) for k in ("PASS", "FAIL", "SUSPICIOUS", "INCONCLUSIVE", "ERROR")) + " |",
        "",
        "## By category",
        "",
        "| Category | Score | Pass | Fail | Suspicious | Inconclusive |",
        "|---|---|---|---|---|---|",
    ]
    for cat, v in sorted(s.by_category.items()):
        lines.append(f"| {cat} | {v['score']} | {v['pass']} | {v['fail']} | {v['suspicious']} | {v['inconclusive']} |")
    findings = build_findings(run)
    lines += ["", f"## Findings ({len(findings)})", ""]
    if not findings:
        lines.append("No confirmed or suspicious findings.")
    for f in findings:
        lines += [
            f"### {f.id} · {f.title}",
            "",
            f"**{f.severity.value.upper()}** · {f.status.value} · {f.category} · agent `{f.agent}`"
            + (f" · {', '.join(f.owasp)}" if f.owasp else ""),
            "",
            f.description,
            "",
        ]
        for e in f.evidence[:5]:
            lines.append(f"- evidence #{e.seq}: `{_esc(e.summary)}`")
        if len(f.repeats) > 1:
            lines.append(
                f"- repeats: {', '.join(f'#{r.index + 1} {r.status.value}' for r in f.repeats)} (evidence above is from repeat #{f.evidence_repeat + 1})"
            )
        if f.remediation:
            lines += ["", f"**Remediation:** {f.remediation}"]
        lines.append("")
    lines += ["## All cases", "", "| Status | Case | Category | Severity | Agent | Pass rate |", "|---|---|---|---|---|---|"]
    for c in run.cases:
        mark = " (mitigated)" if c.mitigated else ""
        lines.append(f"| {c.status.value}{mark} | {_esc(c.name)} | {c.category} | {c.severity.value} | {c.agent} | {round(c.pass_rate * 100)}% |")
    inc = [c for c in run.cases if c.status in (Status.INCONCLUSIVE, Status.ERROR)]
    if inc:
        lines += ["", "## Coverage gaps", ""]
        for c in inc:
            msgs = "; ".join(a.message for a in c.primary.assertions if a.status in (Status.INCONCLUSIVE, Status.ERROR))
            lines.append(f"- **{c.name}**: {msgs}")
    lines += ["", "> Missing telemetry is reported as INCONCLUSIVE, never as 'no violation'."]
    return "\n".join(lines) + "\n"
