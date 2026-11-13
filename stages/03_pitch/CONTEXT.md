# 03_pitch: tell the story judges score

One job: the pitch script, the demo (video ≤ 30 s or ≤ 7 slides) and the project page text.

## Inputs
Working (this run): `../02_build/output/build-log.md` (what works, the validation numbers), `../02_build/output/media/`, the live demo.
Reference (every run): `../../_shared/judging.md`, `../../_shared/concept.md` (the user, the decision, the demo moment), `../../_shared/rules.md` (disclosures), `../../_shared/brand.md`, `../../_datasets/_index.md`.
Do NOT load: `pipeline/`, `web/src/`, `api/`, `data/`.

## Process
1. Beats map to the five judging criteria: a named user, one decision, one number (usable days), one visual.
2. **The demo: a video of 30 seconds or less, or up to 7 slides including title and intro** (2026 Submission Guide; going over rules us out of global judging). The deck itself is built in a separate deck repo; `output/pitch.md` holds the script and links to it.
3. Every dataset cited with a link (from `../../_datasets/`).
4. `output/project-page.md` carries: the project description; the AI-use answer for the form, worded as the guide asks; the README's one-line AI acknowledgement repeated in the description; the pre-existing work disclosure; the "prepared before the start" line from the README.
5. Rehearse once with a timer before the optional judging session (Sun 15 Nov, from 15:30 AEST, over Zoom).

## Outputs
`output/pitch.md` (script, demo link, rehearsal time), `output/project-page.md` (every Submission Guide field's text).

## Human check
Matt reads the pitch, demo and project page on Sunday evening and sends comments by 19:30 AEST.
