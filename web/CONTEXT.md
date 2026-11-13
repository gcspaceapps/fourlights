# web/: the front end

**What lives here:** Vite + TypeScript (no framework), `index.html`, `src/main.ts`, `src/style.css` (brand tokens from `../_shared/brand.md`), and `public/data/`, the published JSON from the pipeline, served at `/data/...`. Builds to `web/dist`, which the Worker serves.

**Entry points:** `index.html` → `src/main.ts`. Data types: `src/types.ts` (written in S1 from the data contract in `../_shared/stack.md`).

**Run / test:** `npm run dev` at the repo root (build + `wrangler dev`), or `npm run dev -w web` for Vite alone. `npm run check` before every commit. Before the real demo ships: `npm run check:real-data` (fails if any `fake-` file is left in `public/data/`).

**Rules:** the four lights, mission window and usable days follow `../_shared/concept.md` exactly; thresholds are named constants in one file. The browser does the maths (the Worker can't: 10 ms CPU). Brand colours and fonts, 4.5:1 contrast, keyboard-usable, works on a phone. Each NASA dataset is named on screen.

**Touches:** `public/data/` is written by `pipeline/` (see `../_datasets/`). If you change the data shape, change `../_shared/stack.md`, `src/types.ts` and the pipeline together.
