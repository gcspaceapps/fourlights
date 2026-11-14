# Pitch

_Draft written Sat 14 Nov from the build log and the live demo. The deck, final talk script, video and Q&A are made in the pitch repo (https://github.com/gcspaceapps/fourlights-pitch); this file holds the script they start from. Steve and Matt to edit and rehearse._

## Demo (video ≤ 30 s or ≤ 7 slides)
- Format: _video or slides: to decide_
- Public link: _…_

### 30-second video: shot list (screen recording of the live app, recorded by hand)
| Time | On screen | Words (voice or caption) |
|---|---|---|
| 0–4 s | Title over the south-pole map, 12 sites marked | "A crewed lander for the Moon's south pole. The launch slips three days." |
| 4–11 s | Slip Planner, planned 19 Apr 2028: six sites green. Press `]` three times (or **Slip + 1 day**) | "Which landing sites still work?" |
| 11–16 s | Four rows turn red; Peak near Shackleton and Slater Plain stay green at 7.0; the answer sentence updates | "Four of the six lose power. Two still give seven usable days." |
| 16–25 s | Click the green cell: the Sun-Path Chart. Drag the time slider: the Sun skims the ridge line, Earth rides above it, the four lights hold | "Because this is the real skyline, from NASA's laser altimeter: every ridge out to 650 kilometres." |
| 25–30 s | The four lights, then the name and URL | "Four Lights. Sun, Earth, power, comms: for any site, any date." |

Ready-made stills, if slides are used instead: `../../02_build/output/media/demo-1-planned-19apr.png`, `demo-2-slipped-22apr.png`, `demo-3-chart-peak-near-shackleton.png`, `site-map.png`, `survive-the-night.png`, `ask-plain-english.png`.

### 7 slides, if not a video
1. Title: Four Lights. "Which lunar south-pole landing site still works when your launch slips?"
2. The problem: near the pole the Sun stays within a degree or two of the horizon; one distant ridge decides power, one hill decides comms. (Sun-Path Chart still.)
3. The planner, before: 19 April 2028, six sites work.
4. The planner, after a 3-day slip: four go red, two stay green, one turns green.
5. Why: the real 360° skyline from LOLA, Sun and Earth paths, four lights.
6. How we know it is right: two independent calculations agree exactly; Horizons and SPICE agree; longest night matches NASA Goddard's published range.
7. NASA data used, the team, the link.

## Script (3 minutes, Gold Coast session)
**The user and the decision (25 s).** "You're planning a crewed landing at the Moon's south pole. The launch slips three days. Does your site still work? Near the pole the Sun stays within a degree or two of the horizon, so the answer depends on a ridge that might be a hundred kilometres away. A smooth-sphere model can't tell you. You need the real skyline."

**The demo moment (60 s).** "This is the Slip Planner. Twelve candidate sites, every landing date, one number: usable days, the time with sunlight and a link to Earth. We planned for 19 April 2028: six sites are green. Now slip three days." _Press `]` three times._ "Connecting Ridge, both de Gerlache sites and Peak near Cabeus B have lost power. Peak near Shackleton and Slater Plain still give seven usable days. And Shackleton rim, which didn't work on the 19th, now does. The slip cuts both ways." _Click a green cell._ "Here's why. This is the view from that site: the skyline in every direction from NASA's LOLA laser altimeter, the Sun's path in gold, Earth's in blue. Drag the time: the Sun skims that ridge and stays above it all week."

**The four lights and the extras (35 s).** "Four lights sum it up: Sun, Earth, Power, Comms. Comms also checks that Goldstone, Canberra or Madrid can see the Moon, and tells you which one carries the link. Below that, a battery model shows whether a lander survives the dark spells. You can also just ask it: 'Launch slips three days from 19 April, which sites still work?'"

**Validity (40 s).** "Is it right? We computed every horizon twice with different maths, and the two agree exactly. NASA's Horizons service and the SPICE toolkit give the same Sun and Earth positions to a millionth of a degree. And against NASA Goddard's published study of Connecting Ridge, our longest night falls inside their range at both observer heights. Our average sunlight comes out a few points higher than theirs, and we say so on the page: they publish a deliberately cautious figure, and we use the best-estimate terrain."

**Close (20 s).** "Every number comes from open NASA data: LOLA terrain, JPL Horizons, the SPICE kernels, the Artemis candidate regions. The code and the data files are open. Four Lights: for any site and any date, does it still work?"

## Likely questions
- **Why these 12 sites?** Six are the sites NASA Goddard published 5 m terrain for; six more are Artemis candidate regions from the USGS grids.
- **How far out does the terrain go?** To the edge of the 240 m polar model, about 650 km. Using 60 m terrain all the way out changed Connecting Ridge's horizon by less than 0.01°.
- **Why is your illumination higher than Barker's?** Theirs is the 1st percentile of 100 terrain variants, averaged over a small region. Ours is one point on the best-estimate terrain, and at 1 m it varies by 9 points between spots 20 m apart.
- **Sun as a point?** No: a 0.53° disc, and partial sunlight counts in proportion. The terrain is taken as level across the disc. Earth is still taken at its centre.
- **What does the AI do?** It writes the short site summaries from our numbers, each number checked, and it turns typed questions into planner settings. It never computes an answer.
- **What would you do with another week?** Any coordinate, not just 12 sites; a scored grid to find new sites; a 3D view of the terrain under the real Sun.

## Rehearsal
- Timed run: _date, time, length_
