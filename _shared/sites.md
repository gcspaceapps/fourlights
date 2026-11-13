# The 12 curated sites

**The centres below are provisional.** S4 recomputes every centre by script from the raw files (GeoTIFF headers, the USGS region grids, the Site07 point cloud), and only that output is used. Polar stereographic X/Y are metres in `IAU_2015:30135` (Moon south polar stereographic, R = 1737.4 km).

| # | id | Name | Source | Provisional centre (PS X, Y m) | Approx. lat, E-lon | Best DEM under it |
|---|---|---|---|---|---|---|
| 1 | `connecting-ridge` | Connecting Ridge | PGDA Site01 | −11 000, −12 000 | 89.46°S, 137.49°W | 5 m site tile |
| 2 | `shackleton-rim` | Shackleton rim | PGDA Site04 | −1 000, −7 000 | 89.77°S, 171.87°W | 5 m site tile |
| 3 | `peak-near-shackleton` | Peak near Shackleton | PGDA Site07 (tile has no georeferencing; centre from its point cloud) | ≈ 30 000, −20 000 | ≈ 88.81°S, 123.69°E | 5 m site tile |
| 4 | `de-gerlache-rim` | de Gerlache rim | PGDA Site11 | −37 000, 15 000 | 88.68°S, 67.93°W | 5 m site tile |
| 5 | `mons-mouton` | Mons Mouton (was Leibnitz beta plateau) | PGDA Site20 = Artemis region | 73 000, 118 000 | 85.43°S, 31.74°E | 5 m site tile |
| 6 | `malapert-massif` | Malapert Massif | PGDA Site23 = Artemis region | −500, 121 500 | 86.00°S, 0.24°W | 5 m site tile |
| 7 | `de-gerlache-rim-2` | de Gerlache Rim 2 | Artemis region (USGS grid) | −48 793, 22 636 | 88.23°S, 65.11°W | 87S 5 m mosaic |
| 8 | `haworth` | Haworth | Artemis region | −37 726, 90 543 | 86.77°S, 22.62°W | `LDEM_85S_20M` |
| 9 | `nobile-rim-1` | Nobile Rim 1 | Artemis region | 84 004, 110 161 | 85.43°S, 37.33°E | `LDEM_85S_20M` |
| 10 | `nobile-rim-2` | Nobile Rim 2 | Artemis region | 156 942, 95 070 | 83.95°S, 58.79°E | `LDEM_75S_60M` (outside every 20 m product) |
| 11 | `peak-near-cabeus-b` | Peak near Cabeus B | Artemis region | −179 577, 69 920 | 83.65°S, 68.73°W | `LDEM_75S_60M` (outside every 20 m product) |
| 12 | `slater-plain` | Slater Plain | Artemis region | 69 920, −49 799 | 87.17°S, 125.46°E | 87S 5 m mosaic or `LDEM_85S_20M` |

Left out: **Mons Mouton Plateau** (its region file sits behind a login; it adjoins Mons Mouton). Peak near Cabeus B's Y and Slater Plain's X are both 69 920 m: probably coincidence, re-check in S4.

Cross-checks: Malapert Massif's region centre is within 250 m of Site23's tile centre, and Mons Mouton's within 250 m of Site20's, so those two 5 m tiles cover Artemis regions.

## Sources
- PGDA 5 m site DEMs: https://pgda.gsfc.nasa.gov/products/78 (site numbering from Mazarico et al. 2011)
- Artemis candidate regions (NASA, Oct 2024; LPSC 2026 update https://ntrs.nasa.gov/citations/20250011660), centres from the USGS LGRS navigational grids: https://doi.org/10.5066/P1MEQ6UK
- A region is ~20×20 km; a landing site is a ~100 m circle inside one, so these are region centres, not landing points.

## Which pixel is "the site" (`point_rule`, applied by script in S4, shown in the UI)
- `connecting-ridge`: **Barker 2021's first region centroid, (−11.58, −12.46) km**, so the validation is like for like. S4 asserts it lies inside the Site01 tile (X −19 to −3 km, Y −20 to −4 km).
- Every other site: the **highest DEM pixel within 2 km** of the tile or region centre (the PGDA sites were picked as illumination peaks, so this follows how they were chosen).
- Sites without 5 m terrain under them get `approx: true`, and the UI says so. They are the first to go (scope-cut item 3).
