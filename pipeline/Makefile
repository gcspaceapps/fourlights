# Four Lights precompute. Data targets log their runs in stages/01_data/output/data-manifest.md.
# SITE defaults to Shackleton rim; FETCH_FLAGS=--cache-first takes files from $NASA_CACHE first.
.PHONY: venv test lint fetch fetch-spice fetch-usgs horizon bruteforce grass ephem publish regions sites validate qgis qgis-pack qgis-verify map coverage

PY := .venv/bin/python
SITE ?= shackleton-rim
PGDA ?= Site04
FETCH_FLAGS ?=

venv:
	uv venv .venv --python 3.14 && uv pip install --python $(PY) -r requirements.lock && uv pip install --python $(PY) --no-deps -e .

test:
	.venv/bin/pytest

# Unit-test coverage for the pipeline: a table here, and HTML in ../coverage/pipeline/.
coverage:
	.venv/bin/pytest -q --cov=four_lights --cov-report=term --cov-report=html:../coverage/pipeline

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

# The QGIS pack: the app's layers as files QGIS reads straight from the site, and the project
# that opens them -> ../web/public/qgis/ (deployed with the site). Needs `make sites map qgis`
# done on this machine, GDAL's tools and QGIS (see qgis-pack.sh). The project file has the
# site's address written into it: rebuild with another QGIS_URL to test against a local copy.
QGIS_URL ?= https://fourlights.gcsa.space/qgis
qgis-pack:
	BASE_URL=$(QGIS_URL) PY=$(PY) ./qgis-pack.sh

# Open the built project the way QGIS would, from the address it was built for (which must be
# serving it), fail if any layer does not load, and draw each theme to ../test-results/qgis-check/.
# With the password gate on: GDAL_HTTP_USERPWD='fourlights:<password>' make qgis-verify
qgis-verify:
	PYTHONPATH=src:/usr/share/qgis/python QT_QPA_PLATFORM=offscreen /usr/bin/python3 \
	  src/four_lights/qgis_project.py verify ../web/public/qgis/four-lights.qgs ../test-results/qgis-check

# The web map's terrain shading: a 420 km square on the pole from LDEM_75S_240M (hillshade only
# needs relative heights, so GDAL's radius offset is harmless here).
MAPDIR := ../data/derived/map
map:
	mkdir -p $(MAPDIR) ../web/public/map
	gdal_translate -q -projwin -210000 210000 210000 -210000 -tr 420 420 -r average -ot Float32 -unscale ../data/raw/lola/lola-polar-gdr/LDEM_75S_240M.LBL $(MAPDIR)/dem_r.tif
	gdaldem hillshade -q -multidirectional -z 2 $(MAPDIR)/dem_r.tif $(MAPDIR)/hs.tif
	gdal_translate -q -of JPEG -co QUALITY=82 --config GDAL_PAM_ENABLED NO $(MAPDIR)/hs.tif ../web/public/map/south-pole-hillshade.jpg
