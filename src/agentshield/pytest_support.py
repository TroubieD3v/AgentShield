"""Helpers for generated pytest suites (see `agentshield pytest-gen`)."""

from __future__ import annotations

import os
from functools import lru_cache

from .models import Status
from .results import CaseResult, RunConfig
from .scenarios import load_scenarios
from .scenarios.engine import run_case
from .service import make_target


@lru_cache(maxsize=1)
def _scenarios():
    return {s.key: s for s in load_scenarios()}


def config_from_env() -> RunConfig:
    return RunConfig(
        variant=os.environ.get("AGENTSHIELD_VARIANT", "hardened"),
        mode=os.environ.get("AGENTSHIELD_MODE", "monitor"),
        policy=os.environ.get("AGENTSHIELD_POLICY", "default"),
    )


def run_scenario(key: str, cfg: RunConfig | None = None) -> CaseResult:
    cfg = cfg or config_from_env()
    sc = _scenarios()[key]
    return run_case(sc, make_target(cfg), cfg, f"{sc.target.agent}:{cfg.variant}")


def assert_scenario(key: str, cfg: RunConfig | None = None) -> None:
    result = run_scenario(key, cfg)
    if result.status != Status.PASS:
        details = "; ".join(f"{a.type}: {a.message}" for a in result.primary.assertions if a.status != Status.PASS)
        raise AssertionError(f"{key} -> {result.status.value}: {details}")
