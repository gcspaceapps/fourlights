# The 12 curated sites

Every centre and site point below is computed by script from the raw files (`cd pipeline && make sites`, then `python -m four_lights.sites_table` rewrites this table). Centres: PGDA tiles from their GeoTIFF bounds (Site07's tile is checked against its point cloud); Artemis regions from the USGS 1 km grids, converted from the grids' own projection (500 km false origin, scale 0.994) to `IAU_2015:30135`. Polar stereographic X/Y are km in `IAU_2015:30135` (Moon south polar stereographic, R = 1737.4 km). "Finest DEM under it" is the DEM the site's ground height and near field come from; `approx` = no 5 m terrain under the site.

<!-- BEGIN computed sites (python -m four_lights.sites_table) -->
| # | id | Name | Source | Centre (PS km) | Site point (PS km) | Lat, E-lon | Ground | Finest DEM under it | approx |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `connecting-ridge` | Connecting Ridge | PGDA Site01 | -11.58, -12.46 | -11.58, -12.46 | -89.439°, -137.11° | 1958 m | PGDA Site01 5 m (5 m) | no |
| 2 | `shackleton-rim` | Shackleton rim | PGDA Site04 | -1.00, -7.00 | -2.69, -6.09 | -89.780°, -156.20° | 1739 m | PGDA Site04 5 m (5 m) | no |
| 3 | `peak-near-shackleton` | Peak near Shackleton | PGDA Site07 | 30.00, -20.00 | 30.06, -20.06 | -88.808°, 123.72° | 1649 m | PGDA Site07 5 m (5 m) | no |
| 4 | `de-gerlache-rim` | de Gerlache rim | PGDA Site11 | -37.00, 15.00 | -37.67, 14.92 | -88.664°, -68.39° | 1816 m | PGDA Site11 5 m (5 m) | no |
| 5 | `mons-mouton` | Mons Mouton | PGDA Site20 = Artemis region | 73.00, 118.00 | 73.28, 118.61 | -85.405°, 31.71° | 6464 m | PGDA Site20 5 m (5 m) | no |
| 6 | `malapert-massif` | Malapert Massif | PGDA Site23 = Artemis region | -0.50, 121.50 | 1.45, 121.91 | -85.981°, 0.68° | 4886 m | PGDA Site23 5 m (5 m) | no |
| 7 | `de-gerlache-rim-2` | de Gerlache Rim 2 | Artemis region (USGS grid) | -48.79, 22.64 | -43.57, 17.69 | -88.449°, -67.90° | 1580 m | LDEM_87S_5MPP (5 m) | no |
| 8 | `haworth` | Haworth | Artemis region (USGS grid) | -37.73, 90.54 | -38.86, 97.09 | -86.552°, -21.81° | 2236 m | LDEM_87S_5MPP (5 m) | no |
| 9 | `nobile-rim-1` | Nobile Rim 1 | Artemis region (USGS grid) | 84.00, 110.16 | 86.23, 116.13 | -85.233°, 36.59° | 6800 m | LDEM_85S_20M (20 m) | yes |
| 10 | `nobile-rim-2` | Nobile Rim 2 | Artemis region (USGS grid) | 156.94, 95.07 | 150.75, 94.95 | -84.130°, 57.80° | 1645 m | LDEM_85S_20M (20 m) | yes |
| 11 | `peak-near-cabeus-b` | Peak near Cabeus B | Artemis region (USGS grid) | -179.58, 69.92 | -181.23, 71.55 | -83.581°, -68.46° | 4600 m | LDEM_75S_60M (60 m) | yes |
| 12 | `slater-plain` | Slater Plain | Artemis region (USGS grid) | 69.92, -49.80 | 65.92, -50.78 | -87.256°, 127.61° | 534 m | LDEM_87S_5MPP (5 m) | no |
<!-- END computed sites -->

Left out: **Mons Mouton Plateau** (its region file sits behind a login; it adjoins Mons Mouton). Peak near Cabeus B's centre Y and Slater Plain's centre X are both 69.92 km: a real coincidence (both raw USGS grid values are exactly 569 500 m), checked by a test.

Cross-checks: Malapert Massif's region centre is within 250 m of Site23's tile centre, and Mons Mouton's within 250 m of Site20's, so those two 5 m tiles cover Artemis regions.

## Sources
- PGDA 5 m site DEMs: https://pgda.gsfc.nasa.gov/products/78 (site numbering from Mazarico et al. 2011)
- Artemis candidate regions (NASA, Oct 2024; LPSC 2026 update https://ntrs.nasa.gov/citations/20250011660), centres from the USGS LGRS navigational grids: https://doi.org/10.5066/P1MEQ6UK
- A region is ~20×20 km; a landing site is a ~100 m circle inside one, so these are region centres, not landing points.

## Which pixel is "the site" (`point_rule`, applied by script in S4, shown in the UI)
- `connecting-ridge`: **Barker 2021's first region centroid, (−11.58, −12.46) km**, so the validation is like for like. S4 asserts it lies inside the Site01 tile (X −19 to −3 km, Y −20 to −4 km).
- The other five PGDA sites: the **highest DEM pixel within 2 km** of the tile centre (the PGDA sites were picked as illumination peaks, so this follows how they were chosen).
- The six Artemis-region sites: the **highest summit within 8 km of the region's grid centre**, where a summit is a point with nothing higher within 1 km. The regions are about 20 km square, so this stays inside the region. (Changed Sat 14 Nov: the 2 km rule put five of the six on the edge of its search circle, two of them on slopes with terrain 19° up on one side; `highest_summit` in `pipeline/src/four_lights/sites.py`, tested.)
- Sites without 5 m terrain under them get `approx: true`, and the UI says so. They are the first to go (scope-cut item 3).
