---
type: dataset
id: nasa-jpl-horizons
owner: NASA (JPL Solar System Dynamics)
status: verified
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
_Written as stage 01 runs._
