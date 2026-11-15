---
description: Commit, push and deploy Four Lights to production, then check the live site
argument-hint: [optional commit message]
---

Commit, push and deploy this repo, following the rules in `AGENTS.md`. Stop and report at the first failure; never force anything.

1. **Branch.** Must be on `main`. If not, stop and say so (production deploys only from `main`).
2. **Look.** `git status --short`. Review what changed; do not stage secrets (`.dev.vars`, keys), raw data or stray scratch files. If something looks like it shouldn't be committed, stop and ask.
3. **Check.** `npm run check`. If it fails, show the failure and stop.
4. **Build log.** If the work isn't in `stages/02_build/output/build-log.md` yet, add one row (take the time from `TZ=Australia/Brisbane date +%H:%M`) and update Now / Next if they changed.
5. **Commit.** If there are changes: `git add -A` and commit. Message: `$ARGUMENTS` if given, otherwise a short one that says what changed and why. No AI attribution or Co-Authored-By lines. If there is nothing to commit, say so and carry on.
6. **Push.** `git pull --rebase`, then `git push`. On a conflict, stop and show it; don't pick a side.
7. **Deploy.** Confirm the tree is clean and `main` matches `origin/main`, then `npm run deploy` (runs the checks, refuses fixture data, builds, deploys with Wrangler).
8. **Verify the live site** at https://fourlights.gcsa.space (open since Sun 15 Nov; no credentials):
   - `/`, `/data/sites.json` and `/api/health` return 200, and `sites.json` has 12 sites.
9. **Report** in a few lines: the commit hash and message, whether anything was pushed, the deployed version ID, and the result of each live check.
