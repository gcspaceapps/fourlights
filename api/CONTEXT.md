# api/: the Worker

**What lives here:** the one Cloudflare Worker (Hono, TypeScript strict), `src/index.ts`. Config is `../wrangler.jsonc` at the repo root (obscure Worker name until Sunday 19:30 AEST, `account_id` pinned, static assets from `web/dist`).

**Entry points:**
- `GET /api/health` → `{ok, built}`
- everything else → the static assets (`web/dist`, including `/data/...` JSON)
- **Weekend password gate:** while the Worker secret `SITE_PASSWORD` is set, every request (pages, data, API) needs HTTP Basic Auth, user `fourlights`. `run_worker_first: true` makes the assets go through it too. **To open the site** (late Sunday, before the private-window link checks): `npx wrangler secret delete SITE_PASSWORD`. No code change or redeploy needed. Locally, `wrangler dev` has no password unless `.dev.vars` sets one.

**Run / test / deploy:** `npm run dev` (builds web, then `wrangler dev` on http://localhost:8787). Deploy per the deploy rule in `../_shared/how-we-work.md`: Steve, from an up-to-date clean `main`, `npm run deploy`. Everyone else: `npx wrangler versions upload`.

**Limits (Workers Free):** 10 ms CPU per request. The Worker routes and serves; no maths here.

**Touches:** no datasets directly. If you change routes, check `web/src/` fetch paths and the README.
