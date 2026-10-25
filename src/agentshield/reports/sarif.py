"""SARIF 2.1.0 export. Findings are anchored to the scenario file; the agent trace becomes a code flow."""

from __future__ import annotations

import json
from typing import Any

from .. import __version__
from ..evaluation.scoring import build_findings
from ..models import Severity, Status
from ..results import SuiteRun
from ..scenarios import load_scenarios

LEVEL = {Severity.CRITICAL: "error", Severity.HIGH: "error", Severity.MEDIUM: "warning", Severity.LOW: "note", Severity.INFO: "note"}
SECURITY_SEVERITY = {Severity.CRITICAL: "9.5", Severity.HIGH: "8.0", Severity.MEDIUM: "5.5", Severity.LOW: "3.0", Severity.INFO: "1.0"}
SCENARIO_URI = "src/agentshield/library/scenarios/"


def render_sarif(run: SuiteRun) -> str:
    sources = {s.id: s.source for s in load_scenarios()}
    rules: dict[str, dict[str, Any]] = {}
    results: list[dict[str, Any]] = []
    traces = {t.trace_id: t for c in run.cases for t in c.traces}
    cases = {c.key: c for c in run.cases}
    for f in build_findings(run):
        rules.setdefault(
            f.scenario_id,
            {
                "id": f.scenario_id,
                "name": f.scenario_id,
                "shortDescription": {"text": f.title},
                "fullDescription": {"text": f.remediation or f.title},
                "defaultConfiguration": {"level": LEVEL[f.severity]},
                "helpUri": "https://owasp.org/www-project-top-10-for-large-language-model-applications/",
                "properties": {
                    "tags": ["security", "ai-agent", f.category, *f.owasp],
                    "security-severity": SECURITY_SEVERITY[f.severity],
                },
            },
        )
        uri = SCENARIO_URI + sources.get(f.scenario_id, "scenarios.yaml")
        flow_locations = []
        tr = traces.get(f.trace_id or "")
        if tr:
            for e in tr.events:
                if e.type.value in {"user_message", "tool_call", "policy_decision", "document_retrieval", "final_response"}:
                    flow_locations.append(
                        {
                            "location": {
                                "message": {"text": f"#{e.seq} {e.type.value}: {e.title}" + (" [violation]" if e.status in {"violation", "blocked"} else "")},
                                "logicalLocations": [{"name": e.title, "kind": "function"}],
                            }
                        }
                    )
        result: dict[str, Any] = {
            "ruleId": f.scenario_id,
            "level": LEVEL[f.severity] if f.status == Status.FAIL else "warning",
            "message": {"text": f"{f.title} ({f.agent}, {cases[f.case_key].mode}): {f.description}"},
            "locations": [{"physicalLocation": {"artifactLocation": {"uri": uri}, "region": {"startLine": 1}}}],
            "partialFingerprints": {"agentshield/finding": f.id},
            "properties": {
                "status": f.status.value,
                "confidence": f.confidence,
                "agent": f.agent,
                "traceId": f.trace_id,
                "evidenceRepeat": f.evidence_repeat,
                "repeats": [{"index": r.index, "status": r.status.value} for r in f.repeats],
            },
        }
        if flow_locations:
            result["codeFlows"] = [{"threadFlows": [{"locations": flow_locations}]}]
        results.append(result)
    doc = {
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "version": "2.1.0",
        "runs": [
            {
                "tool": {
                    "driver": {
                        "name": "AgentShield",
                        "version": __version__,
                        "informationUri": "https://github.com/TroubieD3v/AgentShield",
                        "rules": list(rules.values()),
                    }
                },
                "results": results,
                "invocations": [
                    {
                        "executionSuccessful": run.status == "completed",
                        "properties": {
                            "mode": run.config.mode,
                            "policy": run.config.policy,
                            "score": run.summary.score,
                            "coverage": run.summary.coverage,
                        },
                    }
                ],
            }
        ],
    }
    return json.dumps(doc, indent=2)
