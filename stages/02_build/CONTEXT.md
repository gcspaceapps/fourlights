# 02_build: the app, end to end

One job: the Sun-Path Chart and the Slip Planner working end to end on real NASA data, deployed, then polish the demo moment.

## Inputs
Working (this run): `web/`, `api/`, `web/public/data/` (from 01_data), `output/build-log.md`.
Reference (every run): `../../_shared/concept.md` (lights, window, usable days, scope-cut order), `../../_shared/how-we-work.md` (deploy rule), `../../_shared/brand.md`, `../../_shared/stack.md` (data contract).
Do NOT load: `data/raw/`, the DEMs, `stages/03_pitch/`, `stages/04_submit/`.

## Status (Sat 14 Nov, afternoon)
Steps 1 to 3 are done: the app runs on real data only and is deployed; the fixtures are gone. Step 4 is done for screenshots; the screen recording is Steve's to make. The starter prompts below are kept as the record of how each block was started; don't rerun them. Current state and next steps: `output/build-log.md`.

## Process
1. End to end first on fake data (data in → lights computed → visual out); ugly is fine. Fake files are scaffolding only.
2. Swap in the real data from 01_data; delete every fake file (`npm run check:real-data` fails if one remains in `web/public/data/`).
3. **Deadline 20:00 Sat 14 Nov AEST: the demo works end to end on real data, deployed.** If not, apply the scope-cut order in `../../_shared/concept.md`, no negotiating.
4. Capture screenshots and a screen recording of the demo moment into `output/media/` as soon as it works.
5. Keep `output/build-log.md` current: "Now / Next / Blocked" at the top, one line per block below.

## The weekend (AEST)
See `../../CONTEXT.md` for the Saturday and Sunday block tables.

## Starter prompts (paste as-is into a Claude Code session at the repo root)
Set `NASA_CACHE` first. A second session (M1, S5a) works in its own worktree: from the repo root, `git worktree add ../fourlights-ui -b ui`, and open the session there.

**S1: data contract**
```text
Read AGENTS.md, _shared/concept.md and the data contract in _shared/stack.md. Write the contract as
docs in stages/01_data/CONTEXT.md and as TypeScript types in web/src/types.ts. Write a small fixture
script that generates three fake sites, web/public/data/sites/fake-a.json, fake-b.json, fake-c.json
(horizons at 1, 2 and 5 m, 720 sectors with a ridge; 90 days of hourly Sun/Earth az/el with the Sun
skimming near 1° and Earth bobbing around 6°; make the three differ so one stays lit after a 3-day
slip and two don't) and web/public/data/sites.json pointing at them. Angles rounded to 0.01°. Make sure
Vite copies public/ into web/dist and the Worker serves /data/... Commit, deploy, log it.
```

**S2: horizon pipeline (Shackleton rim)**
```text
Read stages/01_data/CONTEXT.md (incl. the technical traps), _shared/sites.md and the LOLA card in
_datasets/. In pipeline/ (Python venv, pinned requirements, Makefile target), write a reproducible
script that computes the horizon profile for one site at observer heights 1, 2 and 5 m: for each of
720 azimuth sectors of 0.5°, the HIGHEST elevation angle of any terrain in that sector (not one ray
per sector: a narrow distant peak between rays must not be missed).
Method: convert DEM pixels to 3D Moon-fixed Cartesian (R = 1737.4 km sphere + height), build the local
east-north-up frame at the site, and work in true azimuth (clockwise from true north, as Horizons
uses). Do NOT use grid bearings: at the pole grid north and true north differ by about the longitude,
and at a south-pole site true north points directly AWAY from the pole.
DEMs: take the site and a list of DEMs ordered fine to coarse (5 m site tile, 87S 5 m mosaic,
LDEM_875S_20M / LDEM_85S_20M, LDEM_75S_60M, LDEM_75S_240M) and for every point use the finest DEM that
covers it. Don't hard-code Shackleton's rings: some sites have no 5 m tile and two lie outside every
20 m product. Write the rings actually used into meta.dem_rings. PDS .IMG files store scaled
integers: apply SCALING_FACTOR/OFFSET from the .LBL, and assert the DEMs agree where they overlap.
Site point: per the rule in _shared/sites.md (highest pixel within 2 km of the centre; Barker's
centroid for connecting-ridge).
Unit tests: a synthetic peak placed further from the pole on the site's own meridian appears at
azimuth 0°; a flat sphere gives a horizon dip matching the formula; a one-pixel spike between two
sector centres is still seen. Independent check: brute force over ALL pixels in 8 sectors.
GRASS r.horizon on the near-field tile only, converting its angle convention (counter-clockwise from
grid east) and noting any curvature assumption; record the offsets in the build log, don't force a
match. This GRASS check is the first thing to drop if the block runs past 13:30.
Memory: this machine has 14 GB, so read the large DEMs in windows/chunks, never whole.
Download from the original URLs in the LOLA card; if one fails, use $NASA_CACHE (check MANIFEST.tsv
SHA-256). Log every run in stages/01_data/output/data-manifest.md. Start with Site04 Shackleton rim.
```

**M1: Sun-Path Chart UI** (second session, in its own worktree on branch `ui`)
```text
You are a second session working in your own worktree on branch ui. Never run `wrangler deploy` and
never push to main: commit to ui, push the branch, and show your work with `wrangler versions upload`
(give me the preview URL). Steve merges ui into main and deploys.
Read AGENTS.md, _shared/concept.md, web/CONTEXT.md and web/src/types.ts. Build the Sun-Path Chart in
web/ against web/public/data/sites/fake-a.json: a 360° panorama (azimuth across, true north centred or
selectable; elevation up, with the vertical range taken from the data), the skyline as a filled
silhouette (switch between observer heights), the Sun and Earth tracks with time ticks, a time slider
moving both markers, and the four lights using the definitions in _shared/concept.md: Sun, Earth and
Comms for the slider's time, Power for the mission window as a whole (default 7 days from the window
start; thresholds as named constants in one file). Brand rules from _shared/brand.md. Keyboard-usable,
works on a phone. Don't touch pipeline/. Run `npm run check`, upload a preview and log it.
```

**S3: ephemeris pull**
```text
Read the Horizons card in _datasets/. In pipeline/, write a script that pulls hourly Sun and Earth
az/el from JPL Horizons for each site in web/public/data/sites.json (CENTER='coord@301',
COORD_TYPE='GEODETIC', QUANTITIES='4'): 2028-01-01 to 2029-12-31 for every site, plus 2024-01-01 to
2026-01-01 for connecting-ridge (validation), plus 2026-11-14 08:00 to 12:00 UTC at 1-minute steps for
every site (the Moon photo window). One request per site, body and range; check the first response
for any truncation. Cache raw responses in data/raw/. Merge the product range into the per-site JSON;
the other two go under web/public/data/validation/ per the data contract. Tests: one known timestamp
parsed right; Earth's azimuth is within 20° of 0° from malapert-massif and within 20° of 180° from
shackleton-rim (catches a flipped north). If Horizons is down, compute the same az/el with Skyfield
or spiceypy from the SPICE kernels in $NASA_CACHE/spice/ (DE440s, Moon ME frame). If it's up, compare
both for one site and log the difference as a validity check.
```

**S4: all 12 sites** (on whichever machine has the mirror)
```text
Read _shared/sites.md, stages/01_data/CONTEXT.md and the LOLA card. Write a script that turns the site
list into web/public/data/sites.json: for each site, recompute the tile or region centre from the raw
files (GeoTIFF headers; the USGS region grids; the Site07 point cloud), then pick the site point by
the rule in _shared/sites.md and record it in point_rule. Assert the connecting-ridge point lies
inside the Site01 tile. Set approx: true where there is no 5 m terrain under the site. Then run the
S2 horizon script (heights 1, 2, 5 m) and the S3 ephemeris merge for all 12 sites, in parallel across
cores with multiprocessing, and write one JSON per site plus the validation files. Look at each
skyline plot before trusting it. This runs on a 4-core, 14 GB machine: read the big DEMs in chunks
(windowed reads), never whole, and print progress per site. Commit the JSON. Log every run, with its
run time, in data-manifest.md. If it is running far over 20 minutes, do the 6 PGDA sites first.
```

**S5: Slip Planner** (S5a: second session, fake data, same worktree rules as M1. S5b: main session, real data)
```text
Read _shared/concept.md and web/CONTEXT.md. Build the Slip Planner: rows = sites, columns = landing
start dates, cell = usable days for a mission window starting that day (default 7 days; 14 and 30
selectable). Usable days = hours in the window with the Sun light and the Comms light both on (Sun's
centre above the terrain, Earth's centre at least 1° above it), divided by 24, to one decimal. Colour
the cell green/amber/red from the Power light and usable days, thresholds as named constants. A
"slip" control moves the planned date a day at a time. Clicking a cell opens the Sun-Path Chart for
that site and window. Compute in the browser from the per-site JSON; load site files lazily. Build it
against the three fake sites first. Run `npm run check`, upload a preview and log it.
```

**S6: end to end on real data**
```text
Swap the fake sites for the real web/public/data/sites.json and per-site files. Check the Sun-Path
Chart and Slip Planner on every site (vertical range from the data; approx sites labelled; the
point_rule and DEM rings shown on the site's info panel; each NASA dataset named on screen). From the
real results, set the Power thresholds and pick the demo scenario: a planned date and a slip where
some sites go red and one stays green. Write both into _shared/concept.md. Remove the fake files.
Deploy from main, curl the live URL, capture screenshots and a screen recording of the demo moment,
log it.
```

**S7: validation**
```text
Read _shared/validation.md and Matt's table in the build log. From validation/connecting-ridge.json,
compute average illumination, the longest sunlit stretch and the longest dark stretch for 2024-01-01
to 2026-01-01 at 1 m and 5 m. Compare with Barker 2021 Table 2 and say plainly how the methods differ
(single point and Sun's centre vs region average, 1st percentile of 100 clones, Sun as a disc). Claim
"consistent with" only if it is. If there's a Moon photo (or an LROC image), list which of our sites
the model says are sunlit and Earth-facing at that minute, from validation/photo-2026-11-14/. One
paragraph and one small table in the build log; the same numbers go on the project page.
```

**C1: Canberra Link (stretch 1, Sunday)**
```text
Read _shared/concept.md and the DSN section of _shared/validation.md. For each hour in the
product range, compute the Moon's elevation from Goldstone (DSS-14), Canberra (DSS-43) and Madrid
(DSS-63) using Horizons (Earth observer sites) or the NAIF station kernels in $NASA_CACHE/spice/.
Add a stations array to each site JSON (one bitmask per hour: which stations see the Moon at ≥ 10°).
Comms light = Earth ≥ 1° above terrain AND at least one station. Show which station carries the link.
```

## Outputs
- The live demo (URL in the README), `output/build-log.md`, `output/media/` (screenshots, screen recording, QGIS views)

## Human check
The person who didn't write it runs the demo cold from the README on their own machine (Matt, 20:30 Sat) and writes what broke into the build log's "Next".
