---
type: dataset
id: nasa-lola-topography
owner: NASA (LRO / LOLA, GSFC Planetary Geodesy Data Archive; PDS Geosciences)
status: loaded
---
# LOLA lunar topography (south-pole elevation models)

**What it is:** elevation models of the Moon from the Lunar Orbiter Laser Altimeter on LRO, from 5 m/pixel site tiles out to 240 m/pixel polar mosaics.
**Source:**
- **5 m site DEMs** (PGDA product 78): https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/ . Six sites: Site01 Connecting ridge, Site04 Shackleton rim, Site07 Peak near Shackleton, Site11 de Gerlache rim, Site20 Leibnitz beta plateau (Mons Mouton), Site23 Malapert massif. Per site: `SiteNN_final_adj_5mpp_surf.tif` (height), uncertainty maps, point cloud
- **87–90°S 5 m mosaic** (PGDA product 81): https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/87S/ (`ldem_87s_5mpp`, 3.3 GB)
- **Polar gridded DEMs** (PDS): https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/ (also https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/)

| File | Covers | Pixel | Size |
|---|---|---|---|
| `LDEM_875S_20M` | 87.5–90°S | 20 m | 115 MB |
| `LDEM_85S_20M` | 85–90°S | 20 m | 460 MB |
| `LDEM_80S_80M` | 80–90°S | 80 m | 116 MB |
| `LDEM_75S_60M` | 75–90°S | 60 m | 465 MB |
| `LDEM_75S_240M` | 75–90°S | 240 m | 29 MB |

**Time range:** static products (LRO in orbit since 2009).
**Format:** PGDA GeoTIFFs are Float32 metres, polar stereographic (lat of origin −90°) on a 1737.4 km sphere, X/Y in metres, MOON_ME frame of DE421, pixel-registered, NoData = NaN. Site tiles 3200×3200 px (16×16 km, ~41 MB); Malapert 4200×4200 (~71 MB). PDS `.IMG` files are **scaled integers** with a `.LBL` label.
**Licence:** NASA open data. **Cite as:** Barker et al. (2021), Planetary & Space Science 203, 105119, https://doi.org/10.1016/j.pss.2020.105119 ; site numbering from Mazarico et al. (2011), Icarus 211, 1066–1081, https://doi.org/10.1016/j.icarus.2010.10.030 ; LOLA PDS archive (Smith et al., LRO LOLA RDR).
**Where it lives here:** `data/raw/lola/` (gitignored). Fallback: `$NASA_CACHE/lola-5mpp-sites/`, `lola-87s-5mpp/`, `lola-polar-gdr/`.

## What it gives us
The terrain for each site's horizon profile: how high the land stands in every direction, which decides when the Sun and Earth rise and set locally.

## Pairs with
`nasa-jpl-horizons` (Sun/Earth az/el, same ME frame family), `usgs-artemis-regions` (site centres), `ours-moon-imaging` (lit peaks).

## Known flaws
- A 16 km tile is far too small for a polar horizon on its own: peaks 50–150+ km away block a Sun 1–2° up. We stack DEMs fine to coarse (trap 8 in `stages/01_data/CONTEXT.md`).
- About 90% of 5 m pixels are interpolated between LOLA tracks (PGDA); fine stripes along the track direction show in hillshades. Harmless for horizon angles over km distances.
- Site07's tile has no georeferencing in its header; its point cloud gives the position.
- PDS `.IMG` heights need `SCALING_FACTOR`/`OFFSET` from the `.LBL` (GDAL may not apply them).

## Loading recipe
- `cd pipeline && make venv && make fetch` downloads into `data/raw/lola/` and checks every file's size and SHA-256 (pinned in `pipeline/src/four_lights/sources.py`). It falls back to `$NASA_CACHE` if a NASA server fails; `FETCH_FLAGS=--cache-first` takes the mirror first (PGDA serves about 0.5 MB/s, so the 3.4 GB mosaic takes about 2 h from source).
- Open with rasterio: the GeoTIFFs directly, the PDS grids **through their `.LBL`**. All six products have the same projection (`+proj=stere +lat_0=-90 +lon_0=0 +R=1737400`; the PDS labels say `lat_ts=-90` instead of `k=1`, which is the same projection). `FileRaster` checks this by transforming test points.
- PDS heights: **height = DN × 0.5** (`SCALING_FACTOR`). GDAL reports offset 1737400, the sphere radius. Applying GDAL's scale *and* offset gives planetary radius, not height. We read raw DNs, and a test asserts the result is a height.
- Rings as used, finest first: the 5 m site tile (whole tile), the 87S 5 m mosaic to 20 km, `LDEM_875S_20M` then `LDEM_85S_20M` to 60 km, `LDEM_75S_60M` to 150 km, then `LDEM_75S_240M` to the edge of its grid. At Shackleton rim, neighbouring rings agree to a median of ±0.06 m where they overlap.
