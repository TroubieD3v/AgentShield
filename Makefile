.PHONY: install web test lint e2e serve gate docker

install:
	python -m venv .venv
	.venv/bin/pip install -e ".[dev,postgres]" || .venv/Scripts/pip install -e ".[dev,postgres]"
	npm --prefix web ci

web:
	npm --prefix web run build

lint:
	ruff check src tests
	npm --prefix web run typecheck

test:
	pytest

e2e: web
	npm --prefix web run test:e2e

serve: web
	agentshield serve

# the same gates CI runs: hardened must pass, unsafe must fail
gate:
	agentshield run --variant hardened --mode enforce -q --fail-on high
	! agentshield run --variant unsafe --mode monitor -q --fail-on high

docker:
	docker compose up --build
