---
type: dataset
id: nasa-naif-spice
owner: NASA (JPL NAIF)
status: verified
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
_Written as stage 01 runs._
