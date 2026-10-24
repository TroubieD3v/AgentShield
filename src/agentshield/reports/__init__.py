"""Report renderers: JSON, Markdown, SARIF 2.1.0 and a self-contained HTML report."""

from __future__ import annotations

import json
from typing import Any

from ..evaluation.scoring import build_findings
from ..results import SuiteRun
from .html import render_html
from .markdown import render_markdown
from .sarif import render_sarif

FORMATS = ("json", "md", "html", "sarif")
CONTENT_TYPES = {
    "json": "application/json",
    "md": "text/markdown; charset=utf-8",
    "html": "text/html; charset=utf-8",
    "sarif": "application/sarif+json",
}


def render_json(run: SuiteRun, include_traces: bool = True) -> str:
    data: dict[str, Any] = run.model_dump(mode="json")
    if not include_traces:
        for c in data["cases"]:
            c.pop("traces", None)
    data["findings"] = [f.model_dump(mode="json") for f in build_findings(run)]
    return json.dumps(data, indent=2)


def render(run: SuiteRun, fmt: str) -> str:
    fmt = {"markdown": "md"}.get(fmt, fmt)
    if fmt == "json":
        return render_json(run)
    if fmt == "md":
        return render_markdown(run)
    if fmt == "html":
        return render_html(run)
    if fmt == "sarif":
        return render_sarif(run)
    raise ValueError(f"unknown report format '{fmt}' (choose from {', '.join(FORMATS)})")


__all__ = ["CONTENT_TYPES", "FORMATS", "render", "render_html", "render_json", "render_markdown", "render_sarif"]
