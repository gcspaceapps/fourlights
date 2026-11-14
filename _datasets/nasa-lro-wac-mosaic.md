---
type: dataset
id: nasa-lro-wac-mosaic
owner: NASA (LRO / LROC WAC, GSFC and Arizona State University), served by NASA Moon Trek
status: used
---
# LRO WAC global mosaic (3D map imagery)

**What it is:** the Lunar Reconnaissance Orbiter Camera Wide Angle Camera global image mosaic, about 303 pixels per degree (about 100 m per pixel at the equator). The base imagery of the 3D Moon in the Map tab.
**Source:** NASA Moon Trek (https://trek.nasa.gov/moon/), WMTS tile service. **Layer ID:** `LRO_WAC_Mosaic_Global_303ppd_v02`.
**Tile URL:** `https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{z}/{row}/{col}.jpg`
**Tile grid:** equirectangular (plate carrée), 2^(z+1) columns by 2^z rows (2×1 at z0), 256 px tiles, row 0 at the top (north), column 0 starting at -180°. **Native maximum zoom: 8.**
**Format & size:** JPEG tiles, about 5 to 50 kB each. We never download the whole mosaic: the browser asks for the tiles in view.
**Licence:** NASA open data. **Cite as:** NASA/GSFC/Arizona State University, LRO WAC global mosaic, via NASA Moon Trek.
**Where it lives here:** nowhere on disk. `api/src/etiles.ts` serves `/etiles/wac/<z>/<row>/<col>`: it fetches the tile from Moon Trek on a miss, keeps it in the Cloudflare cache and tells browsers to keep it for a week.

## What it gives us
A real picture of the Moon to look at the 12 sites against.

## Pairs with
`nasa-lro-lola-colour-shade` (the other switchable layer), `nasa-lola-topography` (our own polar hillshade, the third layer).

## Known flaws
- Equirectangular, so it is stretched and streaky within a few degrees of the pole, and the polar light is low, so much of the polar cap is black or smeared. The 12 sites are at -88° to -89.8°. That is why the Map tab also has our own LOLA hillshade in polar stereographic, and shows it when you fly to a site.
- The Cloudflare cache is per data centre and works on a custom domain only; a cold region fetches from NASA again.
- We have not checked Moon Trek's terms for automated use beyond on-demand tile requests behind a cache.

## Loading recipe
Nothing to download. Check a tile: `curl -sI https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/0/0/0.jpg`. Tests: `api/tests/worker.test.ts` (range limits, URL, cache header) and `web/tests/globe.test.ts` (tile grid maths).
