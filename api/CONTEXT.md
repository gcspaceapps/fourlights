# api/: the Worker

**What lives here:** the one Cloudflare Worker (Hono, TypeScript strict), `src/index.ts`. Config is `../wrangler.jsonc` at the repo root (obscure Worker name, served at fourlights.gcsa.space with workers.dev off, `account_id` pinned, static assets from `web/dist`).

**Entry points:**
- `GET /api/health` → `{ok, time}` (the Worker's clock, to show it is answering)
- `POST /api/ask` `{q}` → `{ok, intent: {date, slip_days, window_days, site}}`: Workers AI (binding `AI`, model in `src/intent.ts`) turns a typed question (≤ 200 characters) into planner settings. The reply is validated field by field in `src/intent.ts` (tested in `web/tests/`); the model never answers the question. 400 for empty or long input, 422 if nothing usable, 503 if the model fails
- everything else → the static assets (`web/dist`, including `/data/...` JSON)
- **Weekend password gate:** while the Worker secret `SITE_PASSWORD` is set, every request (pages, data, API) needs HTTP Basic Auth, user `fourlights`. `run_worker_first: true` makes the assets go through it too. **To open the site** (late Sunday, before the private-window link checks): `npx wrangler secret delete SITE_PASSWORD`. No code change or redeploy needed. Locally, `wrangler dev` has no password unless `.dev.vars` sets one.

**Run / test / deploy:** `npm run dev` (builds web, then `wrangler dev` on http://localhost:8787). Deploy per the deploy rule in `../_shared/how-we-work.md`: Steve, from an up-to-date clean `main`, `npm run deploy`. Everyone else: `npx wrangler versions upload` (the preview URL is password-gated too).

**Limits (Workers Free):** 10 ms CPU per request. The Worker routes and serves; no maths here.

**Touches:** no datasets directly. If you change routes, check `web/src/` fetch paths and the README.
