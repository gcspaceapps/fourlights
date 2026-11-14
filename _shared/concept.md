# Concept: Four Lights

Working product name: **Four Lights** (final name picked at submission).

## Who it's for and the decision
- **Named user:** a mission planner whose launch has slipped and who has to re-pick a south-pole site or date fast.
- **The decision:** "Launch slipped 3 days. Which site still works?"
- Secondary: educators and the public, through the same sun-path view (the format solar installers use on Earth).

## The four lights (per site and time)
- **Sun:** the Sun's centre is above the terrain horizon at its azimuth (centre, not disc; a 0.53° disc is a stretch item).
- **Earth:** the Earth's centre is above the terrain horizon (Earth is ~1.9° wide from the Moon; we state the centre assumption).
- **Power:** over the mission window, the site is sunlit **≥ 70%** of the time **and** never dark longer than **48 h**. Both are named constants in one place in `web/`, set from the real results on Saturday evening (70% may be too strict).
- **Comms:** Earth's centre is at least **1°** above the terrain (a margin so it differs from the Earth light). With Canberra Link, a DSN station must also see the Moon at ≥ 10° elevation.

## Mission window and usable days
- **Mission window:** the stay on the surface, starting at the landing date. Default **7 days**; 14 and 30 selectable. Power and usable days are worked out over it. In the Sun-Path Chart, Sun, Earth and Comms follow the time slider; Power is for the window as a whole.
- **Usable days:** the hours in the mission window with the **Sun light and the Comms light both on**, divided by 24, to one decimal. Not based on Power (Power is a verdict on the whole window, so counting days by it would be circular).

## The demo moment (first 30 seconds)
"A crewed lander (Artemis IV, 2028), launch slips 3 days." The Slip Planner grid: some sites go red, one stays green. Click it: a 360° skyline from real LOLA terrain, the Sun skimming the ridge, Earth bobbing above it with libration, the Comms band showing the link. The real sites and dates are picked from the results on Saturday evening (written here when chosen).

Demo scenario (set in S6 from the real results, `python -m four_lights.scenario`): **planned landing 19 Apr 2028, 7-day window, launch slips 3 days to 22 Apr.** Connecting Ridge, de Gerlache rim and Peak near Cabeus B go from green to red; **Peak near Shackleton stays green**; Shackleton rim goes the other way and turns green. The slip cuts both ways, which is why a planner needs this. The survivor sits on a 5 m PGDA site tile, not an approximate site. Same pattern on 10 Mar 2029. The app opens on this scenario.

Power thresholds checked on the real data (S6): 7-day windows are nearly all-or-nothing (sunlit 10th/50th/75th percentile 0% / 74% / 100%), so 70% sunlit and 48 h longest dark sit in the gap and the two tests agree (52% vs 54% of site-windows pass). Kept as is.

## Minimum demo
12 curated south-pole sites (`sites.md`), a precomputed horizon profile per site, the **Sun-Path Chart** (one site, time slider, four lights) and the **Slip Planner** (sites × dates, one number: usable days). Comms = Earth ≥ 1° above the terrain horizon.

## Stretch goals, in order
1. **Canberra Link:** DSN station visibility in the Comms light. **Done Sat 14 Nov**: the Comms light needs Goldstone, Canberra or Madrid to have the Moon at least 10° up, and names the station carrying the link. At least one station qualifies 98.6% of 2028–29 (gaps of one hour at most), so it rarely changes a verdict; the demo scenario is unchanged
2. **Survive the Night:** battery state of charge from a panel/battery preset. **Done Sat 14 Nov**: a panel under the Sun-Path Chart simulates the battery hour by hour through the mission window from the Sun light (array runs the day load and charges with the surplus; the battery runs a survival load in the dark; starts full). Three presets with round, illustrative numbers (small lander, hibernating rover, crewed lander), labelled as not real vehicle specifications. It does not change the four lights or the planner
3. Custom coordinates (horizon computed live)
4. **GridScore:** weighted grid heat-map to find new sites
5. Moon photo comparison overlay
6. Plain-English query
7. **Site Review:** a one-paragraph AI write-up of a chosen site from our own numbers, on Claude, written ahead for the demo sites (no live call on stage)
8. **Ask the Navigator:** an MCP server plus Durable Objects so any AI chat drives the live page (covers 6)
9. **3D view (Matt's idea, three.js):** the terrain around a site, or the polar region with the 12 sites, as a 3D scene with the Sun and Earth directions. A later stretch; nothing depends on it. The data is ready for it: site points and DEM rings are in `data/derived/` (`make qgis`), the LOLA tiles in `data/raw/lola/`

Moon photo check (optional, Matt, Saturday evening): if a photo of the south polar limb is taken, raw timestamped images are published openly with a licence and a `_datasets/` card (GPS stripped from the EXIF), and compared with our prediction for that minute. If cloudy, a Stellarium view of the same time checks the Sun/Earth geometry (not the terrain shadows). Bonus only; nothing waits on it.

## Scope-cut order (cut from the top; at 20:00 Sat, if it doesn't work end to end, cut, no negotiating)
We expect to reach the stretch goals; this is the safety net, not the plan.
1. Stretch goals 2–8
2. Canberra Link (Comms = Earth ≥ 1° above the terrain only)
3. The 6 Artemis-only regions: keep the 6 PGDA sites (which include Malapert and Mons Mouton)
4. The outer far-field ring (state the horizon range as a limit)
5. Product date range down to 2028 only
6. Slip Planner shrinks to a plain sortable table
- **Never cut:** the Sun-Path Chart on real terrain for Shackleton rim, and the validation paragraph.
