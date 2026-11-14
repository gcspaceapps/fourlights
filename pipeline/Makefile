# Four Lights precompute. Data targets log their runs in stages/01_data/output/data-manifest.md.
# SITE defaults to Shackleton rim; FETCH_FLAGS=--cache-first takes files from $NASA_CACHE first.
.PHONY: venv test lint fetch fetch-spice fetch-usgs horizon bruteforce grass ephem publish regions sites validate qgis map

PY := .venv/bin/python
SITE ?= shackleton-rim
PGDA ?= Site04
FETCH_FLAGS ?=

venv:
	uv venv .venv --python 3.14 && uv pip install --python $(PY) -r requirements.lock && uv pip install --python $(PY) --no-deps -e .

test:
	.venv/bin/pytest

lint:
	ruff check . && ruff format --check .

fetch:
	$(PY) -m four_lights.fetch --site $(PGDA) $(FETCH_FLAGS)

horizon: fetch
	$(PY) -m four_lights.run_horizon $(SITE)

bruteforce: fetch
	$(PY) -m four_lights.bruteforce $(SITE)

grass: fetch
	$(PY) -m four_lights.grass_check $(SITE)

fetch-spice:
	$(PY) -m four_lights.fetch --spice $(FETCH_FLAGS)

fetch-usgs:
	$(PY) -m four_lights.fetch --usgs $(FETCH_FLAGS)

regions: fetch-usgs
	$(PY) -m four_lights.regions

ephem: fetch-spice
	$(PY) -m four_lights.run_ephem $(SITE)

publish:
	$(PY) -m four_lights.publish $(SITE)

# Every site end to end (horizon -> ephem -> publish). JOBS=2 if the machine has ~4 GB free.
JOBS ?= 1
sites: fetch-spice fetch-usgs
	$(PY) -m four_lights.fetch --all $(FETCH_FLAGS)
	$(PY) -m four_lights.run_sites --jobs $(JOBS)

# S7: Connecting Ridge 2024-2026 vs Barker et al. 2021 Table 2.
validate:
	$(PY) -m four_lights.validate

# QGIS check layers (site points, centres, DEM ring circles) -> data/derived/qgis/
qgis:
	$(PY) -m four_lights.qgis_layers

# The web map's terrain shading: a 420 km square on the pole from LDEM_75S_240M (hillshade only
# needs relative heights, so GDAL's radius offset is harmless here).
MAPDIR := ../data/derived/map
map:
	mkdir -p $(MAPDIR) ../web/public/map
	gdal_translate -q -projwin -210000 210000 210000 -210000 -tr 420 420 -r average -ot Float32 -unscale ../data/raw/lola/lola-polar-gdr/LDEM_75S_240M.LBL $(MAPDIR)/dem_r.tif
	gdaldem hillshade -q -multidirectional -z 2 $(MAPDIR)/dem_r.tif $(MAPDIR)/hs.tif
	gdal_translate -q -of JPEG -co QUALITY=82 --config GDAL_PAM_ENABLED NO $(MAPDIR)/hs.tif ../web/public/map/south-pole-hillshade.jpg
