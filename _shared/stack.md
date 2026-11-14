# Stack

```
 LOLA rings: 5 m site tile → 87S 5 m mosaic → LDEM_875S_20M / LDEM_85S_20M → LDEM_75S_60M → LDEM_75S_240M
   └─▶ pipeline/ (Python + GDAL/rasterio, numpy; 3D Moon-fixed geometry)
         horizon profile per site and observer height: 720 sectors × elevation angle
 JPL Horizons API (Sun, Earth from each site, hourly) ─▶ pipeline/ (SPICE fallback)
                                     ▼
              web/public/data/sites/<id>.json  (+ web/public/data/sites.json)
                                     ▼
   One Cloudflare Worker (Hono, TS) + static assets from web/dist (Vite build of web/)
   Sun-Path Chart · Slip Planner · four lights computed in the browser
```

**Why:** it's the stack we're fastest in; the minimum demo is static (12 skylines plus ephemerides), so no database; the Worker on Workers Free only routes and serves (10 ms CPU limit), the browser does the light maths.

## Cloudflare
- Account `gcspaceapps`, **`account_id` `e3cb8bffb3a1a6e6009c50fdf0bc6b82`** (pinned in `wrangler.jsonc`; never rely on the default account). Workers Free. R2 and Zero Trust available on free tiers if needed.
- `gcsa.space` (zone in this account): the apex is the team page (its own Worker, no password); each app gets a password-gated subdomain. DNS: `cf dns records list --zone gcsa.space`.
- The demo is at **https://fourlights.gcsa.space** (custom domain on the `gcsa.space` zone, same account), password-gated by the Worker until Sunday. `workers_dev` is off; `preview_urls` is on for `wrangler versions upload`, and previews are gated by the same code. The Worker keeps its obscure name (`q7m3-demo`). Never post the demo URL anywhere public before Sunday 19:30 AEST: custom-domain hostnames show up in public certificate-transparency logs, so the password is what protects it.

## Moon coordinate systems
| Use | PROJ code | PostGIS SRID | Notes |
|---|---|---|---|
| Moon geographic | `IAU_2015:30100` | 930100 | sphere R = 1737.4 km |
| South polar stereographic | `IAU_2015:30135` | 930135 | the PGDA 5 m tiles' own CRS (`+proj=stere +lat_0=-90 +lon_0=0 +R=1737400`) is identical |

PostGIS doesn't ship IAU codes: SRIDs 930100/930135 are added to `spatial_ref_sys` by hand (only if GridScore happens). In QGIS, set a layer's CRS **by code**, not by WKT.

## Frames and ephemerides
- LOLA DEMs: MOON_ME frame of DE421. Horizons reports a lunar surface site in **MEAN_ME**, ephemeris **DE441**, on the 1737.4 km sphere. Same ME family, so no PA→ME conversion; the DE421 vs DE441 ME difference is metres.
- Horizons query shape: `CENTER='coord@301'`, `COORD_TYPE='GEODETIC'`, `SITE_COORD='<E-lon>,<lat>,<alt km>'`, `QUANTITIES='4'` (apparent az/el). Azimuth clockwise from north.
- Fallback: SPICE (DE440s, Moon ME frame kernels) with Skyfield or spiceypy, from `$NASA_CACHE/spice/`.

## Data contract (the published files)
- **Date ranges:** product 2028-01-01 to 2029-12-31, hourly (17,544 steps); covers the first crewed landing window (Artemis IV, 2028) and the seasons. Validation 2024-01-01 to 2026-01-01, hourly, Connecting Ridge only (Barker 2021's window).
- **Observer heights:** 2 m (product default), plus 1 m and 5 m.
- `web/public/data/sites.json`: `[{id, name, lat, lon_e, ps_x_m, ps_y_m, source, point_rule, approx: bool}]`
- `web/public/data/sites/<id>.json`: `{id, site: {lat, lon_e, elev_m}, horizons: [{height_m, step_deg: 0.5, elev_deg: [720]}], times: {start_utc, step_min: 60, n}, sun: {az: [], el: []}, earth: {az: [], el: []}, meta: {dem_rings: [{source, res_m, max_km}], ephem: "Horizons DE441" | "SPICE DE440s", frame: "MOON_ME", built_utc}}`
- Azimuth: degrees clockwise from **true** north at the site. Elevation: degrees above the local horizontal plane.
- `elev_deg[i]` is the **highest** terrain anywhere in the 0.5° sector starting at azimuth `i × 0.5°`. Angles rounded to 0.01° (a site file is near 0.5 MB).
- **Validation data stays out of the product files** (same shape, never loaded by the UI):
  - `web/public/data/validation/connecting-ridge.json`: 2024-01-01 to 2026-01-01, hourly, horizons at 1 m and 5 m
  - `web/public/data/validation/photo-2026-11-14/<id>.json`: all 12 sites, 14 Nov 2026 08:00–12:00 UTC at 1-minute steps (`step_min: 1`)
- Every product site file also has a `stations` array (Canberra Link, done): one bitmask per hour (bit 0 Goldstone DSS-14, bit 1 Canberra DSS-43, bit 2 Madrid DSS-63), set when that station has the Moon at ≥ 10°. Validation files don't have it.
- **`web/public/data/planner.json`** (the Slip Planner's figures, so the page needn't load every site file): `{height_m: 2, start_utc, windows: {"7"|"14"|"30": {<id>: {u: [usable days × 10], s: [sunlit %], d: [longest dark h], v: "gar…"}}}}`, one entry per landing day from `start_utc`. Built from the site files by the app's own rules: **run `npm run planner-data` whenever a site file changes**; a test recomputes it and fails `npm run check` if it is stale.
- **Other published files** (not part of the per-site contract): `web/public/data/reviews.json` (`{model, provider, generated_utc, note, sites: {<id>: {text, facts}}}`: the AI-written site reviews with the facts each was checked against; `python -m four_lights.site_review`); `web/public/map/south-pole-hillshade.jpg` (420 km square on the pole, 1000 px so 420 m per pixel, from `LDEM_75S_240M`; `make map`; the 3D map drapes it on the polar cap); `web/public/img/*.jpg` (three NASA photographs, card `_datasets/nasa-image-library.md`).
- **How the app reads it:** the Sun is a 0.53° disc (radius 0.2666°): the share in view is computed from `sun.el` minus the terrain in the Sun's sector, taking the terrain as level across the disc. Earth is taken at its centre. The rules live in `web/src/lights.ts` and are mirrored in `pipeline/src/four_lights/scenario.py`.

## Machines
Two Linux machines with 4 cores and 14 GB (Steve's), plus Matt's MacBook Pro from 17:30. Read big DEMs in windows, never whole. The offline mirror is wherever `$NASA_CACHE` points.
