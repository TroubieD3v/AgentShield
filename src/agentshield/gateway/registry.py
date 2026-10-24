"""Registry of model endpoints (API keys are referenced by env var name, never stored)."""

from __future__ import annotations

import os
from pathlib import Path

import yaml

from .client import ModelSpec

DEFAULT_FILES = ["agentshield.models.yaml", ".agentshield/models.yaml"]


class ModelRegistry:
    def __init__(self) -> None:
        self._models: dict[str, ModelSpec] = {}

    def add(self, spec: ModelSpec) -> None:
        self._models[spec.name] = spec

    def remove(self, name: str) -> None:
        self._models.pop(name, None)

    def get(self, name: str) -> ModelSpec:
        if name not in self._models:
            raise KeyError(f"model '{name}' is not registered (known: {', '.join(self._models) or 'none'})")
        return self._models[name]

    def list(self) -> list[ModelSpec]:
        return list(self._models.values())

    def load_file(self, path: str | Path) -> None:
        doc = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
        for m in doc.get("models", []):
            self.add(ModelSpec.model_validate(m))

    def load_defaults(self) -> ModelRegistry:
        env = os.environ.get("AGENTSHIELD_MODELS")
        for f in [env] if env else DEFAULT_FILES:
            if f and Path(f).is_file():
                self.load_file(f)
        return self


registry = ModelRegistry().load_defaults()
