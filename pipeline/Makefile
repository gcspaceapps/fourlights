# Four Lights precompute. Every target logs its run in stages/01_data/output/data-manifest.md.
.PHONY: venv test lint

venv:
	uv venv .venv && uv pip install -e . pytest

test:
	.venv/bin/pytest

lint:
	ruff check . && ruff format --check .
