from pathlib import Path

from agentshield.docgen import render_policies_md, render_scenarios_md

DOCS = Path(__file__).resolve().parent.parent / "docs"


def _read(name):
    return (DOCS / name).read_text(encoding="utf-8").replace("\r\n", "\n")


def test_generated_docs_are_fresh():
    assert _read("SCENARIOS.md").strip() == render_scenarios_md().strip(), "run `agentshield docs`"
    assert _read("POLICIES.md").strip() == render_policies_md().strip(), "run `agentshield docs`"
