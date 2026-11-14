---
type: dataset
id: nasa-jpl-horizons
owner: NASA (JPL Solar System Dynamics)
status: loaded
---
# JPL Horizons ephemerides

**What it is:** positions of the Sun and Earth as seen from any observer, including a site on the Moon's surface.
**Source:** https://ssd.jpl.nasa.gov/horizons/ , API https://ssd.jpl.nasa.gov/api/horizons.api
**Time range & cadence:** any; we use hourly 2028-01-01 to 2029-12-31 (product), hourly 2024-01-01 to 2026-01-01 (validation, Connecting Ridge), and 1-minute steps 2026-11-14 08:00–12:00 UTC (Moon photo window).
**Format:** API text; topocentric apparent azimuth/elevation (`QUANTITIES='4'`).
**Licence:** NASA open data. **Cite as:** JPL Horizons On-Line Ephemeris System, NASA/JPL Solar System Dynamics.
**Where it lives here:** raw responses cached in `data/raw/horizons/` (gitignored); merged into `web/public/data/sites/<id>.json`.

## Query shape
`CENTER='coord@301'`, `COORD_TYPE='GEODETIC'`, `SITE_COORD='<E-lon>,<lat>,<alt km>'`, `QUANTITIES='4'`. The site frame is reported as **MEAN_ME** on a 1737.4 km sphere, ephemeris **DE441**. Azimuth clockwise from north.

## What it gives us
Sun and Earth az/el per time step from each site: compared with the horizon profile, that gives local sunrise/sunset, Earthrise/Earthset, the Sun, Earth and Comms lights.

## Pairs with
`nasa-lola-topography` (same ME frame family), `nasa-naif-spice` (independent check and fallback).

## Known flaws
- Output reportedly capped at ~90,000 lines per request (unconfirmed): two years hourly (17,544) fits in one request per site and body. Check the first response for truncation.
- No published rate limit found; run requests one at a time.
- DE441 vs the DEM's DE421 ME frame differ by metres: negligible for horizon angles.

## Loading recipe
- `cd pipeline && make ephem SITE=<id>` (after `make horizon SITE=<id>`, which fixes the site point). Code: `pipeline/src/four_lights/ephem.py`, `run_ephem.py`.
- One GET per site, body (`10` Sun, `399` Earth) and range to `https://ssd.jpl.nasa.gov/api/horizons.api` with `format=text`, `CENTER='coord@301'`, `COORD_TYPE='GEODETIC'`, `SITE_COORD='<E-lon 0–360>,<lat>,<alt km>'`, `QUANTITIES='4'`, `ANG_FORMAT='DEG'`, `CSV_FORMAT='YES'`, `EXTRA_PREC='YES'`, `TIME_DIGITS='MINUTES'`, `STEP_SIZE='60 m'` (or `'1 m'`). Raw responses are cached in `data/raw/horizons/`.
- Two years hourly (17,544 rows, about 1 MB) comes back in one request in about a second: no truncation. Each response is checked for a complete `$$SOE`/`$$EOE` block, the row count, the first and last timestamps, and `Center radii : 1737.4, 1737.4, 1737.4` (the 1737.4 km sphere).
- Rows look like ` 2028-Jan-01 00:00,*,i,  155.041537534,       2.226067113,`: time, solar-presence flag, interfering-body flag, azimuth, elevation.
- Checks: SPICE gives the same az/el to about 1e-6° (Shackleton rim, 2028–29). Earth's mean azimuth matches the site's longitude (about −lon_e from near the pole; 156.1° vs 156.2° at Shackleton rim), which catches a flipped north.
