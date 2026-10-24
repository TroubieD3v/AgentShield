import pytest

from agentshield.results import RunConfig
from agentshield.scenarios import load_scenarios
from agentshield.service import run_config


@pytest.fixture(autouse=True)
def _isolated_home(tmp_path, monkeypatch):
    monkeypatch.setenv("AGENTSHIELD_HOME", str(tmp_path / "home"))


@pytest.fixture(scope="session")
def scenarios():
    return load_scenarios()


@pytest.fixture(scope="session")
def suite(scenarios):
    """Run the whole library once per configuration; tests read from the cache."""
    cache: dict[tuple[str, str], object] = {}

    def get(variant: str, mode: str):
        key = (variant, mode)
        if key not in cache:
            cache[key] = run_config(RunConfig(variant=variant, mode=mode), scenarios)
        return cache[key]

    return get
