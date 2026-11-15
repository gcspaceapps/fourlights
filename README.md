# Four Lights

**Which lunar south-pole landing site still works when your launch slips?** Four Lights shows, for any site and date, whether the Sun and Earth are above that site's real terrain horizon, and turns that into four status lights: **Sun**, **Earth**, **Power** and **Comms**.

Our entry for the [NASA Space Apps Challenge 2026](https://www.spaceappschallenge.org/), challenge [#11 Lunar Landing Site Navigator](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/).

**Live demo:** https://fourlights.gcsa.space

![The Slip Planner after a 3-day slip: the plan stays pinned on 19 April and the answer says what the slip cost](stages/02_build/output/media/screenshot.png)
_Planned landing 19 April 2028, launch slips 3 days: Connecting Ridge, both de Gerlache sites and Peak near Cabeus B lose power, Peak near Shackleton and Slater Plain still work, and Shackleton rim comes good._

## Try it in two minutes
1. Open the app. The **Planner** shows 12 candidate landing sites against landing dates; each cell is the **usable days** in the mission window (time with sunlight and a link to Earth). Six sites work for 19 April 2028.
2. Press **Slip + 1 day** three times (or `]`). The plan stays pinned, the highlight moves to 22 April, and the sentence above the table tells you what the slip cost: four sites lost, one gained, two still work.
3. Click a green cell. The **Sun-Path Chart** opens for that site: its real skyline all the way round, the Sun's path in gold and Earth's in blue, and four lights (Sun, Earth, Power, Comms). Drag the time slider.
4. Open the **Map** to see all 12 sites on a 3D Moon, coloured for that landing date.
5. Press **Guide** at the end of the tab bar for an explanation of the tab you are on and things to try.

## What it does

**Planning**
- **Slip Planner:** sites × landing dates, each cell the usable days for a landing on that date, with a verdict by colour and shape (works, marginal, no power). Slip the landing and the plan stays pinned: the answer says what the slip cost, and pointing at a cell says why it passes or fails.
- **Ask in plain English:** type "Launch slips 3 days from 19 April. Which sites still work?" and the planner moves to that view. A language model only turns the words into settings; the planner computes the answer.
- **Mission window** of 7, 14 or 30 days, and any landing date in 2028 or 2029.

**One site in detail** (the tabs named after the selected site)
- **Sun-Path Chart:** stand at the site and look around: a 360° skyline from NASA's LOLA terrain with the Sun's and Earth's paths traced over it, a time slider, and the four lights for that hour. The Comms light also needs a Deep Space Network station (Goldstone, Canberra or Madrid) that can see the Moon, and names the one carrying the link.
- **Sun and Earth at this hour:** azimuth, elevation, the terrain height in that direction and the clearance, for aiming solar panels and antennas, with a CSV download of the whole mission window.
- **Survive the Night:** a simple battery model through the mission window: does a given power system make it through the dark spells? Start from a preset or adjust the array, loads and battery.
- **Landing site details:** where the site is, which elevation models its skyline came from, and a short AI-written review, generated ahead of time from our own numbers, checked against them and labelled as such.

**All the sites**
- **3D map:** a Moon you can turn and zoom, opening over the south pole in our own LOLA hillshade, with NASA LRO imagery and LOLA elevation as the other layers and the 12 sites coloured for the landing shown. Choose a site anywhere and the Moon turns to it. Add sites of your own as notes.
- **12 curated sites:** the six NASA PGDA 5 m sites and six more of NASA's Artemis candidate regions.

**Working together, and with an AI assistant**
- **Share Project:** name a project and get a link: everyone who opens it sees the same site, date, slip, window and added sites live, and can follow each other's tab and view. No accounts; a project is found only by its ID.
- **MCP:** each shared project has an MCP address, so Claude, ChatGPT or any MCP client can read the project, rank sites from the published numbers and change what everyone sees. The Share dialog gives the address and the steps.

**For different people**
- **Two views:** Mission (terse, keyboard shortcuts in sight) and Explore (the default).
- **The Guide:** in Explore, a panel beside the tools that follows the tab you are on: what it shows, things to try, NASA photographs and charts drawn from the site's own data, where AI is used, a glossary and further reading. For newcomers and classrooms.
- **Keyboard shortcuts:** `]` and `[` slip the date, left and right arrows switch tab, `,` and `.` move the time, `J`/`K` change site, `I` opens the guide; `Ctrl` `/` (or `?`) lists them all, and the single-key ones can be switched off there.
- **Open in QGIS** (`/qgis`): the same sites, verdicts, skylines and terrain as map layers that QGIS reads straight from the site, with a ready-made project file, an offline GeoPackage, and where to get QGIS. No map server and no database.

**Showing its working**
- **Where it comes from:** an info button beside each view, light and number says which NASA dataset or which of our own definitions is behind it.
- **Data sources** (`/sources`): every dataset, what the app uses it for, what we did to it, how we checked it, its limits, licence and citation, plus links to download our derived files.
- **How we built it** (`/how`): the architecture with diagrams, the design decisions and their trade-offs, the pipeline, the horizon engine, and how each layer is independently checked.

## Run it locally
Needs Node 22+, Python 3.12+, [uv](https://docs.astral.sh/uv/) and ruff.
```sh
npm install          # also switches on the repo's git hooks
npm run dev          # builds web/, then serves page + data + API on http://localhost:8787
npm run check        # formatting, lint, type check, unit tests, ruff
npm run coverage     # unit-test coverage for the app and the pipeline (tables, plus HTML in coverage/)
npm run test:e2e     # end-to-end tests in Chrome (about a minute and a half; not part of check)
npm run test:e2e:watch   # the same, in a visible Chrome window, slowed down so you can follow
npm run test:e2e:ui      # Playwright's test window: pick tests, step through, replay each action
npm run review-pdf   # a PDF of every view, tab and state with captions, from a running local copy
```
The published data for all 12 sites is in the repo (`web/public/data/`), so the app runs without the pipeline. The tests: 115 unit tests for the app and Worker, 49 for the pipeline, and 41 end-to-end in a real browser. `.dev.vars` (gitignored) can set `SITE_PASSWORD` to switch on the password gate locally.

## Find your way around
| If you want | Look at |
|---|---|
| what we built and why, hour by hour | [`stages/02_build/output/build-log.md`](stages/02_build/output/build-log.md) |
| the idea, the four lights' rules and what we cut | [`_shared/concept.md`](_shared/concept.md) |
| each dataset: what it is, how we load it, its flaws | [`_datasets/`](_datasets/_index.md) |
| every pipeline run, with inputs and sizes | [`stages/01_data/output/data-manifest.md`](stages/01_data/output/data-manifest.md) |
| how the results were checked | [`_shared/validation.md`](_shared/validation.md), and "How we know it's right" below |
| the code | `web/` (the page), `api/` (the Cloudflare Worker), `pipeline/` (Python and GDAL); each has a `CONTEXT.md` |
| the submission text | [`stages/03_pitch/output/project-page.md`](stages/03_pitch/output/project-page.md) |

## Deploy
```sh
git pull --rebase && npm run deploy   # check, refuse fixture data, build, wrangler deploy
```
The Cloudflare `account_id` and the custom domain are pinned in `wrangler.jsonc`.

Steve and Matt both commit to `main` and deploy to production, always from an up-to-date, clean `main`. To show work before it ships, share a preview instead (a preview is never promoted):
```sh
npm run check && npm run build && npx wrangler versions upload   # prints a preview URL
```

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

The same thing in one command, from the repo root: `./ops/data` (every site) or `./ops/data haworth` (some). To add a site of your own and get the same data as the others:
```sh
./ops/data add amundsen-rim "Amundsen rim" -84.23 69.5   # id, name, latitude, east longitude
```

## How we know it's right
- The horizon engine is checked against a brute-force version written with different maths (pyproj and spherical trigonometry): identical on 8 sectors across all six elevation models.
- Unit tests with known answers: a peak away from the pole appears at true north, a bare sphere gives the textbook horizon dip, a one-pixel spike between sector centres is still seen, a smooth dome gives its analytic horizon.
- GRASS `r.horizon` on the 5 m tile finds the same peaks, within about 0.1°.
- JPL Horizons and NAIF SPICE give the same Sun and Earth directions to a millionth of a degree, and Earth's azimuth matches each site's longitude.
- Against Barker et al. (2021) at Connecting Ridge, our longest night matches their range at 1 m and 5 m. Our average illumination is a few points higher, and at 1 m it varies by 9 points between pixels 20 m apart. Details and the honest comparison are in the [build log](stages/02_build/output/build-log.md).

## Data sources and credits
- **LOLA south-pole elevation models** (NASA GSFC PGDA and PDS): 5 m site DEMs and 87°S mosaic, https://pgda.gsfc.nasa.gov/products/78 , https://pgda.gsfc.nasa.gov/products/81 ; polar gridded DEMs, https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/ . Barker et al. (2021), PSS 203, 105119. NASA open data.
- **LRO WAC global mosaic** and **LOLA colour-shaded elevation** (NASA GSFC / Arizona State University / MIT, via NASA Moon Trek, https://trek.nasa.gov/moon/): the 3D Moon in the Map tab, served through our own tile route. NASA open data.
- **JPL Horizons** (NASA JPL Solar System Dynamics): Sun and Earth positions from each site, https://ssd.jpl.nasa.gov/horizons/ . NASA open data.
- **NAIF SPICE kernels** (NASA JPL): DE440s, Moon frames, DSN stations, https://naif.jpl.nasa.gov/ . NASA open data.
- **Artemis candidate regions** (USGS, for NASA): LGRS navigational grids, https://doi.org/10.5066/P1MEQ6UK . Public domain.
- **Photographs** (NASA Image and Video Library, public domain, https://images.nasa.gov): Surveyor 3 (AS12-48-7121), a VIPER rover prototype (GRC-2021-C-00493, NASA/GRC/Bridget Caswell), the Apollo 11 lunar module (AS11-40-5927), the Clementine south-pole mosaic (PIA00001, NASA/JPL/USGS), Earth over the lunar horizon from Apollo 8 (AS08-14-2383) Deep Space Station 43 (PIA23797, NASA/JPL-Caltech), the south pole from LRO's Wide Angle Camera (PIA13523, NASA/GSFC/Arizona State University), an artist's rendering of the Lunar Reconnaissance Orbiter (PIA18163, NASA/GSFC) and Alan Bean fuelling Apollo 12's generator (AS12-46-6790).
- **Icons:** [Phosphor Icons](https://phosphoricons.com) (MIT licence).
- **Software in the app:** [three.js](https://threejs.org) (the 3D Moon), [Hono](https://hono.dev) (the Worker) and [Mermaid](https://mermaid.js.org) (the diagrams on the how-we-built-it page), all MIT licence; the typefaces are [IBM Plex](https://www.ibm.com/plex/) (SIL Open Font License 1.1).
- Validation: Barker et al. 2021, Mazarico et al. 2011, LOLA and LROC polar illumination maps (`_shared/validation.md`).
Full cards: [`_datasets/`](_datasets/_index.md).

## Licence
Code: [Apache-2.0](LICENSE). Docs, images and the published data files: [CC BY 4.0](LICENSE-docs.md). NASA's source data stays NASA's (credited above); third-party packages keep their own licences.

## Team
Steve Dalton and Matt Paine (team "Make it So", Gold Coast). We both love maps and have worked extensively with GIS tools such as QGIS and PostGIS on Earth, but never on the Moon before. We work at [Refactor](https://refactor.com.au) and its R&D arm [Refactor Red](https://refactor.red); Refactor is a contributor to the QGIS project and has previously contributed funding to the LIDAR features within QGIS. We use Agile principles throughout: test-driven development, pair programming, fast cycles and small batch sizes.

## How we built it
The repo is laid out so a coding agent can walk it: numbered stages (`stages/`), each with a `CONTEXT.md` contract and an `output/` folder, shared facts in `_shared/`, one card per dataset in `_datasets/`, and code in plain folders (`pipeline/`, `api/`, `web/`).

The plan, data contract and build prompts were written before the start, and raw NASA files were mirrored unmodified as an outage fallback; all code and data processing happened after 09:00 Sat 14 Nov.

We used AI coding tools (Claude) to help write the code, tests and data pipeline; the idea, the design decisions and the checking of results are ours. In the app, the short "Site review" paragraph for each site is written by a language model on Cloudflare Workers AI (Llama 3.3 70B) from numbers we computed, and is labelled as AI-written; every number in it is checked against those numbers. The "ask in plain English" box uses the same model only to turn a typed question into the planner's settings; it never produces the answer. No AI-generated images, video or audio.
