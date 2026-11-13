# What we check against

Validity is a judging criterion, so every claim has a check. Claim "consistent with" only when it is.

## 1. Barker et al. 2021, Connecting Ridge (the main target)
Barker et al. (2021), "Improved LOLA Elevation Maps for South Pole Landing Sites: Error Estimates and Their Impact on Illumination Conditions", Planetary & Space Science 203, 105119. https://doi.org/10.1016/j.pss.2020.105119 (full text: https://ntrs.nasa.gov/citations/20205009660)

Table 2, Connecting Ridge (PGDA Site01), 1 Jan 2024 – 1 Jan 2026:
| Height above surface | Average illumination | Longest sunlit | Longest shadow |
|---|---|---|---|
| 1 m | ~67–71% | 63–142 days | 13–22 days |
| 5 m | ~83–89% | — | ~4–8 days |

**How their method differs from ours:** their number is the 1st percentile across 100 DEM clones, averaged over small regions, with the Sun as a disc. Ours is a single point with the Sun's centre. So we expect "consistent with", not an exact match. Region centroids (polar stereographic km): (−11.58, −12.46) … (−10.23, −11.55); the PDF drops the minus signs, but only these signs fall inside the Site01 tile. Height matters a lot: 1 m vs 5 m moves average illumination by ~15–20 points, so observer height is a parameter (product default 2 m; 1 m and 5 m for validation).

## 2. Other published sources
- **Mazarico et al. 2011**, Icarus 211, 1066–1081 (https://doi.org/10.1016/j.icarus.2010.10.030): a point near the Shackleton rim is sunlit continuously for about 240 days, with its longest full darkness about 1.5 days. Table 3 ranks candidate sites by mean illumination.
- **LOLA polar illumination maps** (https://pgda.gsfc.nasa.gov/products/69): mean illumination per pixel over a full 18.6-year cycle. Our long-run sunlight fraction at a site should match the map's pixel.
- **LROC WAC illumination maps** (`WAC_POLE_ILL_PCT_SOUTH`, 100 m/px, 88–90°S, Speyerer & Robinson 2013, Icarus 222, 122–136): https://data.lroc.im-ldi.com/lroc/view_rdr/WAC_POLE_ILL_PCT_SOUTH
- **Horizons vs SPICE:** the same Sun/Earth az/el computed both ways for one site; log the difference.
- **Geometry tests:** synthetic terrain with known answers (see `stages/01_data/CONTEXT.md`, technical traps).

## 3. The Moon on Saturday evening (bonus)
- Plan: photograph the south polar limb around 09:00 UTC Sat 14 Nov 2026 (7pm AEST; Moon ~22% lit, 5.1 days old, low in the west). Raw, timestamped, GPS stripped, published openly with a licence. Resolution from Earth is ~2 km, so it checks lit/unlit peaks, not landing detail.
- **Cloudy:** a Stellarium view of the same time checks phase, libration and the Sun/Earth geometry, not terrain shadows. Say "matches the geometry", never "matches a photo".
- **Stand-in with real lit peaks:** one timestamped LROC WAC image of the south pole (NASA data, metres-scale): predict which peaks are lit at that minute and compare.
- Validation file: `web/public/data/validation/photo-2026-11-14/<id>.json`, all 12 sites, 08:00–12:00 UTC at 1-minute steps.

## 4. DSN stations and elevation masks (Canberra Link)
| Complex | 70 m antenna | Lat | Lon |
|---|---|---|---|
| Goldstone | DSS-14 | 35°16′53″N | 116°46′44″W |
| Canberra | DSS-43 | 35°24′06″S | 148°58′56″E |
| Madrid | DSS-63 | 40°25′45″N | 4°14′59″W |

Source: JPL DSN Radio Astronomy User Guide (complex positions). Precise positions: NAIF `earthstns_itrf93` kernels. Elevation limits (DSN 810-005 module 301 rev. P, §2.2.1–2.2.2): antennas reach about **6°** (receive); **no transmitting below 10.1°**; DSS-43's >20 kW transmitters need 17.6°. **Default mask 10°** (two-way link), 6° as a receive-only option. https://deepspace.jpl.nasa.gov/dsndocs/810-005/301/301P.pdf
