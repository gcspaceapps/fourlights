# Four Lights

**Which lunar south-pole landing site still works when your launch slips?** Four Lights shows, for any site and date, whether the Sun and Earth are above that site's real terrain horizon, and turns that into four status lights: **Sun**, **Earth**, **Power** and **Comms**.

Our entry for the [NASA Space Apps Challenge 2026](https://www.spaceappschallenge.org/), challenge [#11 Lunar Landing Site Navigator](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/).

**Live demo:** _URL added on Sunday evening_

![The Slip Planner after a 3-day slip: four sites go red, two stay green](stages/02_build/output/media/screenshot.png)
_Planned landing 19 April 2028, launch slips 3 days: Connecting Ridge, both de Gerlache sites and Peak near Cabeus B lose power, Peak near Shackleton and Slater Plain still work, and Shackleton rim comes good._

## What it does
- **Sun-Path Chart:** stand at a site and look around: a 360° skyline from NASA's LOLA terrain, with the Sun's and Earth's paths traced over it and a time slider.
- **Slip Planner:** sites × landing dates, each cell showing **usable days** (hours with the Sun up and Earth in view, over the mission window). Slip the date and see which sites still work.
- **Canberra Link:** the Comms light also needs a Deep Space Network station (Goldstone, Canberra or Madrid) that can see the Moon, and names the one carrying the link.
- **Site map:** the 12 sites on LOLA terrain shading of the pole, coloured for the planned landing.
- **Ask in plain English:** type "Launch slips 3 days from 19 April. Which sites still work?" and the planner moves to that view. A language model only translates the words into settings; the planner computes the answer.
- **Site review:** a short AI-written summary of each site, generated ahead of time from our own numbers and labelled as such.
- **Survive the Night:** a simple battery model through the mission window: does a given power system make it through the dark spells? Start from a preset, or adjust the array, loads and battery for planning or for looking back.
- **Three views:** Mission (terse, shortcuts in sight), Explore (the default) and Learn (teaching panels, a glossary and things to try), for planners, the public and classrooms.
- **Keyboard shortcuts:** `]` and `[` slip the date, arrows move the time, `J`/`K` change site; `Ctrl` `/` (or `?`) lists them all.
- **Data sources page** (`/sources`): every dataset, what the app uses it for, what we did to it, how we checked it, its limits, licence and citation, plus links to download our derived files.
- **Where it comes from:** an info button beside each view, light and number says which NASA dataset or which of our own definitions is behind it.
- 12 curated sites: the six NASA PGDA 5 m sites and six more of NASA's Artemis candidate regions.

## Run it locally
Needs Node 22+, Python 3.12+, [uv](https://docs.astral.sh/uv/) and ruff.
```sh
npm install          # also switches on the repo's git hooks
npm run dev          # builds web/, then serves page + data + API on http://localhost:8787
npm run check        # formatting, lint, type check, unit tests, ruff
npm run test:e2e     # end-to-end tests in Chrome (about 30 s; not part of check)
```
The published data for all 12 sites is in the repo (`web/public/data/`), so the app runs without the pipeline. `.dev.vars` (gitignored) can set `SITE_PASSWORD` to switch on the password gate locally.

## Deploy
```sh
git pull --rebase && npm run deploy   # check, refuse fixture data, build, wrangler deploy
```
The Cloudflare `account_id` and the custom domain are pinned in `wrangler.jsonc`.

## The data pipeline
`pipeline/` downloads the raw NASA files into `data/raw/` (gitignored), computes a horizon profile for each site (720 sectors of 0.5°, from 5 m terrain out to hundreds of km, in 3D Moon-fixed geometry), pulls hourly Sun and Earth positions from JPL Horizons, and writes small JSON files to `web/public/data/`. The browser computes the four lights from those. Every run is logged in [`stages/01_data/output/data-manifest.md`](stages/01_data/output/data-manifest.md); the data contract is in [`_shared/stack.md`](_shared/stack.md).

To rebuild the data from NASA's own files (about 6 GB of downloads, then roughly 15 minutes for 12 sites on a 14 GB laptop; needs GDAL):
```sh
cd pipeline
make venv && make test
make sites           # fetch (SHA-256 checked), horizons, JPL Horizons ephemerides, publish
(cd .. && npm run planner-data)   # refresh the planner's summary from the new site files
make validate        # Connecting Ridge 2024-2026 against Barker et al. 2021
```

## How we know it's right
- The horizon engine is checked against a brute-force version written with different maths (pyproj and spherical trigonometry): identical on 8 sectors across all six elevation models.
- Unit tests with known answers: a peak away from the pole appears at true north, a bare sphere gives the textbook horizon dip, a one-pixel spike between sector centres is still seen, a smooth dome gives its analytic horizon.
- GRASS `r.horizon` on the 5 m tile finds the same peaks, within about 0.1°.
- JPL Horizons and NAIF SPICE give the same Sun and Earth directions to a millionth of a degree, and Earth's azimuth matches each site's longitude.
- Against Barker et al. (2021) at Connecting Ridge, our longest night matches their range at 1 m and 5 m. Our average illumination is a few points higher, and at 1 m it varies by 9 points between pixels 20 m apart. Details and the honest comparison are in the [build log](stages/02_build/output/build-log.md).

## Data sources and credits
- **LOLA south-pole elevation models** (NASA GSFC PGDA and PDS): 5 m site DEMs and 87°S mosaic, https://pgda.gsfc.nasa.gov/products/78 , https://pgda.gsfc.nasa.gov/products/81 ; polar gridded DEMs, https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/ . Barker et al. (2021), PSS 203, 105119. NASA open data.
- **JPL Horizons** (NASA JPL Solar System Dynamics): Sun and Earth positions from each site, https://ssd.jpl.nasa.gov/horizons/ . NASA open data.
- **NAIF SPICE kernels** (NASA JPL): DE440s, Moon frames, DSN stations, https://naif.jpl.nasa.gov/ . NASA open data.
- **Artemis candidate regions** (USGS, for NASA): LGRS navigational grids, https://doi.org/10.5066/P1MEQ6UK . Public domain.
- **Photographs** (NASA Image and Video Library, public domain): Surveyor 3 (AS12-48-7121), a VIPER rover prototype (GRC-2021-C-00493, NASA/GRC/Bridget Caswell) and the Apollo 11 lunar module (AS11-40-5927), https://images.nasa.gov .
- **Icons:** [Phosphor Icons](https://phosphoricons.com) (MIT licence).
- Validation: Barker et al. 2021, Mazarico et al. 2011, LOLA and LROC polar illumination maps (`_shared/validation.md`).
Full cards: [`_datasets/`](_datasets/_index.md).

## Licence
Code: [Apache-2.0](LICENSE). Docs, images and the published data files: [CC BY 4.0](LICENSE-docs.md). NASA's source data stays NASA's (credited above); third-party packages keep their own licences.

## Team
Steve Dalton and Matt Paine (team "Make it So", Gold Coast).

## How we built it
The repo is laid out so a coding agent can walk it: numbered stages (`stages/`), each with a `CONTEXT.md` contract and an `output/` folder, shared facts in `_shared/`, one card per dataset in `_datasets/`, and code in plain folders (`pipeline/`, `api/`, `web/`).

The plan, data contract and build prompts were written before the start, and raw NASA files were mirrored unmodified as an outage fallback; all code and data processing happened after 09:00 Sat 14 Nov.

We used AI coding tools (Claude) to help write the code, tests and data pipeline; the idea, the design decisions and the checking of results are ours. In the app, the short "Site review" paragraph for each site is written by a language model on Cloudflare Workers AI (Llama 3.3 70B) from numbers we computed, and is labelled as AI-written; every number in it is checked against those numbers. The "ask in plain English" box uses the same model only to turn a typed question into the planner's settings; it never produces the answer. No AI-generated images, video or audio.
