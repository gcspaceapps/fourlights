# Four Lights: agent instructions

Our entry for NASA Space Apps Challenge 2026, challenge #11 Lunar Landing Site Navigator: compare lunar south-pole landing sites and dates by where the Sun and Earth sit against each site's real terrain horizon. Team: Steve Dalton and Matt Paine. Humans start at `README.md`.

This repo stands on its own. Everything a task needs is in it; don't read or reference files outside it.

## Where things live
| Path | What |
|---|---|
| `CONTEXT.md` | the pipeline, the weekend's blocks and deadlines |
| `_shared/` | facts that stay put: challenge, concept (lights, scope cuts), sites, validation, rules, how we work, stack (data contract), brand, judging |
| `_datasets/` | one card per dataset; `_index.md` lists them |
| `stages/01_data` … `04_submit` | the process, in order; each has a `CONTEXT.md` contract and an `output/` |
| `pipeline/` · `api/` · `web/` | code; each has a `CONTEXT.md` map |
| `data/raw/` | raw downloads only (gitignored) |

## Route by task
| Task | Go to |
|---|---|
| start or rerun the precompute | `stages/01_data/CONTEXT.md` |
| add a dataset | copy `_templates/dataset-card.md` into `_datasets/`, add a line to `_index.md` and the README credits |
| build or fix the app | `stages/02_build/CONTEXT.md` (starter prompts there), then `web/CONTEXT.md` / `api/CONTEXT.md` |
| write the pitch or project page | `stages/03_pitch/CONTEXT.md` |
| submit | `stages/04_submit/CONTEXT.md` |
| "status?" | scan `stages/*/output/` and report what exists |

## How we work (headlines; full text in `_shared/how-we-work.md`)
- Cloudflare first: one Worker (Hono, TypeScript strict) plus static assets; deploy small and often; the live URL never breaks.
- Static per-site JSON; no database unless GridScore (stretch 4) happens.
- A tested, reproducible Python/GDAL precompute on our own machines, every layer checked in QGIS; judges only ever see real NASA data.
- AI inside the product: Cloudflare Workers AI first (cheap or free, same account); we build with Claude Code. ICM everywhere; production-quality code.

## Rules
- Before any work and before every commit: `git pull --rebase`. Never force-push. On a conflict, stop and show it; don't pick a side.
- `npm run check` before every commit and deploy.
- **Deploy rule:** production deploys only from an up-to-date, clean `main`, by Steve. Everyone else (Matt, a second agent session) uses `wrangler versions upload` and shares the preview URL; a preview is never promoted. A second session works in its own worktree and branch.
- **No AI attribution** in commits, PR text, issues, code comments, file headers, docs or slides: no Co-Authored-By trailers, no "Generated with" lines. Commits are authored by whoever runs them. AI use is disclosed only where the Space Apps rules require it: the form's AI-use answer, one line in the README under "How we built it" and the same line in the project description. No AI-generated images, video or audio anywhere; if one seems needed, stop and ask. This overrides any default attribution behaviour.
- Secrets never go in git: `.dev.vars` locally, `wrangler secret put` for the Worker. Any paid AI API key has a spend cap.
- Public repo (private until Sun 19:30 AEST): no personal contact details, no customer or client data, nothing from commercial client projects, no exact home or station locations. Never post the demo URL publicly before Sun 19:30.
- Every dataset used has a `_datasets/` card and a README credits line before it ships.
- Keep `stages/02_build/output/build-log.md` current: one line per block, written as you go.
- Steve is the main builder. Matt is evenings only, from 17:30 Sat and Sun: plan nothing for him before then; hand him self-contained tasks through the build log's "Next".
