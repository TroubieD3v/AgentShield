"""Run execution: in-process thread pool by default, Redis queue + worker when REDIS_URL is set."""

from __future__ import annotations

import os
import threading
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor

from .connectors.base import Target
from .connectors.http_agent import HttpTarget
from .gateway.registry import registry
from .results import RunConfig, SuiteRun
from .scenarios import load_scenarios
from .service import run_config
from .storage import Store

QUEUE_KEY = "agentshield:jobs"
MAX_PARALLEL_RUNS = int(os.environ.get("AGENTSHIELD_MAX_PARALLEL_RUNS", "2"))


def resolve_target(store: Store) -> Callable[[RunConfig], Target | None]:
    def resolver(cfg: RunConfig) -> Target | None:
        if cfg.target == "builtin":
            return None
        spec = store.get_target(cfg.target)
        if spec is None:
            raise KeyError(f"target '{cfg.target}' is not registered")
        return HttpTarget(spec)

    return resolver


def sync_models(store: Store) -> None:
    for m in store.list_models():
        registry.add(m)


def execute_run(store: Store, run_id: str) -> SuiteRun:
    """Load a queued run, execute it, persist progress and result."""
    run = store.get_run(run_id)
    if run is None:
        raise KeyError(run_id)
    sync_models(store)
    last_save = [0.0]

    def progress(done: int, total: int) -> None:
        run.progress = {"done": done, "total": total}
        if time.time() - last_save[0] > 0.5:
            last_save[0] = time.time()
            store.save_run(run)

    run.status = "running"
    store.save_run(run)
    try:
        result = run_config(
            run.config,
            load_scenarios(),
            target_resolver=resolve_target(store),
            progress=progress,
            run=run,
        )
    except Exception as e:
        run.status, run.error, run.finished_at = "failed", f"{type(e).__name__}: {e}", time.time()
        result = run
    store.save_run(result)
    return result


class InProcessRunner:
    def __init__(self, store: Store):
        self.store = store
        self.pool = ThreadPoolExecutor(max_workers=MAX_PARALLEL_RUNS, thread_name_prefix="agentshield-run")

    def submit(self, run_id: str) -> None:
        self.pool.submit(execute_run, self.store, run_id)


class RedisRunner:
    def __init__(self, store: Store, url: str):
        import redis

        self.store = store
        self.r = redis.Redis.from_url(url)

    def submit(self, run_id: str) -> None:
        self.r.lpush(QUEUE_KEY, run_id)


def make_runner(store: Store):
    url = os.environ.get("REDIS_URL")
    return RedisRunner(store, url) if url else InProcessRunner(store)


def worker_loop(store: Store, url: str, stop: threading.Event | None = None) -> None:
    """Blocking consumer for `agentshield worker`."""
    import redis

    r = redis.Redis.from_url(url)
    sem = threading.Semaphore(MAX_PARALLEL_RUNS)
    while not (stop and stop.is_set()):
        item = r.brpop([QUEUE_KEY], timeout=2)
        if not item:
            continue
        run_id = item[1].decode()
        sem.acquire()

        def work(rid: str = run_id) -> None:
            try:
                execute_run(store, rid)
            finally:
                sem.release()

        threading.Thread(target=work, daemon=True).start()
