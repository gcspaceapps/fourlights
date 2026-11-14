---
type: dataset
id: usgs-artemis-regions
owner: USGS Astrogeology (for NASA)
status: loaded
---
# Artemis candidate regions: USGS navigational grids

**What it is:** the Lunar Grid Reference System (LGRS) 1 km navigational grids for NASA's Artemis candidate landing regions near the south pole (named Oct 2024).
**Source:** ScienceBase, https://www.sciencebase.gov/catalog/item/671a6fa8d34efed5620f89f8 , DOI https://doi.org/10.5066/P1MEQ6UK . Region list confirmed in the LPSC 2026 update, https://ntrs.nasa.gov/citations/20250011660
**Format:** zipped GIS files per region (~0.95 GB for 8 regions).
**Licence:** US Government public domain. **Cite as:** USGS Astrogeology, LGRS navigational grids for the Artemis III candidate regions (2024), doi:10.5066/P1MEQ6UK.
**Where it lives here:** `data/raw/usgs/` (gitignored); fallback `$NASA_CACHE/usgs-artemis-regions/`.

## What it gives us
Each region's centre (the centre of its 1 km grid), converted to Moon lat/lon (`IAU_2015:30100`) and polar stereographic metres (`IAU_2015:30135`): the starting point for the site rule in `_shared/sites.md`.

## Known flaws
Mons Mouton Plateau's file is behind a login-only link, so that region is left out. A region is ~20×20 km, so its centre is a starting point, not a landing site.

## Loading recipe
- `cd pipeline && make fetch-usgs` downloads the 8 zips from ScienceBase (about 9 MB/s, 950 MB) into `data/raw/usgs/`, with SHA-256 checks. `make regions` prints the centres.
- Centre = centre of the `*_1km_S_Grid.shp` extent, read from the shapefile header inside the zip (no unzipping).
- **Trap:** the grids' CRS is **not** `IAU_2015:30135`. Their `.prj` (`Moon_2015_-_Sphere_Ocentric_South_Polar`) has false easting/northing 500 000 m and scale factor 0.994. Convert through pyproj from the file's own `.prj`: PS = (grid − 500 000) / 0.994. Haworth: grid (462 500, 590 000) → (−37 726, 90 543) m. Tested.
- Peak near Cabeus B's Y and Slater Plain's X are both 69 919.5 m because both raw grid values are exactly 569 500: a real coincidence, not a copy error.
