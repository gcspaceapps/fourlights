---
type: dataset
id: nasa-image-library
owner: NASA
status: used
---
# NASA Image and Video Library (three photographs)

**What it is:** three NASA photographs of real vehicles, shown as examples of each power-system class in Survive the Night.
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

## What it gives us
A picture of the kind of vehicle each preset stands for. Real photographs, so there are no generated images in the app.

## Pairs with
Nothing: illustration only.

## Known flaws
The presets' numbers are round illustrative values and are **not** these vehicles' specifications. The caption under each photo says so. Surveyor 3 and the Apollo lunar module did not land at the south pole.

## Loading recipe
Download `https://images-assets.nasa.gov/image/<NASA ID>/<NASA ID>~medium.jpg`, centre-crop to 4:3, resize to 480 × 360, save as JPEG quality 82. Captions and credits are in `web/src/battery.ts`.
