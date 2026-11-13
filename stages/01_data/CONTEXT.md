# 01_data: NASA files in, site JSON out

One job: turn raw NASA terrain and ephemerides into the published per-site JSON, reproducibly.

## Inputs
Working (this run): `data/raw/` (downloads, gitignored), `$NASA_CACHE` (offline mirror, fallback only), `pipeline/`.
Reference (every run): `../../_shared/stack.md` (data contract, frames), `../../_shared/sites.md`, `../../_shared/validation.md`, `../../_datasets/` cards for LOLA, Horizons, SPICE and USGS.
Do NOT load: `web/src/`, `api/`, `stages/03_pitch/`, `stages/04_submit/`.

## The data contract (summary; the full contract is in `../../_shared/stack.md`, the TypeScript types in `web/src/types.ts`)
- `web/public/data/sites.json`: one entry per site: `{id, name, lat, lon_e, ps_x_m, ps_y_m, source, point_rule, approx}`
- `web/public/data/sites/<id>.json`: site, horizons (720 sectors of 0.5° per observer height), hourly Sun and Earth az/el, meta (DEM rings used, ephemeris, frame, build time)
- `web/public/data/validation/`: same shape, never loaded by the UI
- Azimuth clockwise from **true** north at the site; elevation above the local horizontal; angles rounded to 0.01°; times UTC.

## Technical traps (every one has a test)
1. **Grid north isn't true north at the pole.** At a south-pole site, true north points **directly away from the pole** (along the site's meridian, toward the equator); toward the pole is true south. Grid bearing and true azimuth differ by roughly the site's longitude (~172° at Shackleton). Work in 3D Moon-fixed Cartesian and a local east-north-up frame, which also handles curvature and projection scale. **Tests:** a synthetic peak placed further from the pole on the site's own meridian comes out at azimuth 0°. Ephemeris check that catches a 180° flip: Earth's azimuth is near **0°** from Malapert (longitude ~0°) and near **180°** from Shackleton rim (longitude ~172°W), each within about 20°.
2. **PDS `.IMG` heights are scaled integers.** Apply `SCALING_FACTOR` and `OFFSET` from the `.LBL` (GDAL may not apply them on read). PGDA GeoTIFFs are Float32 metres. **Test:** assert the rings agree where they overlap.
3. **GRASS `r.horizon` isn't a like-for-like check.** It reports direction counter-clockwise from grid east and may assume Earth's radius for curvature. Use it on the near-field tile only, convert the angle, expect a small offset. The main independent check is a **brute-force 3D ray cast** on a few azimuths.
4. **The far field must reach the Earth direction for the northern sites.** Use `LDEM_75S_240M` as the outer ring for every site.
5. **Horizons output cap:** reportedly ~90,000 lines per request (unconfirmed). Two years hourly (17,544) fits in one request per site and body. **Test:** check the first response for truncation.
6. **Panorama scale:** Earth reaches 11–13° at 84–86°S and horizon dips can pass −4°, so the chart's vertical range comes from the data, not a fixed −2° to +10°.
7. **One ray per 0.5° misses peaks between rays.** At 100 km, rays 0.5° apart are 870 m apart: a narrow peak between them is never seen, the horizon comes out too low and we over-predict sunlight. Take the **maximum over the whole 0.5° sector** (every DEM pixel in the sector, or at least 5 sub-rays). **Test:** a one-pixel spike between two sector centres is still seen; the brute-force check uses all pixels in the sector.
8. **DEM coverage differs by site.** For each sample along a sector, use **the finest DEM that covers that point**, in this order: 5 m site tile, 87S 5 m mosaic, `LDEM_875S_20M`/`LDEM_85S_20M`, `LDEM_75S_60M`, `LDEM_75S_240M`. Six sites have no 5 m tile; `peak-near-cabeus-b` and `nobile-rim-2` lie outside every 20 m product. Record the rings actually used in each site's `meta.dem_rings`.

## Process
1. **Start the precompute first**: it's the slow, risky part. Shackleton rim (Site04) first, end to end, before any other site.
2. Fetch from the original NASA URLs (`make fetch`); on failure, copy from `$NASA_CACHE` and verify the SHA-256 in its `MANIFEST.tsv`.
3. Cross-check one site by hand before scaling up: the horizon vs a known lit peak, the brute-force ray cast, and a QGIS look (screenshot to `../02_build/output/media/`).
4. Scale to all 12 sites, split across cores with multiprocessing, reading big DEMs in windows (4 cores, 14 GB). If it runs far over 20 minutes, do the 6 PGDA sites first.
5. Log **every run** in `output/data-manifest.md`: time (AEST), machine, command, inputs, output files and sizes, run time.

## Outputs
- `web/public/data/sites.json`, `web/public/data/sites/<id>.json`, `web/public/data/validation/...`
- `output/data-manifest.md`
- Loading recipes filled in on the `../../_datasets/` cards; status moved to `loaded`

## Human check
The person who didn't write the pipeline runs `make` from a clean checkout on another machine (Matt's Mac in the evening counts) and confirms the JSON matches byte for byte or within rounding; and looks at one skyline plot and one QGIS layer before it reaches the UI.
