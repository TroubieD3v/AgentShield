"""Validate an AgentShield SARIF file: SARIF 2.1.0 schema (when reachable) plus content expectations.

usage: python scripts/check_sarif.py results.sarif [--expect-findings N] [--expect-none]
"""

from __future__ import annotations

import json
import sys
import urllib.request

SCHEMA_URL = "https://json.schemastore.org/sarif-2.1.0.json"


def main(argv: list[str]) -> int:
    path = argv[1]
    doc = json.load(open(path, encoding="utf-8"))
    problems: list[str] = []

    try:
        import jsonschema

        schema = json.load(urllib.request.urlopen(SCHEMA_URL, timeout=20))
        jsonschema.validate(doc, schema)
        print("schema: valid SARIF 2.1.0")
    except ImportError:
        print("schema: jsonschema not installed, skipped")
    except OSError as e:
        print(f"schema: could not download the SARIF schema ({e}), structural checks only")
    except Exception as e:  # jsonschema.ValidationError
        problems.append(f"schema violation: {str(e)[:300]}")

    run = doc["runs"][0]
    rules = {r["id"] for r in run["tool"]["driver"]["rules"]}
    results = run["results"]
    for r in results:
        if r["ruleId"] not in rules:
            problems.append(f"result references unknown rule {r['ruleId']}")
        if not r.get("locations"):
            problems.append(f"result {r['ruleId']} has no location (GitHub code scanning needs one)")
        if "agentshield/finding" not in r.get("partialFingerprints", {}):
            problems.append(f"result {r['ruleId']} has no fingerprint")
        # GitHub Code Scanning: "buildCodeFlows: expected physical location" if a flow step has none.
        for flow in r.get("codeFlows", []):
            for tf in flow.get("threadFlows", []):
                for step in tf.get("locations", []):
                    if "physicalLocation" not in step.get("location", {}):
                        problems.append(f"result {r['ruleId']} has a code flow step without physicalLocation")
                        break

    if "--expect-none" in argv and results:
        problems.append(f"expected a clean run but found {len(results)} result(s)")
    if "--expect-findings" in argv:
        want = int(argv[argv.index("--expect-findings") + 1])
        if len(results) < want:
            problems.append(f"expected at least {want} findings, got {len(results)}")
        if not any("codeFlows" in r for r in results):
            problems.append("no result carries a codeFlow (the agent trace)")

    print(f"{len(results)} result(s), {len(rules)} rule(s)")
    for p in problems:
        print("PROBLEM:", p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
