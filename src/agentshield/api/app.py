"""FastAPI backend: projects, scenarios, runs, traces, findings, policies, reports, guard proxy."""

from __future__ import annotations

import hmac
import os
import secrets
import threading
from pathlib import Path
from typing import Any

import yaml
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .. import __version__
from ..agents import agents_info
from ..connectors.http_agent import HttpTarget, TargetSpec
from ..evaluation.scoring import build_findings, compare_runs
from ..gateway import HostNotAllowed, ModelClient, ModelSpec, default_allowlist
from ..jobs import make_runner
from ..playground import PlaygroundRequest, list_fixtures, run_playground
from ..policy import list_policies, load_policy
from ..policy.engine import POLICY_DIR, user_policy_dir, validate_policy_doc
from ..reports import CONTENT_TYPES, FORMATS, render
from ..results import RunConfig, SuiteRun
from ..sandbox.world import LIBRARY
from ..scenarios import load_scenarios
from ..sdk import Guard
from ..storage import Store

MAX_REPEAT = 20
MAX_SCENARIOS = 500


class RunRequest(RunConfig):
    pass


class BaselineRequest(BaseModel):
    name: str = Field(pattern=r"^[\w.\-]{1,60}$")
    run_id: str


class PolicyUpload(BaseModel):
    yaml: str


class GuardCreate(BaseModel):
    policy: str = "default"
    mode: str = "monitor"
    principal: str = "user"
    canaries: dict[str, str] = Field(default_factory=dict)


class GuardCall(BaseModel):
    tool: str
    arguments: dict[str, Any] = Field(default_factory=dict)


class GuardText(BaseModel):
    text: str
    source: str = "retrieved"


def _mask_target(t: TargetSpec) -> dict[str, Any]:
    d = t.model_dump(mode="json")
    d["headers"] = {k: ("***" if v else "") for k, v in t.headers.items()}
    return d


def _mount_ui(app: FastAPI, root: Path) -> None:
    """Serve the built single-page UI; unknown paths fall back to index.html."""
    root = root.resolve()
    if (root / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=root / "assets"), name="assets")
    index = root / "index.html"

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> Response:
        if path.startswith("api/"):
            raise HTTPException(404)
        f = (root / path).resolve()
        if path and f.is_file() and root in f.parents:
            return FileResponse(f)
        return FileResponse(index)


def create_app(store: Store | None = None, runner: Any | None = None, api_token: str | None = None) -> FastAPI:
    store = store or Store()
    runner = runner or make_runner(store)
    token = api_token if api_token is not None else os.environ.get("AGENTSHIELD_API_TOKEN")
    app = FastAPI(title="AgentShield", version=__version__, docs_url="/api/docs", openapi_url="/api/openapi.json")
    app.state.store = store
    scenarios = load_scenarios()
    guards: dict[str, Guard] = {}
    guard_lock = threading.Lock()

    allowed_hosts = {h.strip().lower() for h in os.environ.get("AGENTSHIELD_UI_HOSTS", "localhost,127.0.0.1,[::1],testserver").split(",") if h.strip()}

    @app.middleware("http")
    async def host_guard(request: Request, call_next):  # DNS-rebinding protection for the local UI
        if not token:
            host = (request.headers.get("host") or "").rsplit(":", 1)[0].lower() if not (request.headers.get("host") or "").startswith("[") else "[::1]"
            if host not in allowed_hosts and "*" not in allowed_hosts:
                return JSONResponse({"detail": f"host '{host}' is not allowed; set AGENTSHIELD_UI_HOSTS or AGENTSHIELD_API_TOKEN"}, status_code=400)
        resp = await call_next(request)
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["Referrer-Policy"] = "no-referrer"
        if not request.url.path.startswith("/api/runs") or "report" not in request.url.path:
            resp.headers.setdefault("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'")
        return resp

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

    def auth(request: Request) -> None:
        if not token:
            if request.method in {"POST", "DELETE"} and request.headers.get("content-type", "").split(";")[0] not in {"application/json", ""}:
                raise HTTPException(415, "JSON bodies only")
            return
        given = request.headers.get("authorization", "")
        if not hmac.compare_digest(given.encode(), f"Bearer {token}".encode()):
            raise HTTPException(401, "missing or invalid bearer token")

    api = Depends(auth)

    # ------------------------------------------------------------------ meta
    @app.get("/api/health")
    def health() -> dict[str, Any]:
        return {"status": "ok", "version": __version__}

    @app.get("/api/meta", dependencies=[api])
    def meta() -> dict[str, Any]:
        tax = yaml.safe_load((LIBRARY / "taxonomy.yaml").read_text(encoding="utf-8"))
        return {
            "version": __version__,
            "auth_required": bool(token),
            "queue": "redis" if os.environ.get("REDIS_URL") else "in-process",
            "database": store.engine.dialect.name,
            "agents": agents_info(),
            "policies": [{"id": p.id, "description": p.description, "rules": len(p.rules)} for p in list_policies()],
            "taxonomy": tax,
            "limits": {"max_repeat": MAX_REPEAT, "max_scenarios": MAX_SCENARIOS},
            "allowed_hosts": default_allowlist().hosts,
            "formats": list(FORMATS),
        }

    # ------------------------------------------------------------------ scenarios
    @app.get("/api/scenarios", dependencies=[api])
    def scenario_list() -> list[dict[str, Any]]:
        out: dict[str, dict[str, Any]] = {}
        for s in scenarios:
            e = out.setdefault(
                s.id,
                {
                    "id": s.id,
                    "name": s.name,
                    "version": s.version,
                    "category": s.category,
                    "severity": s.severity.value,
                    "owasp": s.owasp,
                    "agent": s.target.agent,
                    "description": s.description,
                    "remediation": s.remediation,
                    "source": s.source,
                    "steps": [st.model_dump(exclude_none=True) for st in s.steps],
                    "assertions": [a.model_dump(exclude_none=True) for a in s.assertions],
                    "repeat": s.repeat,
                    "variants": [],
                },
            )
            if s.variant:
                e["variants"].append(s.variant)
        return list(out.values())

    # ------------------------------------------------------------------ policies
    @app.get("/api/policies", dependencies=[api])
    def policies() -> list[dict[str, Any]]:
        return [p.model_dump(mode="json") for p in list_policies()]

    @app.get("/api/policies/{pid}/source", dependencies=[api])
    def policy_source(pid: str) -> dict[str, str]:
        for d in (POLICY_DIR, user_policy_dir()):
            f = d / f"{pid}.yaml"
            if f.is_file() and f.resolve().parent == d.resolve():
                return {"id": pid, "yaml": f.read_text(encoding="utf-8")}
        raise HTTPException(404, "policy not found")

    @app.post("/api/policies/validate", dependencies=[api])
    def policy_validate(body: PolicyUpload) -> dict[str, Any]:
        try:
            doc = yaml.safe_load(body.yaml)
            validate_policy_doc(doc)
            return {"valid": True, "rules": len(doc.get("rules", []))}
        except Exception as e:
            return {"valid": False, "error": str(e)[:400]}

    @app.post("/api/policies", dependencies=[api])
    def policy_save(body: PolicyUpload) -> dict[str, Any]:
        try:
            doc = yaml.safe_load(body.yaml)
            validate_policy_doc(doc)
        except Exception as e:
            raise HTTPException(422, str(e)[:400]) from e
        if (POLICY_DIR / f"{doc['id']}.yaml").exists():
            raise HTTPException(409, "built-in policies are read-only; use a different id")
        d = user_policy_dir()
        d.mkdir(parents=True, exist_ok=True)
        (d / f"{doc['id']}.yaml").write_text(body.yaml, encoding="utf-8")
        return {"saved": doc["id"]}

    # ------------------------------------------------------------------ targets and models
    @app.get("/api/targets", dependencies=[api])
    def targets() -> list[dict[str, Any]]:
        return [_mask_target(t) for t in store.list_targets()]

    @app.post("/api/targets", dependencies=[api])
    def target_add(spec: TargetSpec) -> dict[str, Any]:
        try:
            HttpTarget(spec)  # allowlist check at registration
        except HostNotAllowed as e:
            raise HTTPException(422, str(e)) from e
        if spec.name == "builtin":
            raise HTTPException(422, "'builtin' is reserved")
        store.save_target(spec)
        return _mask_target(spec)

    @app.delete("/api/targets/{name}", dependencies=[api])
    def target_delete(name: str) -> dict[str, str]:
        store.delete_target(name)
        return {"deleted": name}

    @app.post("/api/targets/{name}/test", dependencies=[api])
    def target_test(name: str) -> dict[str, Any]:
        spec = store.get_target(name)
        if not spec:
            raise HTTPException(404, "unknown target")
        try:
            sess = HttpTarget(spec).open("", None, "ping")
            sess.execute("user_message", {"content": "Hello"})
            sess.execute("run_agent", {})
            obs = sess.observe()
            return {"ok": True, "response": (obs.responses[-1] if obs.responses else "")[:300], "telemetry": obs.telemetry.model_dump()}
        except Exception as e:
            return {"ok": False, "error": f"{type(e).__name__}: {e}"[:300]}

    @app.get("/api/models", dependencies=[api])
    def models() -> list[dict[str, Any]]:
        return [m.model_dump(mode="json") for m in store.list_models()]

    @app.post("/api/models", dependencies=[api])
    def model_add(spec: ModelSpec) -> dict[str, Any]:
        try:
            default_allowlist().check(spec.base_url)
        except HostNotAllowed as e:
            raise HTTPException(422, str(e)) from e
        store.save_model(spec)
        return spec.model_dump(mode="json")

    @app.delete("/api/models/{name}", dependencies=[api])
    def model_delete(name: str) -> dict[str, str]:
        store.delete_model(name)
        return {"deleted": name}

    @app.post("/api/models/{name}/test", dependencies=[api])
    def model_test(name: str) -> dict[str, Any]:
        spec = next((m for m in store.list_models() if m.name == name), None)
        if not spec:
            raise HTTPException(404, "unknown model")
        try:
            r = ModelClient(spec).chat([{"role": "user", "content": "Reply with the single word: ok"}])
            return {"ok": True, "response": r.content[:200], "usage": r.usage.model_dump()}
        except Exception as e:
            return {"ok": False, "error": f"{type(e).__name__}: {e}"[:300]}

    # ------------------------------------------------------------------ runs
    @app.post("/api/runs", status_code=202, dependencies=[api])
    def run_create(req: RunRequest) -> dict[str, Any]:
        warnings: list[str] = []
        if req.variant not in {"unsafe", "partial", "hardened"}:
            raise HTTPException(422, "variant must be unsafe | partial | hardened")
        if req.mode not in {"monitor", "enforce"}:
            raise HTTPException(422, "mode must be monitor | enforce")
        if req.repeat and not (1 <= req.repeat <= MAX_REPEAT):
            raise HTTPException(422, f"repeat must be between 1 and {MAX_REPEAT}")
        try:
            load_policy(req.policy)
        except FileNotFoundError as e:
            raise HTTPException(422, f"unknown policy '{req.policy}'") from e
        if req.target != "builtin":
            if not store.get_target(req.target):
                raise HTTPException(422, f"unknown target '{req.target}'")
            if req.mode == "enforce":
                req.mode = "monitor"
                warnings.append("Enforce needs the SDK or the guard proxy in the target's runtime; this HTTP target runs in Monitor mode.")
        if req.brain == "llm" and (not req.model or not any(m.name == req.model for m in store.list_models())):
            raise HTTPException(422, "brain=llm needs a registered model")
        selected = [s for s in scenarios if (not req.scenarios or s.id in req.scenarios) and (not req.categories or s.category in req.categories) and (not req.agents or s.target.agent in req.agents)]
        if not selected:
            raise HTTPException(422, "no scenarios match the selection")
        if len(selected) > MAX_SCENARIOS:
            raise HTTPException(422, f"too many scenarios (max {MAX_SCENARIOS})")
        run = SuiteRun(config=req, status="queued", agentshield_version=__version__)
        run.progress = {"done": 0, "total": len(selected)}
        store.save_run(run)
        runner.submit(run.id)
        return {"id": run.id, "status": run.status, "total": len(selected), "warnings": warnings}

    @app.get("/api/runs", dependencies=[api])
    def run_list(limit: int = Query(50, le=200)) -> list[dict[str, Any]]:
        return store.list_runs(limit)

    def _run(run_id: str, traces: bool = False) -> SuiteRun:
        run = store.get_run(run_id, with_traces=traces)
        if not run:
            raise HTTPException(404, "run not found")
        return run

    @app.get("/api/runs/{run_id}", dependencies=[api])
    def run_get(run_id: str) -> dict[str, Any]:
        run = _run(run_id)
        data = run.model_dump(mode="json")
        data["findings"] = [f.model_dump(mode="json") for f in build_findings(run)]
        return data

    @app.delete("/api/runs/{run_id}", dependencies=[api])
    def run_delete(run_id: str) -> dict[str, str]:
        store.delete_run(run_id)
        return {"deleted": run_id}

    @app.get("/api/runs/{run_id}/report", dependencies=[api])
    def run_report(run_id: str, format: str = "html", download: bool = False) -> Response:
        if format not in FORMATS:
            raise HTTPException(422, f"format must be one of {', '.join(FORMATS)}")
        body = render(_run(run_id, traces=True), format)
        headers = {"Content-Disposition": f'attachment; filename="agentshield-{run_id}.{ "sarif" if format == "sarif" else format}"'} if download else {}
        if format == "html":
            headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; img-src data:"
        return Response(body, media_type=CONTENT_TYPES[format], headers=headers)

    @app.get("/api/runs/{run_id}/regression", dependencies=[api])
    def run_regression(run_id: str, baseline: str) -> dict[str, Any]:
        base_id = store.get_baseline(baseline)
        if not base_id:
            raise HTTPException(404, "unknown baseline")
        result = compare_runs(_run(base_id), _run(run_id))
        result["passed"] = not result["regressions"]
        return result

    @app.get("/api/compare", dependencies=[api])
    def compare(a: str, b: str) -> dict[str, Any]:
        return compare_runs(_run(a), _run(b))

    # ------------------------------------------------------------------ traces
    @app.get("/api/traces/{trace_id}", dependencies=[api])
    def trace_get(trace_id: str, format: str = "native") -> Any:
        tr = store.get_trace(trace_id)
        if not tr:
            raise HTTPException(404, "trace not found")
        return tr.to_otel_spans() if format == "otel" else tr.model_dump(mode="json")

    # ------------------------------------------------------------------ findings, dashboard
    @app.get("/api/findings", dependencies=[api])
    def findings(run_id: str | None = None) -> dict[str, Any]:
        if not run_id:
            done = [r for r in store.list_runs(50) if r["status"] == "completed"]
            if not done:
                return {"run_id": None, "findings": []}
            run_id = done[0]["id"]
        return {"run_id": run_id, "findings": [f.model_dump(mode="json") for f in build_findings(_run(run_id))]}

    @app.get("/api/dashboard", dependencies=[api])
    def dashboard() -> dict[str, Any]:
        runs = [r for r in store.list_runs(50) if r["status"] == "completed"]
        last = _run(runs[0]["id"]) if runs else None
        return {
            "scenario_definitions": len({s.id for s in scenarios}),
            "scenario_cases": len(scenarios),
            "runs_total": len(store.list_runs(200)),
            "last_run": (
                {
                    "id": last.id,
                    "label": last.config.label or f"{last.config.variant}/{last.config.mode}",
                    "summary": last.summary.model_dump(mode="json"),
                    "findings": len(build_findings(last)),
                    "config": last.config.model_dump(mode="json"),
                }
                if last
                else None
            ),
            "trend": [{"id": r["id"], "label": r["label"] or f"{r['variant']}/{r['mode']}", "score": r["score"], "started_at": r["started_at"]} for r in reversed(runs[:20])],
            "baselines": store.list_baselines(),
        }

    @app.post("/api/baselines", dependencies=[api])
    def baseline_set(body: BaselineRequest) -> dict[str, str]:
        _run(body.run_id)
        store.set_baseline(body.name, body.run_id)
        return {"name": body.name, "run_id": body.run_id}

    @app.get("/api/baselines", dependencies=[api])
    def baselines() -> list[dict[str, Any]]:
        return store.list_baselines()

    # ------------------------------------------------------------------ playground
    @app.get("/api/fixtures", dependencies=[api])
    def fixtures() -> list[dict[str, str]]:
        return list_fixtures()

    @app.post("/api/playground/simulate", dependencies=[api])
    def playground(req: PlaygroundRequest) -> dict[str, Any]:
        try:
            return run_playground(req).model_dump(mode="json")
        except (KeyError, FileNotFoundError) as e:
            raise HTTPException(422, str(e)) from e

    # ------------------------------------------------------------------ guard proxy (real Enforce for any runtime)
    @app.post("/api/guard/sessions", dependencies=[api])
    def guard_create(body: GuardCreate) -> dict[str, str]:
        with guard_lock:
            if len(guards) >= 100:
                guards.pop(next(iter(guards)))
            gid = secrets.token_urlsafe(9)
            try:
                guards[gid] = Guard(body.policy, body.mode, body.principal, body.canaries)
            except FileNotFoundError as e:
                raise HTTPException(422, str(e)) from e
        return {"id": gid}

    def _guard(gid: str) -> Guard:
        g = guards.get(gid)
        if not g:
            raise HTTPException(404, "guard session not found")
        return g

    @app.post("/api/guard/{gid}/user_message", dependencies=[api])
    def guard_user(gid: str, body: GuardText) -> dict[str, bool]:
        _guard(gid).user_message(body.text)
        return {"ok": True}

    @app.post("/api/guard/{gid}/untrusted", dependencies=[api])
    def guard_untrusted(gid: str, body: GuardText) -> dict[str, bool]:
        _guard(gid).untrusted(body.text, body.source)
        return {"ok": True}

    @app.post("/api/guard/{gid}/evaluate", dependencies=[api])
    def guard_eval(gid: str, body: GuardCall) -> dict[str, Any]:
        d = _guard(gid).evaluate(body.tool, body.arguments)
        return {"allow": not d.blocked, **d.model_dump(mode="json")}

    @app.get("/api/guard/{gid}/trace", dependencies=[api])
    def guard_trace(gid: str) -> Any:
        return _guard(gid).trace.redacted().model_dump(mode="json")

    # ------------------------------------------------------------------ UI
    ui_env = os.environ.get("AGENTSHIELD_UI_DIR")
    candidates = ([Path(ui_env)] if ui_env else []) + [Path(__file__).resolve().parent.parent / "ui", Path.cwd() / "web" / "dist"]
    for cand in candidates:
        if (cand / "index.html").is_file():
            _mount_ui(app, cand)
            break

    return app
