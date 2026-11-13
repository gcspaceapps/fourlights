# Pipeline

| Stage | Job | Inputs | Output | Human check | Deadline (AEST) |
|---|---|---|---|---|---|
| `01_data` | NASA terrain + ephemerides → per-site JSON | `data/raw/`, `$NASA_CACHE`, `_shared/stack.md`, `_shared/sites.md` | `web/public/data/`, `stages/01_data/output/data-manifest.md` | the other person reruns `make` on another machine; looks at a skyline plot and a QGIS layer | all 12 sites by 16:00 Sat |
| `02_build` | the app end to end on real data, deployed | `web/`, `api/`, `web/public/data/` | the live demo, `stages/02_build/output/build-log.md`, `media/` | Matt runs the demo cold from the README | **20:00 Sat: demo works end to end** |
| `03_pitch` | pitch, demo (≤ 30 s video or ≤ 7 slides), project page | build log, media, `_shared/judging.md` | `stages/03_pitch/output/pitch.md`, `project-page.md` | Matt's comments | 19:30 Sun (comments) |
| `04_submit` | every field in, on time | project page, pitch | `stages/04_submit/output/submission.md` | the other person checks the submitted page in a private window | **22:00 Sun: submitted** (official close 11:59pm) |

## Saturday 14 Nov
| Time | Owner | Block | Done when |
|---|---|---|---|
| 09:00–10:00 | Steve | **B0:** bootstrap this repo | repo created (private), skeleton live, first build-log line |
| 10:00–10:30 | Steve | **S1:** data contract + fake data (three fake sites × 90 days hourly) | both UIs can be built against it |
| 10:30–13:00 | Steve | **S2:** horizon pipeline, Shackleton rim first. **Hard stop 13:30**; if late, the GRASS cross-check goes first | unit tests pass; skyline looks right; brute-force check agrees |
| 10:30–13:00 | Steve (second session, own worktree) | **M1:** Sun-Path Chart UI on the fake JSON; previews only | renders the fake data on a preview URL; merged and deployed by Steve |
| 13:00–14:00 | Steve | **S3:** ephemeris pull (product, validation, Moon photo window) | raw files cached, manifest written; Earth-azimuth check passes |
| 13:00–16:00 | Steve (second session) | **S5a:** Slip Planner on the fake data, once M1 is merged | works on a preview URL; merged |
| 14:00–16:00 | Steve | **S4:** all 12 sites, in the background | `sites.json` + one JSON per site + validation files |
| ~16:00 | Steve (second session) | Pitch deck repo skeleton (separate repo) | deck repo exists |
| 16:00–18:00 | Steve | **S5b:** Slip Planner on real data (mostly slack for S2/S4 overruns) | works on real data |
| 17:30–18:30 | Matt | Catch up from the build log; start M2 | knows what's next |
| 18:00–20:00 | Steve | **S6:** end to end on real data, deployed | **20:00: demo works end to end** |
| ~18:45–19:30 | Matt (optional) | Stellarium view of the Moon at 09:00 UTC (cloudy), or a telescope shot if clear | bonus only |
| 19:30–20:30 | Matt | **M2:** published numbers (Barker 2021, Mazarico 2011, NASA illumination maps) in a table | table in the build log **by 20:30** |
| 20:00–22:00 | Steve | **S7:** validation vs Barker 2021, written up honestly | one paragraph in the build log |
| 20:30–21:00 | Matt | **Cold run** of the demo from the README on his own laptop | what broke, in the build log's "Next" |
| 21:00 on | Matt | Review and polish the Sun-Path Chart (previews only) | — |

**At 20:00, if it doesn't work end to end, apply the scope-cut order in `_shared/concept.md`. No negotiating.**

## Sunday 15 Nov
| Time | Owner | Block |
|---|---|---|
| 08:00–11:00 | Steve | **C1: Canberra Link** (stretch 1), only if Saturday ended green |
| 11:00–13:00 | Steve | Polish the demo moment; screenshots + screen recording; README credits for every dataset |
| 13:00–14:30 | Steve | Pitch script, the demo (video ≤ 30 s or ≤ 7 slides), project page draft; rehearse once with a timer |
| 15:30–17:00 | Steve | Optional judging session over Zoom, from 15:30 |
| 17:00–21:00 | Steve | Fix what the panel raised; finish the project page and disclosures |
| 17:30–19:30 | Matt | Read the pitch, demo and project page; **comments to Steve by 19:30** |
| 19:30 | Steve | **Make this repo public**, then move the demo to our own domain |
| 19:30–21:00 | Matt | Run the demo cold again; check disclosures and that every link opens in a private window |
| **by 22:00** | Steve | **Submit.** Record the URL and time |
