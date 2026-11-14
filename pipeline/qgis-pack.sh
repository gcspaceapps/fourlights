#!/usr/bin/env bash
# Build the QGIS pack: the app's layers as files QGIS reads straight from the site, and a QGIS
# project that opens them. No database: cloud-optimised rasters and FlatGeobuf vectors, read by
# HTTP range requests (the Worker answers those, see api/src/ranges.ts).
#
#   ./qgis-pack.sh                      # project points at https://fourlights.gcsa.space/qgis
#   BASE_URL=http://127.0.0.1:8797/qgis ./qgis-pack.sh      # to check it against a local copy
#
# Writes ../web/public/qgis/ (deployed with the site) and, once, ../data/derived/qgis-pack/r2/
# (three 20 m rasters, each over the 25 MiB limit for a static file; they live in the R2 bucket
# bound in wrangler.jsonc and are uploaded by hand, see pipeline/CONTEXT.md).
#
# Needs: the pipeline already run on this machine (make sites, make map, make qgis, the USGS
# and LOLA downloads), GDAL's command-line tools including the Python ones, and QGIS with its
# Python at /usr/share/qgis/python. Built and checked with GDAL 3.12.2 and QGIS 4.2.3.
set -euo pipefail
cd "$(dirname "$0")"

BASE_URL="${BASE_URL:-https://fourlights.gcsa.space/qgis}"
PY="${PY:-.venv/bin/python}"
SRC=../data/derived
LOLA=../data/raw/lola
OUT=../web/public/qgis
R2="$SRC/qgis-pack/r2"
CRS="IAU_2015:30135"
MOON_RADIUS_M=1737400   # the LOLA files hold radius; heights here are above this sphere

mkdir -p "$OUT"
rm -rf "${OUT:?}"/*   # emptied, not removed, so a running dev server keeps serving it
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Rasters. The source files carry an unnamed copy of the same projection, so name it by code.
cog() {
  gdal_translate -q -of COG -a_srs "$CRS" -co BLOCKSIZE=256 -co OVERVIEWS=IGNORE_EXISTING "${@:3}" "$1" "$OUT/$2"
}
height() { # radius in, height above the sphere out
  gdal_calc.py --quiet --overwrite -A "$1" --calc "A-$MOON_RADIUS_M" --type Float32 --NoDataValue -32768 --outfile "$2"
}
cog "$SRC/map/hs.tif" hillshade.cog.tif -co COMPRESS=DEFLATE
height "$SRC/map/dem_r.tif" "$work/dem.tif"
cog "$work/dem.tif" dem.cog.tif -co COMPRESS=DEFLATE -co PREDICTOR=YES

# Contours every 1000 m from the same grid.
gdal_contour -q -a elev_m -i 1000 -f FlatGeobuf -nln contours "$work/dem.tif" "$work/contours.fgb"
ogr2ogr -q -f FlatGeobuf -a_srs "$CRS" "$OUT/contours.fgb" "$work/contours.fgb"

# The pipeline's check layers (make qgis), one FlatGeobuf each: the spatial index is what makes
# range reads work. Its site points are replaced by sites.fgb below, which carries the planner's
# numbers.
for layer in site_centres dem_rings; do
  ogr2ogr -q -f FlatGeobuf -a_srs "$CRS" "$OUT/$layer.fgb" "$SRC/qgis/four-lights-check.gpkg" "$layer"
done

# Artemis candidate regions: the outline of each USGS 1 km navigation grid we have.
for zip in ../data/raw/usgs/*.zip; do
  region="$(basename "$zip" .zip)"
  grid="${region}_PolarLGRS_ACC_1km_S_Grid"
  ogr2ogr -q -f FlatGeobuf -nlt MULTIPOLYGON -t_srs "$CRS" \
    -dialect sqlite -sql "SELECT ST_Union(geometry) AS geom, '${region//_/ }' AS name, COUNT(*) AS cells_1km FROM \"$grid\"" \
    "$work/region_$region.fgb" "/vsizip/$zip/$region/$grid.shp"
done
ogrmerge.py -single -f FlatGeobuf -nln regions -a_srs "$CRS" -o "$OUT/regions.fgb" "$work"/region_*.fgb

# Sites with the Slip Planner's numbers, the day-by-day planner, skylines and Earth directions.
"$PY" -m four_lights.qgis_pack "$OUT"

# Everything vector as one file, for anyone who wants to work offline.
# (GDAL's GeoPackage writer warns about the Moon CRS code on every layer after the first, though
# the definitions are identical; that one message is filtered out.)
for f in "$OUT"/*.fgb; do
  ogr2ogr -q -f GPKG $([ -f "$OUT/four-lights.gpkg" ] && echo -update) -nln "$(basename "$f" .fgb)" "$OUT/four-lights.gpkg" "$f" \
    2> >(grep -v "Passed SRS uses IAU_2015" >&2)
done

# Big rasters for R2: the 20 m polar DEM (about 150 km across), its hillshade and its slope.
# Built once; delete the folder to rebuild.
if [ ! -f "$R2/slope-20m.cog.tif" ]; then
  rm -rf "$R2" && mkdir -p "$R2"
  big() { gdal_translate -q -of COG -a_srs "$CRS" -co BLOCKSIZE=512 -co COMPRESS=DEFLATE -co NUM_THREADS=ALL_CPUS "$@"; }
  # The file holds whole numbers of half metres with the Moon's radius as offset. Drop the
  # offset and they are heights; kept as 16-bit numbers (with the 0.5 scale) they stay small.
  gdal_translate -q -of VRT -a_scale 0.5 -a_offset 0 "$LOLA/lola-polar-gdr/LDEM_875S_20M.LBL" "$work/dn20.vrt"
  big -co PREDICTOR=YES "$work/dn20.vrt" "$R2/dem-20m.cog.tif"
  gdal_translate -q -ot Float32 -unscale "$work/dn20.vrt" "$work/h20.tif"
  gdaldem hillshade -q -multidirectional -z 2 "$work/h20.tif" "$work/hs20.tif"
  big "$work/hs20.tif" "$R2/hillshade-20m.cog.tif"
  # Slope in whole degrees: one byte a pixel is plenty and compresses well.
  gdaldem slope -q "$work/h20.tif" "$work/slope20.tif"
  big -ot Byte -a_nodata 255 "$work/slope20.tif" "$R2/slope-20m.cog.tif"
fi

# The QGIS project. This step needs QGIS's own Python (the system one), not the venv.
PYTHONPATH=src:/usr/share/qgis/python QT_QPA_PLATFORM=offscreen \
  /usr/bin/python3 src/four_lights/qgis_project.py build "$OUT" "$BASE_URL" "$R2"
rm -f "$OUT/four-lights_attachments.zip"  # QGIS writes it beside a .qgs; nothing uses it

ls -la "$OUT" "$R2"
