# ops/: run and operate the repo

**What lives here:** small shell scripts for running the project. Each works from any directory and moves to the repo root itself.

**Entry points:** `./ops/dev` installs dependencies if missing, builds `web/` and serves page, data and API on http://localhost:8787 with `wrangler dev --local` (extra arguments go to wrangler, e.g. `--port 8790`). Workers AI is not available in this mode, so `/api/ask` and the question box don't answer; `DEV_REMOTE=1 ./ops/dev` drops `--local`, which needs a login to the account pinned in `wrangler.jsonc` (Steve's). Set `SITE_PASSWORD` in `.dev.vars` to switch on the password gate locally.

**Rules:** scripts wrap the `npm run` commands rather than replace them; `package.json` stays the source of truth. Production deploys are Steve's alone (see `../AGENTS.md`).
