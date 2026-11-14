---
type: dataset
id: nasa-naif-spice
owner: NASA (JPL NAIF)
status: loaded
---
# NAIF SPICE kernels

**What it is:** generic SPICE kernels: leap seconds, the DE440s planetary ephemeris, Moon PA/ME frame kernels (DE440), DSN station positions and topocentric frames, Earth orientation.
**Source:** https://naif.jpl.nasa.gov/pub/naif/generic_kernels/ (stations: https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/stations/)
**Format:** SPICE binary/text kernels, ~0.1 GB in total.
**Licence:** NASA open data. **Cite as:** NASA JPL NAIF SPICE toolkit and generic kernels (Acton 1996).
**Where it lives here:** `data/raw/spice/` (gitignored); fallback `$NASA_CACHE/spice/`.

## What it gives us
- A fallback for Horizons: the same Sun/Earth az/el computed locally with Skyfield or spiceypy, and a Horizons vs SPICE comparison as a validity check.
- DSN station positions (`earthstns_itrf93`) for Canberra Link: the Moon's elevation from Goldstone, Canberra and Madrid.

## Known flaws
DE440s covers 1849–2150, enough for our ranges. Frame choice must be MOON_ME to match the DEMs.

## Loading recipe
- `cd pipeline && make fetch-spice` downloads from NAIF (about 7 MB/s) into `data/raw/spice/`, with SHA-256 checks; the mirror is the fallback.
- Kernels used: `naif0012.tls`, `pck00011.tpc`, `de440s.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`. In that frames kernel, `MOON_ME` = `MOON_ME_DE440_ME421`, the same mean-Earth frame as the LOLA DEMs.
- Sun/Earth direction: `spkcpo(target, et, 'MOON_ME', 'OBSERVER', 'LT+S', site_km, 'MOON', 'MOON_ME')`, then the site's east-north-up frame (`pipeline/src/four_lights/ephem.py`). Use `str2et` with `YYYY-MM-DD HH:MM:SS UTC`; it rejects the ISO `T` form with a `UTC` suffix.
- Used as the Horizons fallback and as a check on every site's product range.
