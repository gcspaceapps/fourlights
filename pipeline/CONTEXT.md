# pipeline/: the precompute

**What lives here:** Python (venv, pinned dependencies in `pyproject.toml`), package `src/four_lights/`, tests in `tests/`, and a `Makefile`. It fetches raw NASA files into `../data/raw/`, computes horizon profiles and Sun/Earth ephemerides, and writes the published JSON into `../web/public/data/`.

**Entry points:** `make venv`, `make test`, `make lint`; the data targets (`make fetch`, `make horizons`, `make ephem`, `make sites`) are added in stage 01.

**Run / test:** needs `uv` and `ruff`, and `NASA_CACHE` pointing at the offline mirror (fallback only). `npm run check` at the root also runs ruff here. Read big DEMs in windows: the machines have 4 cores and 14 GB.

**Rules:** the technical traps in `../stages/01_data/CONTEXT.md` (true north at the pole, scaled PDS integers, sector maximum, finest covering DEM). Every run logged in `../stages/01_data/output/data-manifest.md`. No hand-edited outputs.

**Touches:** `_datasets/` cards for LOLA, Horizons, SPICE and USGS (fill in their loading recipes); the data contract in `../_shared/stack.md` and `web/src/types.ts`.
