# Four Lights precompute. Every target logs its run in stages/01_data/output/data-manifest.md.
.PHONY: venv test lint

venv:
	uv venv .venv --python 3.14 && uv pip install --python .venv/bin/python -r requirements.lock && uv pip install --python .venv/bin/python --no-deps -e .

test:
	.venv/bin/pytest

lint:
	ruff check . && ruff format --check .
