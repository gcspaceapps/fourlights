# Submission: checklist and Sunday run sheet

_Prepared Sat 14 Nov. Text for every field is in `../../03_pitch/output/project-page.md`; copy from there, section by section. Tick each row as it is done on the Space Apps project page._

## Fields
| Field / check | Where the text is | Status |
|---|---|---|
| Project name | project-page.md, "Project name" | draft ready ☐ |
| High-level summary | "High-level summary" | draft ready ☐ |
| Project demo link (video ≤ 30 s or ≤ 7 slides), public, no login | pitch.md shot list; link goes in project-page.md | **to record (Steve)** ☐ |
| Final project link (live demo + repo) | "Final project" | ready once public ☐ |
| Project details | "Project details" | draft ready ☐ |
| NASA data used, every dataset linked | "Use of NASA data" (5 sources) | draft ready ☐ |
| Space agency partner / other data | "Space agency partner and other data" | draft ready ☐ |
| AI-use question answered | "Use of AI"; reword to the form's exact prompt | draft ready ☐ |
| AI acknowledgement line in README and description | README "How we built it"; project-page "How we built it" | in place ☐ |
| Disclosures: prepared before the start, pre-existing work | "Disclosures" | in place ☐ |
| No likeness of anyone under 18 | the only person pictured is an Apollo 11 astronaut (NASA AS11-40-5927) | checked ☐ |
| Every link opens in a private window | list below | ☐ |
| **Submitted** (URL, time AEST) | | ☐ |

## Sunday run sheet (AEST)
1. **By 19:00:** the demo video is recorded and uploaded somewhere public with no login; its link is in project-page.md and pitch.md. Matt's comments are in.
2. **19:30, make the repo public** (Steve):
   `gh repo edit gcspaceapps/fourlights --visibility public --accept-visibility-change-consequences`
   Read "Before the repo goes public" below first.
3. **Open the demo** (removes the password; takes effect in seconds, no redeploy):
   `npx wrangler secret delete SITE_PASSWORD`
   Then check: `curl -s -o /dev/null -w "%{http_code}\n" https://fourlights.gcsa.space/` prints `200`.
4. **README:** replace `_URL added on Sunday evening_` with `https://fourlights.gcsa.space`, then `/cpd`. (After the password is gone, `/cpd`'s 401 check no longer applies: expect 200 without credentials.)
5. **Private-window link check** (the person who did not write the page): the demo, the video or deck, the repo, and each link under "Use of NASA data" and "References".
6. **Fill the form** from project-page.md, top to bottom. Tick the rows above.
7. **Submit by 22:00.** Record the URL and time here. Official close is 11:59pm Queensland time.
8. If the Space Apps site is down: screenshot the error with the time, tell the organisers, keep retrying.

## Links to open in a private window
Checked by script on Sat 14 Nov (all returned 200 unless noted):
- https://fourlights.gcsa.space (after step 3)
- https://github.com/gcspaceapps/fourlights (after step 2)
- https://pgda.gsfc.nasa.gov/products/78 · https://pgda.gsfc.nasa.gov/products/81 · https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/
- https://ssd.jpl.nasa.gov/horizons/ · https://naif.jpl.nasa.gov/ · https://doi.org/10.5066/P1MEQ6UK · https://images.nasa.gov
- https://doi.org/10.1016/j.pss.2020.105119 · https://doi.org/10.1016/j.icarus.2010.10.030
- https://deepspace.jpl.nasa.gov/dsndocs/810-005/301/301P.pdf
- https://icerover.refactor.red (pre-existing work disclosure)
- https://www.spaceappschallenge.org/ and the challenge page: **could not be checked by script** (certificate error from the build machine); open them by hand.

## Before the repo goes public (audit, Sat 14 Nov)
Scanned every tracked file and the commit history.
- **Secrets:** none found. `.dev.vars` is ignored and was never committed. The Cloudflare `account_id` in `wrangler.jsonc` is an identifier, not a secret.
- **AI attribution in commits:** none (0 matches in 60+ commit messages).
- **Decision for Steve, commit email:** every commit carries Steve's work email address as its author. Git history is public once the repo is. Changing it means rewriting history and a force-push, which the project rules forbid, so this can't be fixed quietly: either accept it, or decide on a rewrite before 19:30. For later commits, GitHub's no-reply address avoids it.
- **Decision for Steve, machine name:** `stages/01_data/output/data-manifest.md` records the build machine's hostname in about 150 rows. Harmless, but it is a detail of a personal machine; it can be replaced with "Steve's laptop" in one edit if wanted.
- **Named on purpose:** the team's names (README), and Ice Rover's URL in the pre-existing-work disclosure.
- **Working notes that become public:** the build log says "Steve + agent" on each row, and `AGENTS.md` / `_shared/how-we-work.md` say the project is built with Claude Code. That matches the README's AI line; mentioned so it is a choice, not a surprise.
- **Images:** screenshots of our own app, three public-domain NASA photographs (credited), and a hillshade made from NASA data. No generated images, video or audio.
