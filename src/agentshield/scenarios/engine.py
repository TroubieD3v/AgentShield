"""Attack Scenario Engine: executes multi-step scenarios against a target and evaluates assertions."""

from __future__ import annotations

import time
import traceback
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor

from .. import __version__
from ..connectors.base import Target, Unsupported
from ..evaluation import HeuristicJudge, run_assertion
from ..evaluation.scoring import aggregate_repeats, combine_assertions, summarize
from ..models import EventType, Status, Usage
from ..redaction import redact
from ..results import AssertionResult, CaseResult, RepeatResult, RunConfig, SuiteRun
from .schema import Scenario

MAX_PARALLEL = 8  # hard cap on parallel scenario runs


def select_scenarios(all_scenarios: list[Scenario], cfg: RunConfig) -> list[Scenario]:
    out = all_scenarios
    if cfg.scenarios:
        wanted = set(cfg.scenarios)
        out = [s for s in out if s.id in wanted or s.key in wanted]
    if cfg.categories:
        out = [s for s in out if s.category in set(cfg.categories)]
    if cfg.agents:
        out = [s for s in out if s.target.agent in set(cfg.agents)]
    return out


def _metrics(rep: RepeatResult, trace) -> None:
    attempted = effective = blocked = 0
    for e in trace.of_type(EventType.TOOL_CALL):
        violated = bool(e.policy and e.policy.violated)
        if violated:
            attempted += 1
            if not (e.policy and e.policy.blocked):
                effective += 1
        if e.executed is False:
            blocked += 1
    rep.attempted_violations, rep.effective_violations, rep.blocked_attempts = attempted, effective, blocked


def run_repeat(scenario: Scenario, target: Target, cfg: RunConfig, index: int, judge=None) -> tuple[RepeatResult, object | None]:
    t0 = time.perf_counter()
    rep = RepeatResult(index=index, status=Status.ERROR)
    session = None
    try:
        session = target.open(scenario.target.agent, scenario.target.principal, seed=f"{cfg.seed}:{scenario.id}")
        for step in scenario.steps:
            params = step.model_dump(exclude_none=True)
            stype = params.pop("type")
            try:
                session.execute(stype, params)
            except Unsupported as e:
                rep.status = Status.INCONCLUSIVE
                rep.assertions = [AssertionResult(type="setup", status=Status.INCONCLUSIVE, message=f"target cannot perform step '{stype}': {e}")]
                break
        else:
            obs = session.observe()
            obs.judge = judge or HeuristicJudge()
            rep.assertions = [run_assertion(obs, a.type, a.params()) for a in scenario.assertions]
            rep.status = combine_assertions(rep.assertions)
            rep.final_response = obs.responses[-1] if obs.responses else ""
            if obs.stats:
                rep.iterations, rep.tool_calls = obs.stats.iterations, obs.stats.tool_calls
                rep.usage = obs.stats.usage
    except Exception as e:  # connection or scenario failure: never silently PASS
        rep.status = Status.ERROR
        rep.error = f"{type(e).__name__}: {e}"
        rep.assertions = [AssertionResult(type="execution", status=Status.ERROR, message=rep.error)]
        if not isinstance(e, (ConnectionError, TimeoutError)):
            rep.error += "\n" + traceback.format_exc(limit=3)
    trace = None
    if session is not None:
        try:
            trace = session.observe().trace
            rep.trace_id = trace.trace_id
            _metrics(rep, trace)
        except Exception:
            pass
    rep.duration_ms = round((time.perf_counter() - t0) * 1000, 2)
    return rep, trace


def run_case(scenario: Scenario, target: Target, cfg: RunConfig, agent_label: str, judge=None) -> CaseResult:
    n = max(1, cfg.repeat or scenario.repeat)
    repeats: list[RepeatResult] = []
    traces = []
    for i in range(n):
        rep, trace = run_repeat(scenario, target, cfg, i, judge)
        repeats.append(rep)
        if trace is not None:
            traces.append(trace.redacted())
    status, rate = aggregate_repeats(repeats)
    mitigated = status == Status.PASS and any(r.blocked_attempts > 0 for r in repeats)
    case = CaseResult(
        scenario_id=scenario.id,
        scenario_version=scenario.version,
        variant=scenario.variant,
        name=scenario.name + (f" [{', '.join(f'{k}={v}' for k, v in scenario.variant.items())}]" if scenario.variant else ""),
        category=scenario.category,
        severity=scenario.severity,
        owasp=scenario.owasp,
        agent=agent_label,
        mode=cfg.mode,
        policy=cfg.policy,
        model=cfg.model or cfg.brain,
        status=status,
        pass_rate=round(rate, 3),
        repeats=repeats,
        mitigated=mitigated,
        remediation=scenario.remediation,
        traces=traces,
    )
    # nothing that is stored, exported or shown may carry a real-looking secret
    return CaseResult.model_validate(redact(case.model_dump(mode="json")))


def run_suite(
    cfg: RunConfig,
    target: Target,
    scenarios: list[Scenario],
    progress: Callable[[int, int], None] | None = None,
    max_workers: int = 4,
    judge=None,
    run: SuiteRun | None = None,
    should_stop: Callable[[], bool] | None = None,
) -> SuiteRun:
    selected = select_scenarios(scenarios, cfg)
    run = run or SuiteRun(config=cfg)
    run.status, run.agentshield_version = "running", __version__
    run.progress = {"done": 0, "total": len(selected)}
    workers = max(1, min(max_workers, MAX_PARALLEL))
    label = f"{getattr(target, 'name', 'target')}"

    def work(sc: Scenario) -> CaseResult:
        if should_stop and should_stop():
            raise InterruptedError
        agent = f"{sc.target.agent}:{cfg.variant}" if label.startswith("builtin") else f"{label}"
        return run_case(sc, target, cfg, agent, judge)

    results: list[CaseResult | None] = [None] * len(selected)
    try:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(work, sc): i for i, sc in enumerate(selected)}
            for fut in futures:
                i = futures[fut]
                results[i] = fut.result()
                run.progress["done"] += 1
                if progress:
                    progress(run.progress["done"], run.progress["total"])
        run.status = "completed"
    except InterruptedError:
        run.status = "stopped"
    except Exception as e:
        run.status, run.error = "failed", f"{type(e).__name__}: {e}"
    run.cases = [r for r in results if r is not None]
    run.summary = summarize(run.cases)
    run.finished_at = time.time()
    return run


_ = Usage  # re-exported for type checkers
