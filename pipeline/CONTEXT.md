# pipeline/: the precompute

**What lives here:** Python (venv, pinned dependencies in `pyproject.toml`), package `src/four_lights/`, tests in `tests/`, and a `Makefile`. It fetches raw NASA files into `../data/raw/`, computes horizon profiles and Sun/Earth ephemerides, and writes the published JSON into `../web/public/data/`.

**Entry points:** `make venv`, `make test`, `make lint`. Data: `make fetch` (raw files, SHA-256 checked), `make horizon` (one site's horizons → `data/derived/horizons/<id>.json` and a skyline plot in `stages/02_build/output/media/`), `make bruteforce` and `make grass` (the independent checks). `SITE=` and `PGDA=` pick the site (default Shackleton rim / Site04). Code: `geometry.py` (projection, ENU frame), `dem.py` (GeoTIFF and PDS readers), `horizon.py` (the engine), `sites.py` (site point rule), `sources.py` (URLs and SHA-256s). `ephem.py` / `run_ephem.py` (JPL Horizons, SPICE fallback and check), `regions.py` (USGS Artemis region centres), `publish.py` (merge into the data contract), `run_sites.py` (all 12). More targets: `make ephem`, `make publish`, `make sites` (everything, all 12 sites), `make validate` (Barker 2021 comparison), `make qgis` (check layers), `make regions`; `python -m four_lights.scenario` (demo-scenario scan), `python -m four_lights.sites_table` (regenerates the table in `_shared/sites.md`), `python -m four_lights.fetch --all --refresh` (re-download everything from the original URLs).

**Run / test:** needs `uv` and `ruff`, and `NASA_CACHE` pointing at the offline mirror (fallback only). `npm run check` at the root also runs ruff here. Read big DEMs in windows: the machines have 4 cores and 14 GB.

**Rules:** the technical traps in `../stages/01_data/CONTEXT.md` (true north at the pole, scaled PDS integers, sector maximum, finest covering DEM). Every run logged in `../stages/01_data/output/data-manifest.md`. No hand-edited outputs.

**Touches:** `_datasets/` cards for LOLA, Horizons, SPICE and USGS (fill in their loading recipes); the data contract in `../_shared/stack.md` and `web/src/types.ts`.
