# ops/: run and operate the repo

**What lives here:** small shell scripts for running the project. Each works from any directory and moves to the repo root itself.

**Entry points:** `./ops/dev` installs dependencies if missing, builds `web/` and serves page, data and API on http://localhost:8787 with `wrangler dev --local` (extra arguments go to wrangler, e.g. `--port 8790`). Workers AI is not available in this mode, so `/api/ask` and the question box don't answer; `DEV_REMOTE=1 ./ops/dev` drops `--local`, which needs a login to the account pinned in `wrangler.jsonc` (Steve's). Set `SITE_PASSWORD` in `.dev.vars` to switch on the password gate locally.

`./ops/data` builds the published site data from the raw NASA files (the precompute in `../pipeline/`): no arguments for every site, site ids for some, or `./ops/data add <id> "<Name>" <lat> <lon_e>` to register a new site (latitude −90 to −80, east longitude) and build it. It makes `pipeline/.venv` on first use (needs `uv`), downloads about 5 GB into `data/raw/` once, takes about a minute per site, then refreshes `web/public/data/planner.json`. After adding a site: `python -m four_lights.site_review <id>` in `pipeline/` writes its review (needs the `cf` CLI logged in to Steve's account; the page works without one), the end-to-end tests that count 12 sites need the new count, and the site joins the table in `_shared/sites.md` with `python -m four_lights.sites_table`.

**Rules:** scripts wrap the `npm run` commands rather than replace them; `package.json` stays the source of truth. Production deploys follow the deploy rule in `../AGENTS.md`. The full add-a-site steps are in `../stages/01_data/CONTEXT.md`.
