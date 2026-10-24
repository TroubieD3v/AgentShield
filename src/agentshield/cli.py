"""Headless CLI for local use and CI/CD."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import typer

from . import __version__
from .evaluation.scoring import build_findings, compare_runs
from .models import SEVERITY_WEIGHT, Severity, Status
from .policy import list_policies, load_policy
from .reports import FORMATS, render
from .results import RunConfig, SuiteRun
from .scenarios import load_scenarios

app = typer.Typer(add_completion=False, no_args_is_help=True, help="AgentShield: agent security assessment from the command line.")
baseline_app = typer.Typer(no_args_is_help=True, help="Save and check baselines for regression gates.")
app.add_typer(baseline_app, name="baseline")

COLORS = {"PASS": "green", "FAIL": "red", "SUSPICIOUS": "yellow", "INCONCLUSIVE": "bright_black", "ERROR": "magenta"}
BASELINE_DIR = Path(os.environ.get("AGENTSHIELD_HOME", ".agentshield")) / "baselines"


def _version(value: bool) -> None:
    if value:
        typer.echo(f"agentshield {__version__}")
        raise typer.Exit()


@app.callback()
def main(version: bool = typer.Option(False, "--version", callback=_version, is_eager=True)) -> None:
    pass


def _load_run(path: Path) -> SuiteRun:
    data = json.loads(path.read_text(encoding="utf-8"))
    data.pop("findings", None)
    return SuiteRun.model_validate(data)


@app.command("list")
def list_cmd(category: str = typer.Option(None, "--category", "-c"), agent: str = typer.Option(None, "--agent", "-a")) -> None:
    """List scenarios (expanded variants included)."""
    for s in load_scenarios():
        if category and s.category != category or agent and s.target.agent != agent:
            continue
        typer.echo(f"{s.key:70s} {s.category:30s} {s.severity.value:9s} {s.target.agent}")


@app.command()
def validate() -> None:
    """Validate every scenario and policy file (use in CI when you add your own)."""
    scs = load_scenarios()
    pols = list_policies()
    typer.echo(f"OK: {len({s.id for s in scs})} scenarios ({len(scs)} cases), {len(pols)} policies")


@app.command()
def policies() -> None:
    """Show the available policy sets."""
    for p in list_policies():
        typer.echo(f"{p.id:12s} {len(p.rules):2d} rules  {p.description}")


@app.command()
def run(
    variant: str = typer.Option("unsafe", help="built-in agent variant: unsafe | partial | hardened"),
    mode: str = typer.Option("monitor", help="monitor | enforce"),
    policy: str = typer.Option("default"),
    scenario: list[str] = typer.Option(None, "--scenario", "-s", help="scenario id (repeatable)"),
    category: list[str] = typer.Option(None, "--category", "-c"),
    agent: list[str] = typer.Option(None, "--agent", "-a"),
    repeat: int = typer.Option(None, help="repeats per case (useful for LLM brains)"),
    target: str = typer.Option("builtin", help="'builtin' or a registered HTTP target name"),
    target_file: Path = typer.Option(None, "--target-file", help="YAML file describing an HTTP target"),
    brain: str = typer.Option("simulated", help="simulated | llm"),
    model: str = typer.Option(None, help="registered model name when --brain llm"),
    label: str = typer.Option("", help="free-text label stored with the run"),
    workers: int = typer.Option(4, help="parallel scenarios (max 8)"),
    fmt: list[str] = typer.Option(None, "--format", "-f", help=f"{'|'.join(FORMATS)} (repeatable, use with --output-dir)"),
    output: Path = typer.Option(None, "--output", "-o", help="write the single --format to this file"),
    output_dir: Path = typer.Option(None, "--output-dir", help="write every --format into this directory"),
    fail_on: str = typer.Option("high", help="exit 1 when a FAIL at/above this severity exists: critical|high|medium|low|none"),
    fail_on_suspicious: bool = typer.Option(False, help="also fail on SUSPICIOUS results"),
    fail_on_inconclusive: bool = typer.Option(False, help="also fail on INCONCLUSIVE/ERROR results"),
    quiet: bool = typer.Option(False, "--quiet", "-q"),
) -> None:
    """Run the scenario suite headless. Exit codes: 0 ok, 1 gate failed, 2 error."""
    from .service import run_config

    cfg = RunConfig(
        target=target, variant=variant, mode=mode, policy=policy, scenarios=scenario or [], categories=category or [],
        agents=agent or [], repeat=repeat, brain=brain, model=model, label=label,
    )
    resolver = None
    if target_file:
        import yaml

        from .connectors.http_agent import HttpTarget, TargetSpec

        spec = TargetSpec.model_validate(yaml.safe_load(target_file.read_text(encoding="utf-8")))
        cfg.target = spec.name
        resolver = lambda c: HttpTarget(spec)  # noqa: E731
    try:
        load_policy(policy)
        result = run_config(cfg, load_scenarios(), target_resolver=resolver, max_workers=workers)
    except Exception as e:
        typer.secho(f"error: {type(e).__name__}: {e}", fg="red", err=True)
        raise typer.Exit(2) from e
    if result.status != "completed":
        typer.secho(f"run {result.status}: {result.error}", fg="red", err=True)
        raise typer.Exit(2)

    if not quiet:
        for c in result.cases:
            mark = typer.style(f"{c.status.value:12s}", fg=COLORS[c.status.value]) + (" *" if c.mitigated else "  ")
            typer.echo(f"{mark} {c.severity.value:8s} {c.name[:70]}")
        s = result.summary
        typer.echo("")
        typer.echo(
            f"score {s.score}/100 | coverage {round(s.coverage * 100)}% | "
            + " ".join(f"{k} {v}" for k, v in s.counts.items() if v)
            + f" | violations attempted {s.policy_violations_attempted} / effective {s.policy_violations_effective}"
            + (f" | * {s.mitigated} mitigated (passed only because a defense blocked an attempt)" if s.mitigated else "")
        )
    formats = fmt or ([output.suffix.lstrip(".")] if output and output.suffix else [])
    if output and len(formats) == 1:
        f = {"markdown": "md", "sarif": "sarif", "json": "json", "html": "html", "md": "md"}.get(formats[0], formats[0])
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(render(result, f), encoding="utf-8")
        if not quiet:
            typer.echo(f"wrote {output}")
    elif formats:
        out = output_dir or Path("reports-out")
        out.mkdir(parents=True, exist_ok=True)
        for f in formats:
            path = out / f"agentshield.{ 'sarif' if f == 'sarif' else f}"
            path.write_text(render(result, f), encoding="utf-8")
            if not quiet:
                typer.echo(f"wrote {path}")

    threshold = None if fail_on == "none" else SEVERITY_WEIGHT[Severity(fail_on)]
    failed = threshold is not None and any(c.status == Status.FAIL and SEVERITY_WEIGHT[c.severity] >= threshold for c in result.cases)
    failed |= fail_on_suspicious and any(c.status == Status.SUSPICIOUS for c in result.cases)
    failed |= fail_on_inconclusive and any(c.status in (Status.INCONCLUSIVE, Status.ERROR) for c in result.cases)
    raise typer.Exit(1 if failed else 0)


@app.command()
def report(run_file: Path, fmt: str = typer.Option("html", "--format", "-f"), output: Path = typer.Option(None, "--output", "-o")) -> None:
    """Re-render a saved JSON run as html / md / sarif."""
    text = render(_load_run(run_file), fmt)
    if output:
        output.write_text(text, encoding="utf-8")
        typer.echo(f"wrote {output}")
    else:
        typer.echo(text)


@app.command()
def compare(a: Path, b: Path, fail_on_regression: bool = typer.Option(False)) -> None:
    """Compare two saved JSON runs (two models, two agent versions, before/after a fix)."""
    result = compare_runs(_load_run(a), _load_run(b))
    typer.echo(f"score {result['a']['score']} -> {result['b']['score']} ({result['delta_score']:+})")
    for row in result["categories"]:
        typer.echo(f"  {row['category']:32s} {row['a']!s:>6} -> {row['b']!s:>6}")
    for r in result["regressions"]:
        typer.secho(f"  REGRESSION {r['name']}: {r['from']} -> {r['to']}", fg="red")
    for r in result["improvements"]:
        typer.secho(f"  improved   {r['name']}: {r['from']} -> {r['to']}", fg="green")
    if fail_on_regression and result["regressions"]:
        raise typer.Exit(1)


@baseline_app.command("save")
def baseline_save(run_file: Path, name: str = typer.Option("main", "--name")) -> None:
    BASELINE_DIR.mkdir(parents=True, exist_ok=True)
    dest = BASELINE_DIR / f"{name}.json"
    dest.write_text(run_file.read_text(encoding="utf-8"), encoding="utf-8")
    typer.echo(f"baseline '{name}' saved to {dest}")


@baseline_app.command("check")
def baseline_check(run_file: Path, name: str = typer.Option("main", "--name")) -> None:
    """Exit 1 when the run regressed against the baseline."""
    src = BASELINE_DIR / f"{name}.json"
    if not src.is_file():
        typer.secho(f"no baseline named '{name}' (looked in {BASELINE_DIR})", fg="red", err=True)
        raise typer.Exit(2)
    result = compare_runs(_load_run(src), _load_run(run_file))
    for r in result["regressions"]:
        typer.secho(f"REGRESSION {r['name']}: {r['from']} -> {r['to']}", fg="red")
    typer.echo(f"score {result['a']['score']} -> {result['b']['score']} ({result['delta_score']:+}), {len(result['regressions'])} regression(s)")
    raise typer.Exit(1 if result["regressions"] else 0)


@app.command("pytest-gen")
def pytest_gen(output: Path = typer.Option("test_agent_security.py", "--output", "-o")) -> None:
    """Generate a pytest file with one test per scenario (configure with AGENTSHIELD_* env vars)."""
    keys = [s.key for s in load_scenarios()]
    body = (
        '"""Generated by `agentshield pytest-gen`. Set AGENTSHIELD_VARIANT / _MODE / _POLICY to choose what to test."""\n'
        "import pytest\n"
        "from agentshield.pytest_support import assert_scenario\n\n"
        f"SCENARIOS = {json.dumps(keys, indent=4)}\n\n\n"
        '@pytest.mark.parametrize("key", SCENARIOS)\n'
        "def test_scenario(key):\n"
        "    assert_scenario(key)\n"
    )
    output.write_text(body, encoding="utf-8")
    typer.echo(f"wrote {output} ({len(keys)} tests)")


@app.command()
def findings(run_file: Path) -> None:
    """Print the findings of a saved JSON run."""
    for f in build_findings(_load_run(run_file)):
        typer.echo(f"{f.id} {f.severity.value:8s} {f.status.value:10s} {f.title}\n    {f.description[:200]}")


@app.command()
def serve(host: str = "127.0.0.1", port: int = 8080, reload: bool = False) -> None:
    """Start the API and web UI."""
    import uvicorn

    loopback = host in {"127.0.0.1", "localhost", "::1"}
    if not loopback and not (os.environ.get("AGENTSHIELD_API_TOKEN") or os.environ.get("AGENTSHIELD_ALLOW_BIND_ALL")):
        typer.secho(
            "refusing to bind a non-loopback address without AGENTSHIELD_API_TOKEN "
            "(inside a container, publish the port on 127.0.0.1 and set AGENTSHIELD_ALLOW_BIND_ALL=1)",
            fg="red",
            err=True,
        )
        raise typer.Exit(2)
    uvicorn.run("agentshield.api.app:create_app", host=host, port=port, factory=True, reload=reload)


@app.command()
def worker() -> None:
    """Run a queue worker (needs REDIS_URL)."""
    from .jobs import worker_loop
    from .storage import Store

    url = os.environ.get("REDIS_URL")
    if not url:
        typer.secho("REDIS_URL is not set", fg="red", err=True)
        raise typer.Exit(2)
    typer.echo("worker started")
    worker_loop(Store(), url)


@app.command()
def docs(output_dir: Path = typer.Option(Path("docs"), "--output-dir")) -> None:
    """Regenerate docs/SCENARIOS.md and docs/POLICIES.md."""
    from .docgen import render_policies_md, render_scenarios_md

    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "SCENARIOS.md").write_text(render_scenarios_md(), encoding="utf-8", newline="\n")
    (output_dir / "POLICIES.md").write_text(render_policies_md(), encoding="utf-8", newline="\n")
    typer.echo(f"wrote {output_dir / 'SCENARIOS.md'} and {output_dir / 'POLICIES.md'}")


@app.command()
def demo() -> None:
    """Show the policy engine on one simulated attack: Monitor vs Enforce (mock tools only)."""
    from .playground import Injection, PlaygroundRequest, run_playground

    for mode in ("monitor", "enforce"):
        r = run_playground(PlaygroundRequest(mode=mode, injection=Injection(fixture="injected-report.txt")))
        typer.secho(f"\n== {mode.upper()} ==", bold=True)
        for e in r.trace.events:
            if e.type.value in {"user_message", "tool_call", "policy_decision"}:
                tag = e.policy.decision if e.policy else ""
                typer.echo(f"  #{e.seq:<2} {e.type.value:16s} {e.title:18s} {tag}")
        typer.echo(f"  outbox: {len(r.world['outbox'])} mock email(s) sent")


if __name__ == "__main__":  # pragma: no cover
    app()
    sys.exit(0)
