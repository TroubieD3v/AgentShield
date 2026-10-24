"""High-level helpers shared by the CLI, API and tests."""

from __future__ import annotations

from collections.abc import Callable

from .agents import Budget
from .connectors import BuiltinTarget
from .connectors.base import Target
from .results import RunConfig, SuiteRun
from .scenarios import load_scenarios
from .scenarios.engine import run_suite
from .scenarios.schema import Scenario

DEFAULT_BUDGET = Budget()


def make_target(cfg: RunConfig, extra: Callable[[RunConfig], Target | None] | None = None) -> Target:
    if extra:
        t = extra(cfg)
        if t is not None:
            return t
    if cfg.target != "builtin":
        raise KeyError(f"unknown target '{cfg.target}'")
    brain_factory = None
    model = "simulated"
    if cfg.brain == "llm":
        from .gateway.llm_brain import llm_brain_factory

        brain_factory = llm_brain_factory(cfg)
        model = cfg.model or "llm"
    return BuiltinTarget(
        variant=cfg.variant, mode=cfg.mode, policy=cfg.policy, brain_factory=brain_factory, budget=DEFAULT_BUDGET, model=model
    )


def run_config(
    cfg: RunConfig,
    scenarios: list[Scenario] | None = None,
    target_resolver: Callable[[RunConfig], Target | None] | None = None,
    progress: Callable[[int, int], None] | None = None,
    max_workers: int = 4,
    run: SuiteRun | None = None,
    should_stop: Callable[[], bool] | None = None,
) -> SuiteRun:
    target = make_target(cfg, target_resolver)
    return run_suite(
        cfg,
        target,
        scenarios if scenarios is not None else load_scenarios(),
        progress=progress,
        max_workers=max_workers,
        run=run,
        should_stop=should_stop,
    )
