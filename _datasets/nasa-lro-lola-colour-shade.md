---
type: dataset
id: nasa-lro-lola-colour-shade
owner: NASA (LRO / LOLA, GSFC), served by NASA Moon Trek
status: used
---
# LOLA colour-shaded elevation (3D map layer)

**What it is:** the Lunar Orbiter Laser Altimeter global elevation model, colour-coded by height and shaded, at 128 pixels per degree (about 240 m per pixel at the equator). The "Elevation (LOLA)" layer of the 3D Moon in the Map tab.
**Source:** NASA Moon Trek (https://trek.nasa.gov/moon/), WMTS tile service. **Layer ID:** `LRO_LOLA_ClrShade_Global_128ppd_v04`.
**Tile URL:** `https://trek.nasa.gov/tiles/Moon/EQ/LRO_LOLA_ClrShade_Global_128ppd_v04/1.0.0/default/default028mm/{z}/{row}/{col}.png`
**Tile grid:** equirectangular, 2^(z+1) columns by 2^z rows, 256 px tiles, row 0 at the top. **Native maximum zoom: 5.**
**Format & size:** PNG tiles, about 80 kB each; fetched on demand.
**Licence:** NASA open data. **Cite as:** NASA/GSFC/MIT, LRO LOLA colour-shaded global elevation, via NASA Moon Trek.
**Where it lives here:** nowhere on disk; served through `/etiles/lola/<z>/<row>/<col>` like the WAC layer (see `nasa-lro-wac-mosaic`).

## What it gives us
Height at a glance: the polar cap's deep crater floors (violet) against the ridges around them.

## Pairs with
`nasa-lro-wac-mosaic`; `nasa-lola-topography` (the same instrument; our horizons and polar hillshade come from the polar gridded models, not from this layer).

## Known flaws
- The colour scale is NASA's, not ours, and the app does not print a legend for it. It is for orientation, not measurement.
- Equirectangular: stretched near the pole, like the WAC layer. Zoom stops at 5, about 4 km per pixel at the pole's longitude scale, so it blurs sooner than WAC.

## Loading recipe
Nothing to download. Same route, cache and tests as `nasa-lro-wac-mosaic`.
