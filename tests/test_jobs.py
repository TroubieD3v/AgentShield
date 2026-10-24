"""Queue path: API enqueues to Redis, a worker consumes and stores the result. Redis itself is faked."""

import sys
import threading
import time
import types
from collections import deque

from agentshield.jobs import InProcessRunner, RedisRunner, execute_run, worker_loop
from agentshield.results import RunConfig, SuiteRun
from agentshield.storage import Store


class FakeRedis:
    queues: dict[str, deque] = {}

    @classmethod
    def from_url(cls, url):
        return cls()

    def lpush(self, key, value):
        self.queues.setdefault(key, deque()).appendleft(value.encode() if isinstance(value, str) else value)

    def brpop(self, keys, timeout=0):
        end = time.time() + timeout
        while time.time() < end:
            for k in keys:
                if self.queues.get(k):
                    return k, self.queues[k].pop()
            time.sleep(0.02)
        return None

    def ping(self):
        return True


def queued_run(store, **cfg):
    run = SuiteRun(config=RunConfig(**cfg), status="queued")
    store.save_run(run)
    return run.id


def test_execute_run_persists_result_and_traces():
    store = Store("sqlite://")
    rid = queued_run(store, variant="hardened", categories=["benign_control"])
    execute_run(store, rid)
    run = store.get_run(rid, with_traces=True)
    assert run.status == "completed" and run.summary.score == 100
    assert all(c.traces for c in run.cases)


def test_execute_run_records_failure_for_unknown_target():
    store = Store("sqlite://")
    rid = queued_run(store, target="ghost")
    execute_run(store, rid)
    assert store.get_run(rid).status == "failed"


def test_redis_queue_worker_roundtrip(monkeypatch):
    fake = types.ModuleType("redis")
    fake.Redis = FakeRedis
    monkeypatch.setitem(sys.modules, "redis", fake)
    FakeRedis.queues.clear()
    store = Store("sqlite://")
    rid = queued_run(store, variant="unsafe", categories=["tool_misuse"])
    RedisRunner(store, "redis://fake").submit(rid)
    stop = threading.Event()
    t = threading.Thread(target=worker_loop, args=(store, "redis://fake", stop), daemon=True)
    t.start()
    for _ in range(100):
        if store.get_run(rid).status == "completed":
            break
        time.sleep(0.1)
    stop.set()
    run = store.get_run(rid)
    assert run.status == "completed" and run.summary.counts["FAIL"] > 0


def test_in_process_runner_executes():
    store = Store("sqlite://")
    rid = queued_run(store, variant="hardened", categories=["benign_control"])
    InProcessRunner(store).submit(rid)
    for _ in range(100):
        if store.get_run(rid).status == "completed":
            break
        time.sleep(0.1)
    assert store.get_run(rid).status == "completed"
