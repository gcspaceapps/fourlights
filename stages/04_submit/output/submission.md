# Submission: checklist and Sunday run sheet

_Prepared Sat 14 Nov. Text for every field is in `../../03_pitch/output/project-page.md`; copy from there, section by section. Tick each row as it is done on the Space Apps project page._

## Fields
| Field / check | Where the text is | Status |
|---|---|---|
| Project name | project-page.md, "Project name" | draft ready ☐ |
| High-level summary (form limit: 50 to 200 words) | "High-Level Project Summary" | draft ready, 198 words (Sun 15 Nov morning) ☐ |
| Project demo link (video ≤ 30 s or ≤ 7 slides), public, no login | pitch.md shot list; link goes in project-page.md | **the 7-slide deck at https://pitch.gcsa.space (Steve, Sun 15 Nov); the site's password came off at 17:08 Sun** ☐ |
| Final project link (live demo + repo) | "Final project" | ready once public ☐ |
| Project details | "Detailed Project Description" | draft ready; brought up to the shipped app Sun 15 Nov morning (pointing, 3D Moon, shared projects and MCP, QGIS) ☐ |
| NASA data used, every dataset linked | "NASA Data" (6 sources; Moon Trek added Sun 15 Nov morning) | draft ready ☐ |
| Space agency partner / other data | "Space agency partner and other data" | draft ready ☐ |
| AI-use question answered | "Use of Super Intelligence (SI)"; the form also has a dropdown of tools | draft ready ☐ |
| AI acknowledgement line in README and description | README "How we built it"; project-page "How we built it" | in place ☐ |
| Disclosures: prepared before the start, pre-existing work | "Disclosures" | in place ☐ |
| No likeness of anyone under 18 | the only person pictured is an Apollo 11 astronaut (NASA AS11-40-5927) | checked ☐ |
| Every link opens in a private window | list below | checked ☑ |
| **Submitted** (URL, time AEST) | team page, Project tab | **submitted for judging 21:19 Sun 15 Nov** (two confirmation emails from Space Apps) ☑ |

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
Checked by script on Sat 14 Nov and again Sun 15 Nov 10:05 (all returned 200 unless noted):
- https://fourlights.gcsa.space (after step 3)
- https://github.com/gcspaceapps/fourlights (after step 2)
- https://pgda.gsfc.nasa.gov/products/78 · https://pgda.gsfc.nasa.gov/products/81 · https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/
- https://ssd.jpl.nasa.gov/horizons/ · https://naif.jpl.nasa.gov/ · https://doi.org/10.5066/P1MEQ6UK · https://images.nasa.gov · https://trek.nasa.gov/moon/
- https://doi.org/10.1016/j.pss.2020.105119 · https://doi.org/10.1016/j.icarus.2010.10.030
- https://deepspace.jpl.nasa.gov/dsndocs/810-005/301/301P.pdf
- https://icerover.refactor.red (pre-existing work disclosure)
- https://www.spaceappschallenge.org/ and the challenge page: **could not be checked by script** (certificate error from the build machine); open them by hand.

## State on Sun 15 Nov, 20:50
- **Done:** the repo is public; the demo is open; the README has the live address; QGIS, MCP and computing a site were each checked on the live site this evening (build log).
- **Links checked without credentials, 20:48:** 39 links from the README, project-page.md and this file. 33 answer 200, as do the demo, the deck (https://pitch.gcsa.space), the repo and the SPICE paper's DOI when its whole address is used. Three could not be confirmed by script and want a look in a private window: https://www.spaceappschallenge.org/ and the challenge page (no answer to an automated client), and the LCROSS paper https://doi.org/10.1126/science.1186986 (403 to an automated client, usual for that publisher).
- **Left:** the private-window look at those three; the deck re-exported if slide 7 changed since 08:29; the form checked against project-page.md (the saved text is from 10:24 and predates computing a site, Fly.io and the nine photographs) and **submitted by 22:00**; the URL and time written in the table above.

## Result
- **Submitted for judging at 21:19 Sun 15 Nov.** We pitched in the 3:30pm session and **won the local Best Use of Tech prize**. Global Nominees are announced 3 Dec.

## State on Sun 15 Nov, 10:15 (form saved 10:14)
- **Form filled and saved, NOT submitted for judging (last saved 10:24 by the form's clock).** Saved text is public on the team page. Every field is in: name, summary, both links (demo https://pitch.gcsa.space, project https://fourlights.gcsa.space), details (with a one-sentence explanation of what QGIS is), five AI-use options (Research; Building it into the project; Coding; Writing; Presentation, the last two and Research confirmed by Steve), 9 NASA links, 12 other links, and both tick boxes (Steve). The form still reads "Project Requires Submission for Judging". Both links are still password-gated and the repo is private, so they must be opened before Submit for Judging is clicked.
- **"Save Progress" is public, not a private draft.** The live form's own tip says: "Your changes will now be viewable to anyone who visits your page." So nothing goes into the form until we are ready for other teams to read it, and the demo URL not before the gate comes off. The form was first opened and read at about 10:05 and closed with nothing typed or saved.
- **The live form's shape** (team page, Project tab, Edit): Project Name; Summary (plain text, 1,500 characters); Project Demonstration (one URL); Project (one URL); Project Details (rich text, images); Use of SI (a multi-select of options, no text box seen); NASA Data and Space Agency Partner & Other Data (each a list of Link Text + Link Url pairs); two tick boxes (Terms, All Work is Original); then Lock, Save Progress, Submit for Judging. The link pairs are laid out ready in project-page.md fields 7 and 8.
- Repo `gcspaceapps/fourlights`: still **private**. Demo: **open** since 17:08 Sun (`SITE_PASSWORD` deleted on Steve's word; 200 without credentials). README still has the `_URL added on Sunday evening_` placeholder. All three wait for step 2 to 4.
- The demo numbers on the project page (19 Apr 2028, slip 3 days: six work, four lose power, Peak near Shackleton and Slater Plain at 7.0, Shackleton rim comes good) match the build log's 13:01 Sat row; the Barker figures match its Results table.
- **Open, Steve decides:** (1) **decided Sun 15 Nov: the demo link is the 7-slide deck**, not a video (the deck PDF is 7 pages, exported 08:29 Sun; slide 7's text was edited after that, so re-export before uploading). Still open: where it is hosted publicly (pitch.gcsa.space is gated). Any recording or live run-through is for the 15:30 local pitch only; (2) judges see the page from the 15:30 pitch but the repo and demo open at 19:30: open both earlier, or submit first and resubmit at 19:30.
- The pitch repo's deck needs two more references on the form if it is the demo link (its `05_deliver/output/deliver.md`, "Extra references"): the LCROSS water-ice paper and the slide-7 photo credit.

## Sweep, Sun 15 Nov about 11:45
- **Two views, not three.** The app now has Mission and Explore, with the Guide panel in place of the Learn view. The project page text and the live form say so (form saved 11:39), and slide 7 of the deck is reworded.
- **Screenshots in Project Details.** Three current screenshots (Slip Planner after the slip, Sun-Path Chart, 3D map; 1600 px wide, with alt text) were inserted with the editor's Inline Image and saved at 11:44. They show in the editor but **not on the public view of the page**, so check again after Submit for Judging; if they still do not show, the page reads fine without them.
- **Stills retaken** from the app at `ab1c0ad` (list in `../../03_pitch/output/pitch.md`): `demo-1`, `demo-2`, `demo-3`, `view-mission.png` and the new `map-3d.png`.
- **Deck:** the planner screenshot is retaken (the app now marks the plan and highlights the slipped date itself, so the "yellow outline added" note is gone) and `deck.pdf` re-exported, still 7 pages. The pitch site has **not** been redeployed: run `site/deploy.sh` in the pitch repo.

## Before the repo goes public (audit, Sat 14 Nov)
Scanned every tracked file and the commit history.
- **Secrets:** none found. `.dev.vars` is ignored and was never committed. The Cloudflare `account_id` in `wrangler.jsonc` is an identifier, not a secret.
- **AI attribution in commits:** none (0 matches across the whole commit history).
- **Commit email: decided (Steve, Sat 14 Nov).** Every commit carries Steve's work email address as its author, and that is fine to be public. No history rewrite.
- **Machine name: decided (Steve, Sat 14 Nov).** The data manifest records the build machine's hostname. It means nothing to anyone else, so it stays.
- **Named on purpose:** the team's names (README), and Ice Rover's URL in the pre-existing-work disclosure.
- **Working notes that become public:** the build log says "Steve + agent" on each row, and `AGENTS.md` / `_shared/how-we-work.md` say the project is built with Claude Code. That matches the README's AI line; mentioned so it is a choice, not a surprise.
- **Images:** screenshots of our own app, three public-domain NASA photographs (credited), and a hillshade made from NASA data. No generated images, video or audio.
