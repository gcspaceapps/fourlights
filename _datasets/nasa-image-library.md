---
type: dataset
id: nasa-image-library
owner: NASA
status: used
---
# NASA Image and Video Library (six photographs)

**What it is:** six NASA photographs: three of real vehicles, shown as examples of each power-system class in Survive the Night, and three in the Learn view (the south pole, Earth over the lunar horizon, a Deep Space Network dish).
**Source:** https://images.nasa.gov (API: https://images-api.nasa.gov)
**Time range & cadence:** single images.
**Format & size:** JPEG; we publish 480 × 360 crops, about 40 kB each.
**Licence:** NASA imagery, not copyrighted (public domain); credit NASA. · **Cite as:** the credit lines below.
**Where it lives here:** `web/public/img/`.

| File | NASA ID | What it shows | Credit |
|---|---|---|---|
| `surveyor-3.jpg` | [AS12-48-7121](https://images.nasa.gov/details/as12-48-7121) | Surveyor 3 on the Moon, photographed during Apollo 12's second moonwalk, 20 Nov 1969 | NASA |
| `viper-prototype.jpg` | [GRC-2021-C-00493](https://images.nasa.gov/details/GRC-2021-C-00493) | A prototype of the VIPER polar rover in mobility tests at NASA Glenn, 10 Mar 2021 | NASA/GRC/Bridget Caswell |
| `apollo-11-lunar-module.jpg` | [AS11-40-5927](https://images.nasa.gov/details/as11-40-5927) | The Apollo 11 lunar module on the Moon, with Buzz Aldrin setting up experiments, 20 Jul 1969 | NASA |
| `south-pole-clementine.jpg` | [PIA00001](https://images.nasa.gov/details/PIA00001) | The Moon's south polar region: a mosaic of about 1,500 Clementine images, orthographic, centred on the pole | NASA/JPL/USGS |
| `earthrise-apollo-8.jpg` | [AS08-14-2383](https://images.nasa.gov/details/as08-14-2383) | Earth about five degrees above the lunar horizon, from Apollo 8, 24 Dec 1968 | NASA |
| `dss-43-canberra.jpg` | [PIA23797](https://images.nasa.gov/details/PIA23797) | Deep Space Station 43, the 70 m antenna near Canberra, during upgrades in 2020 | NASA/JPL-Caltech |

## What it gives us
A picture of the kind of vehicle each preset stands for, and three photographs that make the Learn view's points (permanent shadow at the pole, Earth low on the horizon, the size of a DSN dish). Real photographs, so there are no generated images in the app.

## Pairs with
Nothing: illustration only.

## Known flaws
The presets' numbers are round illustrative values and are **not** these vehicles' specifications. The caption under each photo says so. Surveyor 3 and the Apollo lunar module did not land at the south pole.

## Loading recipe
Download `https://images-assets.nasa.gov/image/<NASA ID>/<NASA ID>~medium.jpg`, centre-crop to 4:3, resize to 480 × 360, save as JPEG quality 82 (the Learn photos are 640 × 480 or 560 × 560). Captions and credits are in `web/src/battery.ts` and `web/index.html`.
