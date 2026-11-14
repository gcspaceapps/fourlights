# api/: the Worker

**What lives here:** the one Cloudflare Worker (Hono, TypeScript strict), `src/index.ts`. Config is `../wrangler.jsonc` at the repo root (obscure Worker name, served at fourlights.gcsa.space with workers.dev off, `account_id` pinned, static assets from `web/dist`).

**Entry points:**
- `GET /api/health` → `{ok, time}` (the Worker's clock, to show it is answering)
- `POST /api/ask` `{q}` → `{ok, intent: {date, slip_days, window_days, site}}`: Workers AI (binding `AI`, model in `src/intent.ts`) turns a typed question (≤ 200 characters) into planner settings. The reply is validated field by field in `src/intent.ts` (tested in `web/tests/`); the model never answers the question. 400 for empty or long input, 422 if nothing usable, 503 if the model fails
- `GET /etiles/<wac|lola>/<z>/<row>/<col>` → a NASA Moon Trek tile for the 3D map (`src/etiles.ts`, cards `_datasets/nasa-lro-*`). 404 outside the grid (WAC z0 to 8, LOLA z0 to 5; 2^(z+1) columns by 2^z rows), 502 if NASA fails. Cloudflare Cache API in front (URL-only key, behind the password gate; per data centre, custom domain only), one shared fetch per tile at a time, `Cache-Control: public, max-age=604800`. No R2: a cold data centre re-fetches from NASA
- **Shared projects** (`src/project.ts`, `src/project-state.ts`; the whole design is in `../_shared/shared-projects.md`): one SQLite-backed Durable Object (binding `PROJECTS`, class `Project`, migration `v1`) per project, named by its uuid. `POST /api/projects` `{name, sites?, data?, view?}` → 201 `{ok, project}` (the Worker makes the uuid; 400 without a name of up to 60 characters); `GET /api/projects/<uuid>` → the project, 404 if there is none; `POST /api/projects/<uuid>/commands` a command (what an MCP tool calls; `addSite` avoids the published site ids); `GET /api/projects/<uuid>/ws` the live WebSocket (426 without an upgrade, 429 past 20 people). There is no list route, on purpose: a project is found only by its uuid
- **MCP server** (`src/mcp.ts`, design and tool table in `../_shared/shared-projects.md`): `POST /mcp` and `POST /mcp/<uuid>` speak MCP over stateless Streamable HTTP (JSON-RPC; `GET` is 405). Tools read and change one project through the Durable Object's `snapshot()` and `command()`, and answer questions from `/data/planner.json` and `/data/reviews.json`. Behind the same password gate
- everything else → the static assets (`web/dist`, including `/data/...` JSON)
- **Weekend password gate:** while the Worker secret `SITE_PASSWORD` is set, every request (pages, data, API) needs HTTP Basic Auth, user `fourlights`. `run_worker_first: true` makes the assets go through it too. **To open the site** (late Sunday, before the private-window link checks): `npx wrangler secret delete SITE_PASSWORD`. No code change or redeploy needed. Locally, `wrangler dev` has no password unless `.dev.vars` sets one.

**Run / test / deploy:** `npm run dev` (builds web, then `wrangler dev` on http://localhost:8787). Deploy per the deploy rule in `../_shared/how-we-work.md`: Steve or Matt, from an up-to-date clean `main`, `npm run deploy`. A second agent session: `npx wrangler versions upload` (the preview URL is password-gated too).

**Locally:** `wrangler dev` also needs a Cloudflare login for the Workers AI binding; the Durable Object itself runs locally.

**Limits (Workers Free):** 10 ms CPU per request. The Worker routes and serves; no maths here.

**Touches:** no datasets directly. If you change routes, check `web/src/` fetch paths and the README.
