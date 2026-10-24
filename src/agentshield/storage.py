"""Persistence: SQLAlchemy (SQLite for local use, PostgreSQL in Docker Compose)."""

from __future__ import annotations

import json
import os
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from sqlalchemy import Column, Float, Integer, MetaData, String, Table, Text, create_engine, delete, select
from sqlalchemy.engine import Engine
from sqlalchemy.pool import StaticPool

from .connectors.http_agent import TargetSpec
from .gateway.client import ModelSpec
from .redaction import redact
from .results import SuiteRun
from .trace import Trace

meta = MetaData()
runs_t = Table(
    "runs",
    meta,
    Column("id", String(40), primary_key=True),
    Column("status", String(20)),
    Column("started_at", Float),
    Column("finished_at", Float, nullable=True),
    Column("label", String(200), default=""),
    Column("variant", String(40)),
    Column("mode", String(20)),
    Column("score", Float, default=0),
    Column("data", Text),
)
traces_t = Table(
    "traces",
    meta,
    Column("trace_id", String(40), primary_key=True),
    Column("run_id", String(40), index=True),
    Column("case_key", String(300)),
    Column("data", Text),
)
targets_t = Table("targets", meta, Column("name", String(100), primary_key=True), Column("data", Text))
models_t = Table("models", meta, Column("name", String(100), primary_key=True), Column("data", Text))
baselines_t = Table(
    "baselines",
    meta,
    Column("name", String(100), primary_key=True),
    Column("run_id", String(40)),
    Column("created_at", Float),
)
settings_t = Table("settings", meta, Column("key", String(100), primary_key=True), Column("value", Text))
_ = Integer


def default_database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if url:
        # accept plain postgres:// URLs from hosting providers
        return url.replace("postgres://", "postgresql+psycopg://", 1).replace("postgresql://", "postgresql+psycopg://", 1)
    path = Path(os.environ.get("AGENTSHIELD_HOME", ".agentshield"))
    path.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{(path / 'agentshield.db').as_posix()}"


class Store:
    def __init__(self, url: str | None = None):
        url = url or default_database_url()
        kwargs: dict[str, Any] = {}
        if url.startswith("sqlite"):
            kwargs["connect_args"] = {"check_same_thread": False}
            if ":memory:" in url or url == "sqlite://":
                kwargs["poolclass"] = StaticPool
        self.engine: Engine = create_engine(url, **kwargs)
        self._lock = threading.RLock()  # one writer at a time; also makes shared in-memory SQLite safe
        meta.create_all(self.engine)

    @contextmanager
    def _tx(self) -> Iterator[Any]:
        with self._lock, self.engine.begin() as cx:
            yield cx

    # ---------------------------------------------------------------- runs
    def save_run(self, run: SuiteRun) -> None:
        """Persist a run; traces go to their own table (redacted again defensively)."""
        slim = run.model_copy(deep=True)
        trace_rows = []
        for c in slim.cases:
            for t in c.traces:
                trace_rows.append({"trace_id": t.trace_id, "run_id": run.id, "case_key": c.key, "data": json.dumps(redact(t.model_dump(mode="json")))})
            c.traces = []
        values = {
            "id": run.id,
            "status": run.status,
            "started_at": run.started_at,
            "finished_at": run.finished_at,
            "label": run.config.label,
            "variant": run.config.variant,
            "mode": run.config.mode,
            "score": run.summary.score,
            "data": slim.model_dump_json(),
        }
        with self._tx() as cx:
            cx.execute(delete(runs_t).where(runs_t.c.id == run.id))
            cx.execute(runs_t.insert().values(**values))
            if trace_rows:
                cx.execute(delete(traces_t).where(traces_t.c.run_id == run.id))
                cx.execute(traces_t.insert(), trace_rows)

    def get_run(self, run_id: str, with_traces: bool = False) -> SuiteRun | None:
        with self._tx() as cx:
            row = cx.execute(select(runs_t.c.data).where(runs_t.c.id == run_id)).first()
            if not row:
                return None
            run = SuiteRun.model_validate_json(row[0])
            if with_traces:
                by_case: dict[str, list[Trace]] = {}
                for r in cx.execute(select(traces_t.c.case_key, traces_t.c.data).where(traces_t.c.run_id == run_id)):
                    by_case.setdefault(r[0], []).append(Trace.model_validate_json(r[1]))
                for c in run.cases:
                    c.traces = by_case.get(c.key, [])
            return run

    def list_runs(self, limit: int = 100) -> list[dict[str, Any]]:
        with self._tx() as cx:
            rows = cx.execute(select(runs_t).order_by(runs_t.c.started_at.desc()).limit(limit)).mappings().all()
        return [
            {k: r[k] for k in ("id", "status", "started_at", "finished_at", "label", "variant", "mode", "score")}
            for r in rows
        ]

    def delete_run(self, run_id: str) -> None:
        with self._tx() as cx:
            cx.execute(delete(traces_t).where(traces_t.c.run_id == run_id))
            cx.execute(delete(runs_t).where(runs_t.c.id == run_id))

    def get_trace(self, trace_id: str) -> Trace | None:
        with self._tx() as cx:
            row = cx.execute(select(traces_t.c.data).where(traces_t.c.trace_id == trace_id)).first()
        return Trace.model_validate_json(row[0]) if row else None

    # ---------------------------------------------------------------- targets / models
    def save_target(self, spec: TargetSpec) -> None:
        self._put(targets_t, spec.name, spec.model_dump_json())

    def list_targets(self) -> list[TargetSpec]:
        return [TargetSpec.model_validate_json(d) for d in self._all(targets_t)]

    def get_target(self, name: str) -> TargetSpec | None:
        d = self._get(targets_t, name)
        return TargetSpec.model_validate_json(d) if d else None

    def delete_target(self, name: str) -> None:
        self._del(targets_t, name)

    def save_model(self, spec: ModelSpec) -> None:
        self._put(models_t, spec.name, spec.model_dump_json())

    def list_models(self) -> list[ModelSpec]:
        return [ModelSpec.model_validate_json(d) for d in self._all(models_t)]

    def delete_model(self, name: str) -> None:
        self._del(models_t, name)

    # ---------------------------------------------------------------- baselines
    def set_baseline(self, name: str, run_id: str) -> None:
        with self._tx() as cx:
            cx.execute(delete(baselines_t).where(baselines_t.c.name == name))
            cx.execute(baselines_t.insert().values(name=name, run_id=run_id, created_at=time.time()))

    def list_baselines(self) -> list[dict[str, Any]]:
        with self._tx() as cx:
            return [dict(r) for r in cx.execute(select(baselines_t)).mappings().all()]

    def get_baseline(self, name: str) -> str | None:
        with self._tx() as cx:
            row = cx.execute(select(baselines_t.c.run_id).where(baselines_t.c.name == name)).first()
        return row[0] if row else None

    # ---------------------------------------------------------------- helpers
    def _put(self, table: Table, name: str, data: str) -> None:
        with self._tx() as cx:
            cx.execute(delete(table).where(table.c.name == name))
            cx.execute(table.insert().values(name=name, data=data))

    def _all(self, table: Table) -> list[str]:
        with self._tx() as cx:
            return [r[0] for r in cx.execute(select(table.c.data))]

    def _get(self, table: Table, name: str) -> str | None:
        with self._tx() as cx:
            row = cx.execute(select(table.c.data).where(table.c.name == name)).first()
        return row[0] if row else None

    def _del(self, table: Table, name: str) -> None:
        with self._tx() as cx:
            cx.execute(delete(table).where(table.c.name == name))
