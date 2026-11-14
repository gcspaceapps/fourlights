# How we work

We're two experienced developers, 30 years and 20+ years in, and we intend to do a really good job: production habits, not hackathon spaghetti. Fast, but nothing we'd be embarrassed to show a judge who opens the repo.

## Cloudflare first, for everything it can do
- Front end and API run on **one Cloudflare Worker**: Hono + TypeScript (strict), static assets served by the same Worker. One `wrangler.jsonc` at the repo root, checked in, with `account_id` pinned. `main` is always deployable and the live URL always works. Deploy small and often.
- **Deploy rule.** `wrangler deploy` uploads the whole Worker and its assets from your checkout, so a stale checkout silently rolls back the live demo. Production deploys only from an up-to-date `main` (`git pull --rebase`, clean tree, `npm run check` passes), and **only by Steve or Matt** (Matt added Sat 14 Nov, 17:40); say so in the build log when you deploy, so the other pulls before deploying next. Any second agent session uses `wrangler versions upload` and shares the preview URL. A preview is for looking at only and is **never promoted** (that would put the uploader's whole bundle live: the same rollback). To ship it, merge into `main` and Steve or Matt deploys from `main`.
- A second agent session works in **its own git worktree on a branch** (from the repo root: `git worktree add ../fourlights-ui -b ui`), never in the main checkout.
- Static assets first; R2 only if the published files outgrow them. Cache headers so data is served from the edge.
- Only when the product needs them: Cron Triggers, AI Gateway in front of any paid model call (logging, caching, spend cap). KV, Queues or Workflows only when the concept needs them: each is extra risk. The one Durable Object is the shared project (`shared-projects.md`). Load the matching Cloudflare skill (wrangler, workers-best-practices) before writing Worker code or running wrangler, rather than relying on memory.
- **Two CLIs, split by job.** **Wrangler** (pinned in `package.json`, config `wrangler.jsonc`) does everything for the Worker: `dev`, `deploy`, `versions upload`, `secret`, `tail`. The **`cf` CLI** (Cloudflare's API CLI, beta, its own login: `cf auth login`) does account and zone tasks Wrangler can't, such as DNS (`cf dns records list --zone gcsa.space`) and zones. Never run `cf dev`, `cf build` or `cf deploy` here: they ignore `wrangler.jsonc`. Find a `cf` command with `cf cli search "<task>"` and preview with `--dry-run`.
- Infrastructure as code, if any, is OpenTofu (`tofu`), never Terraform.
- Workers Free plan: 10 ms CPU per request, so the Worker routes and serves; no maths in it. The browser does the four-lights maths from static JSON.

## Spatial: static JSON for the minimum demo; PostGIS only if GridScore happens; QGIS to look at layers
- The minimum demo has **no database**: the pipeline publishes small per-site JSON files.
- Only if we reach GridScore (stretch 4): Supabase (Postgres + PostGIS) for grid cells and scores. The Worker talks to it through SQL functions (RPC), returning GeoJSON or compact JSON. Schema in `db/` as numbered SQL migrations; GiST indexes on every geometry column. Locally, PostGIS runs in Podman (`docker.io/imresamu/postgis:17-3.5-bookworm`), not Docker.
- Moon coordinate systems are explicit everywhere: SRID 930100 (`IAU_2015:30100`, Moon geographic, R = 1737.4 km) and 930135 (`IAU_2015:30135`, south polar stereographic). Never mix Earth SRIDs in.
- Raster heavy lifting (horizons) stays in Python + GDAL/rasterio in `pipeline/`, using 3D Moon-fixed geometry (see the technical traps in `stages/01_data/CONTEXT.md`), split across cores with multiprocessing. The machines have 4 cores and 14 GB, so read big DEMs in windows. GRASS `r.horizon` is a near-field cross-check only.
- **QGIS is how we eyeball every layer** (DEM rings, site points) before it reaches the UI. A QGIS screenshot of each new layer goes in `stages/02_build/output/media/`.

## Data pipeline: reproducible or it didn't happen
- Every derived file is produced by a script in `pipeline/`, from raw inputs in `data/raw/`, by one command (a Makefile target). No hand-edited outputs. Each run logs inputs, command, time and output size in `stages/01_data/output/data-manifest.md`.
- Fetch scripts use the original NASA URLs (so judges can reproduce it) and fall back to the offline mirror at `$NASA_CACHE` (checked against its `MANIFEST.tsv` SHA-256) only if a URL fails.
- Units, frames and time are explicit in names and docs: degrees, metres, UTC everywhere, the lunar body-fixed frame (MOON_ME / MEAN_ME) and the ephemeris source (Horizons DE441 or SPICE DE440s).
- Validity is a judging criterion, so the maths is tested: unit tests on the horizon and ephemeris functions, and independent cross-checks recorded in the build log (`_shared/validation.md`).
- Start coarse and prove it end to end, then refine. Precompute what's slow; keep the UI instant.
- **Judges only ever see real NASA data.** Fake sites are Saturday-morning scaffolding; no fake file ships: `npm run check:real-data` fails if one is left in `web/public/data/`, and runs before the real demo is deployed. The UI names each dataset on screen.

## AI: Workers AI in the product, Claude Code to build, ICM for everything we do with it
- **AI inside the product: Cloudflare Workers AI is the first port of call** (Steve, Sat 14 Nov): cheap or free, in the same account, no key to manage. Another provider only if Workers AI can't do the job, and then behind AI Gateway with a spend-capped key held as a Worker secret. We use Claude for code generation only. AI is only in the product if it helps the named user make the decision, it is labelled on screen as AI-written, and anything it writes from our numbers is checked against them (see `pipeline/src/four_lights/site_review.py`). Prefer generating ahead of time over live calls.
- We build with Claude Code, and the repo is an ICM workspace on purpose: folders are the architecture, each folder has a `CONTEXT.md` contract, outputs are plain files a human reads before the next step, status is whatever exists in `stages/*/output/`, one home per fact. A new folder gets its `CONTEXT.md` in the same commit.
- The ICM is part of the story we tell judges (README "How we built it"), so it stays clean.

## Code quality, at hackathon speed
- TypeScript strict for `web/` and `api/`; Python in a venv with pinned requirements for `pipeline/`. Prettier + ESLint + `tsc` and ruff (lint + format) are on from the first code commit. **`npm run check`** runs them all; run it before every commit and deploy. No arguments about style.
- Small, focused commits with messages that say why. `git pull --rebase` before each. Never force-push. No commented-out code, no dead experiments in `main`, no secrets ever.
- Front end: its own design (see the scope note in `_shared/brand.md`), one type scale and one text width as CSS tokens in `web/src/style.css`, 4.5:1 contrast, keyboard-usable with shortcuts, fast on first load. Phones are a design goal, not a priority.
- The README works cold: someone who's never seen the repo can run it locally and redeploy it.
- Cut scope, not quality: when time runs short, apply the scope-cut order in `_shared/concept.md` and keep what's left polished.
