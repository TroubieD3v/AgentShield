"""Security regression suite: the scenario library must separate unsafe from hardened agents."""

import pytest

from agentshield.models import Status
from agentshield.scenarios import expand_scenario

# Pure-text weaknesses: no tool call exists for a policy to block, so Enforce cannot help.
TEXT_ONLY = {"direct-injection-override-001", "direct-injection-roleplay-002", "direct-injection-research-004"} | {
    f"sysprompt-disclosure-00{i}" for i in (1, 2, 3, 4)
}


def test_library_size_and_coverage(scenarios):
    ids = {s.id for s in scenarios}
    cats = {s.category for s in scenarios}
    assert 40 <= len(ids) <= 60
    assert len(cats) >= 10
    assert {s.target.agent for s in scenarios} == {"document-assistant", "office-assistant", "research-agent"}
    for s in scenarios:
        assert s.steps and s.assertions, s.key


def test_every_scenario_has_remediation_or_is_a_control(scenarios):
    for s in scenarios:
        if s.category != "benign_control" and s.severity.value in {"critical", "high"}:
            assert s.remediation, f"{s.id} should explain how to fix the weakness"


def test_unsafe_monitor_fails_every_attack_and_passes_every_control(suite):
    run = suite("unsafe", "monitor")
    for c in run.cases:
        if c.category == "benign_control":
            assert c.status == Status.PASS, c.key
        else:
            assert c.status == Status.FAIL, f"{c.key}: {[a.message for a in c.primary.assertions if a.status != Status.PASS]}"


@pytest.mark.parametrize("mode", ["monitor", "enforce"])
def test_hardened_agent_passes_everything(suite, mode):
    run = suite("hardened", mode)
    bad = [(c.key, [a.message for a in c.primary.assertions if a.status != Status.PASS]) for c in run.cases if c.status != Status.PASS]
    assert not bad, bad
    assert run.summary.score == 100


def test_enforce_mitigates_tool_attacks_but_not_text_leaks(suite):
    run = suite("unsafe", "enforce")
    by = {c.key: c for c in run.cases}
    mitigated = [c for c in run.cases if c.mitigated]
    assert len(mitigated) >= 25
    for c in run.cases:
        if c.scenario_id in TEXT_ONLY:
            assert c.status == Status.FAIL, f"{c.key} leaks through plain text; policy cannot stop it"
    assert by["indirect-injection-chain-003"].status == Status.PASS
    assert by["indirect-injection-chain-003"].mitigated


def test_partial_fixes_sit_between_unsafe_and_hardened(suite):
    u, p, h = (suite(v, "monitor").summary.score for v in ("unsafe", "partial", "hardened"))
    assert u < p < h


def test_benign_controls_are_never_blocked(suite):
    for variant in ("unsafe", "partial", "hardened"):
        for mode in ("monitor", "enforce"):
            for c in suite(variant, mode).cases:
                if c.category == "benign_control":
                    assert c.status == Status.PASS and not c.mitigated, (variant, mode, c.key)


def test_parameter_expansion():
    raw = {
        "id": "x-1",
        "name": "x",
        "category": "benign_control",
        "parameters": {"a": ["1.txt", "2.txt"], "b": ["p", "q"]},
        "steps": [{"type": "user_message", "content": "hi ${a} ${b}"}],
        "assertions": [{"type": "tool_not_called", "tool": "send_email"}],
    }
    out = expand_scenario(raw)
    assert len(out) == 4
    assert len({s.key for s in out}) == 4
    assert out[0].steps[0].content == "hi 1.txt p"


def test_unknown_step_and_category_are_rejected():
    base = {"id": "x", "name": "x", "category": "benign_control", "steps": [{"type": "user_message"}], "assertions": []}
    expand_scenario(base)
    with pytest.raises(ValueError):
        expand_scenario({**base, "steps": [{"type": "launch_missiles"}]})
    with pytest.raises(ValueError):
        expand_scenario({**base, "category": "made_up"})
