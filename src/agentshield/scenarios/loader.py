"""Load scenario YAML files, expanding parameter matrices into concrete variants."""

from __future__ import annotations

import itertools
import json
import re
from pathlib import Path
from typing import Any

import yaml

from ..sandbox.world import LIBRARY
from .schema import Scenario

SCENARIO_DIR = LIBRARY / "scenarios"
_VAR = re.compile(r"\$\{(\w+)\}")


def _substitute(obj: Any, values: dict[str, Any]) -> Any:
    if isinstance(obj, str):
        full = _VAR.fullmatch(obj)
        if full and full.group(1) in values:
            return values[full.group(1)]
        return _VAR.sub(lambda m: str(values.get(m.group(1), m.group(0))), obj)
    if isinstance(obj, dict):
        return {k: _substitute(v, values) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_substitute(v, values) for v in obj]
    return obj


def expand_scenario(raw: dict[str, Any]) -> list[Scenario]:
    params: dict[str, list[Any]] = raw.get("parameters") or {}
    if not params:
        return [Scenario.model_validate(raw)]
    names = list(params)
    out = []
    for combo in itertools.product(*(params[n] for n in names)):
        values = dict(zip(names, combo, strict=True))
        concrete = _substitute({k: v for k, v in raw.items() if k != "parameters"}, values)
        concrete["parameters"] = params
        sc = Scenario.model_validate(concrete)
        sc.variant = {k: (Path(v).stem if isinstance(v, str) and "." in v else v) for k, v in values.items()}
        out.append(sc)
    return out


def _remediation_defaults() -> dict[str, str]:
    doc = yaml.safe_load((LIBRARY / "taxonomy.yaml").read_text(encoding="utf-8")) or {}
    return doc.get("remediation_defaults", {})


def load_scenario_file(path: Path) -> list[Scenario]:
    docs = [d for d in yaml.safe_load_all(path.read_text(encoding="utf-8")) if d]
    scenarios: list[Scenario] = []
    for doc in docs:
        items = doc if isinstance(doc, list) else [doc]
        for raw in items:
            scenarios.extend(expand_scenario(raw))
    defaults = _remediation_defaults()
    for sc in scenarios:
        sc.source = path.name
        sc.remediation = sc.remediation or defaults.get(sc.category, "")
    return scenarios


def load_scenarios(directory: Path | None = None) -> list[Scenario]:
    root = directory or SCENARIO_DIR
    out: list[Scenario] = []
    for p in sorted(root.glob("*.yaml")):
        out.extend(load_scenario_file(p))
    seen: set[str] = set()
    for s in out:
        if s.key in seen:
            raise ValueError(f"duplicate scenario key: {s.key}")
        seen.add(s.key)
    return out


def scenario_to_json(s: Scenario) -> str:
    return json.dumps(s.model_dump(mode="json"), indent=2)
