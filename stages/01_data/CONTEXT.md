# 01_data: NASA files in, site JSON out

One job: turn raw NASA terrain and ephemerides into the published per-site JSON, reproducibly.

## Inputs
Working (this run): `data/raw/` (downloads, gitignored), `$NASA_CACHE` (offline mirror, fallback only), `pipeline/`.
Reference (every run): `../../_shared/stack.md` (data contract, frames), `../../_shared/sites.md`, `../../_shared/validation.md`, `../../_datasets/` cards for LOLA, Horizons, SPICE and USGS.
Do NOT load: `web/src/`, `api/`, `stages/03_pitch/`, `stages/04_submit/`.

## The data contract
Source of truth: `../../_shared/stack.md`. TypeScript types: `web/src/types.ts`. Change all three, and the pipeline, together.

**Conventions:** azimuth in degrees clockwise from **true** north at the site, [0, 360); elevation in degrees above the local horizontal plane (negative = below); angles rounded to 0.01°; times UTC, ISO 8601 with `Z`. Files are plain JSON (`sites.json` pretty-printed, per-site files minified).

**`web/public/data/sites.json`**: an array, one entry per site.

| Field | Type | Meaning |
|---|---|---|
| `id` | string | kebab-case; the per-site file is `sites/<id>.json` |
| `name` | string | display name |
| `lat`, `lon_e` | number | planetocentric latitude (negative = south), east longitude (−180, 180] |
| `ps_x_m`, `ps_y_m` | number | south polar stereographic metres, `IAU_2015:30135` |
| `source` | string | e.g. `PGDA Site04`, `Artemis region (USGS grid)` |
| `point_rule` | string | how the site pixel was picked (`_shared/sites.md`); shown in the UI |
| `approx` | boolean | true when no 5 m terrain lies under the site; the UI says so |

**`web/public/data/sites/<id>.json`**:

| Field | Type | Meaning |
|---|---|---|
| `id` | string | matches `sites.json` |
| `site` | `{lat, lon_e, elev_m}` | the site pixel actually used; `elev_m` is DEM height (m, 1737.4 km sphere) |
| `horizons` | `[{height_m, step_deg: 0.5, elev_deg: [720]}]` | one per observer height (1, 2, 5 m); `elev_deg[i]` is the **highest** terrain anywhere in the sector starting at `i × 0.5°` |
| `times` | `{start_utc, step_min, n}` | the time grid; every series has length `n`; `step_min` 60 (product, validation) or 1 (photo window) |
| `sun`, `earth` | `{az: [n], el: [n]}` | apparent az/el of the body's centre from the site (no terrain) |
| `stations` | `[n]` ints | product files only: bit 0 Goldstone DSS-14, bit 1 Canberra DSS-43, bit 2 Madrid DSS-63; set when that station sees the Moon at ≥ 10° (`dsn.py`, SPICE, checked against Horizons) |
| `meta.dem_rings` | `[{source, res_m, max_km}]` | the DEM rings actually used, finest first |
| `meta.ephem` | `"Horizons DE441"` \| `"SPICE DE440s"` | (`"fake"` in fixtures only) |
| `meta.frame` | `"MOON_ME"` | |
| `meta.built_utc` | string | build time |

**Ranges:** product files 2028-01-01T00:00Z, hourly, `n` = 17,544. `validation/connecting-ridge.json`: 2024-01-01 to 2026-01-01, hourly, horizons at 1 m and 5 m. `validation/photo-2026-11-14/<id>.json`: 08:00–12:00 UTC at 1-minute steps. Validation files have the same shape and are never loaded by the UI.

**Lookup:** the terrain under a body at azimuth `az` is `elev_deg[Math.floor(az / 0.5) % 720]`. Earth and Comms use Earth's centre against that (Comms: at least 1° above, and a station bit set). The Sun is a disc of radius 0.2666°: the share in view is 0 when its centre is a radius below the terrain, 1 when a radius above (`discFraction` in `web/src/lights.ts`).

**Fixtures:** `npm run fake-data` writes `fake-a`, `fake-b`, `fake-c` (90 days from 2028-01-01) with a built-in scenario: planned landing 2028-01-21, 7-day window, a 3-day slip; A stays green, B and C lose Power. Scaffolding for UI work only: they were removed from the published data in S6, and `npm run check:real-data` (run by `npm run deploy`) fails while any are present.

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
