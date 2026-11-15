# Project page (Space Apps submission text)

_Draft written Sat 14 Nov from the build log. One section per form field, in the form's order and under its exact labels (2026 Project Submission Guide, checked Sun 15 Nov: eight fields, all text in English). Steve and Matt to edit; every number here is from `../../02_build/output/build-log.md` and should be re-checked against it before submitting._

## 1. Project Name
Four Lights

## 2. High-Level Project Summary
_Live form (read Sun 15 Nov, about 10:05): plain text box, 1,500 characters; "we suggest a 50-200 word summary". The text below is 197 words, 1,068 characters without the bold marks._

_The form asks: what did you develop, how does it address the challenge, why is it important?_

A launch slips three days. Which lunar south-pole landing site still works?

Near the Moon's south pole the Sun stays within a degree or two of the horizon, so a ridge 100 km away decides whether a lander has power, and a hill decides whether it can see Earth. Four Lights answers the planner's question with real terrain. For 12 candidate sites, and any point you add south of 80°S, it works out, hour by hour for 2028 and 2029, where the Sun and Earth sit against each site's skyline from NASA's LOLA elevation data, and reduces that to four lights: **Sun**, **Earth**, **Power** and **Comms**. The Slip Planner shows every site against every landing date as one number, usable days. Slide the date and watch sites go red and green.

In our demo, a landing planned for 19 April 2028 slips to 22 April. Six sites work on the 19th. After the slip, four of them lose power: Connecting Ridge, both de Gerlache sites and Peak near Cabeus B. Peak near Shackleton and Slater Plain still give 7.0 usable days. Shackleton rim, which did not work on the 19th, now does. A slip cuts both ways.

## 3. Link to Project Demo
_**Decided (Steve, Sun 15 Nov): the 7-slide deck.** One public link, no password, permission or registration; 7 slides at most including the title and intro slides, showing the team name, the members' names and the challenge chosen. Over the limit means no Global Judging. The link is the deck's own site (Steve, Sun 15 Nov), which must have its password off before judges open it; count its slides as a judge would, 7 at most._

https://pitch.gcsa.space

## 4. Link to Final Project
_The form takes **one** link. Proposed: the live demo, with the repository named in the first line of field 5. Steve and Matt to confirm._

https://fourlights.gcsa.space


## 5. Detailed Project Description
_The form asks: what does it do, how does it work, what benefits, what do you hope to achieve, what tools, languages, hardware or software? Images (JPG, PNG, GIF up to 10 MB) can be uploaded or pasted into this field; stills are in `../../02_build/output/media/`. The form has no separate field for disclosures, so they sit at the end of this one._

**Code and data:** https://github.com/gcspaceapps/fourlights (the live demo is the Final Project link above).

**Who it is for.** A mission planner whose launch date has moved and who has to re-pick a site or a date quickly. Educators and the public get the same data with a Guide beside it. The page has two views, Mission (terse, keyboard-driven) and Explore (the default). In Explore, a Guide panel sits beside the tools and follows the tab you are on: why the pole is different, how to read the chart, things to try, NASA photographs and a glossary, for newcomers and classrooms.

**What it does.**
- **Slip Planner.** Sites down the side, landing dates across, usable days in each cell: the hours in the mission window with the Sun up and a link to Earth, divided by 24. Green works, amber is marginal, red has no power. The stay can be 7, 14 or 30 days. One button slips the date a day, the plan stays pinned, and a sentence above the grid states what the slip cost.
- **Sun-Path Chart.** Stand at a site and look around: the 360° skyline from LOLA terrain, with the Sun's and Earth's paths over the mission window and a time slider. The four lights show the state at that moment, for an observer 1 m or 5 m above the ground.
- **Canberra Link.** The Comms light also needs one of the Deep Space Network's 70 m stations (Goldstone, Canberra or Madrid) to have the Moon at least 10° up, and names the station carrying the link.
- **Survive the Night.** A simple battery model through the mission window: does a given power system make it through the dark spells?
- **Pointing numbers.** The Sun's and Earth's azimuth and elevation at any hour, the terrain height in that direction and the clearance, with a CSV download of the whole mission window, for aiming solar panels and antennas.
- **3D map.** A Moon you can turn and zoom, opening over the south pole in our own LOLA hillshade, with NASA LRO imagery and LOLA elevation as the other layers and the 12 sites coloured for the landing shown.
- **Plain-English questions and site reviews.** A box where you can type "Launch slips 3 days from 19 April. Which sites still work?", and a short written summary of each site.
- **Share Project, and drive it from an AI assistant.** Name a project and get a link: everyone who opens it sees the same site, date, slip and window live. Each shared project also has an MCP address, so an AI assistant can read the project, rank sites from the published numbers and change what everyone sees.
- **Add your own site.** Add any point south of 80°S to a shared project, by coordinates or on the map, and press "Compute this site": in about two minutes it has its own real skyline, lights, chart and planner row, for everyone on the project, built by the same pipeline from the same NASA terrain as the 12 curated sites. The Worker starts our pipeline in a container on a Fly.io machine and stores the result; the same container runs on any machine with Docker or Podman.
- **Open in QGIS.** QGIS is free, open-source desktop mapping software (a geographic information system, or GIS) used by surveyors, scientists and planners around the world. The same sites, verdicts, skylines and terrain as map layers that QGIS reads straight from the site, with a ready-made project file. No map server and no database.

**How it works.** A Python pipeline reads NASA's LOLA elevation models, from 5 m per pixel at the site out to 240 m per pixel 650 km away, and for each site finds the highest terrain in each of 720 half-degree directions, in true 3D geometry on the Moon's sphere. It pulls the Sun's and Earth's positions for every hour of 2028 and 2029 from JPL Horizons. The results are small files, about half a megabyte per site. The browser compares the two and computes the lights, so the app is instant and runs from one Cloudflare Worker serving static files (shared projects add a Durable Object, and the larger QGIS rasters sit in R2). For a site you add, the Worker starts the same pipeline in a container on a hosted machine, which sends back that site's file about two minutes later; the heavy work never runs in the Worker.

**The four lights.**
- **Sun:** any part of the Sun's disc is above the terrain in its direction; partial sunlight counts in proportion.
- **Earth:** Earth's centre is above the terrain.
- **Power:** over the mission window, the share of the Sun in view averages at least 70%, and the Sun is never fully hidden for more than 48 hours.
- **Comms:** Earth's centre is at least 1° above the terrain, and a DSN station can see the Moon.

**How we know it is right.**
- The horizon calculation is checked against a second version written with different maths: identical results on eight directions across all six elevation models.
- Tests with known answers: a peak placed away from the pole appears at true north; a bare sphere gives the textbook horizon dip; a single-pixel spike between two directions is still seen; a smooth dome gives its analytic horizon.
- GRASS GIS finds the same peaks on the 5 m terrain, within about 0.1°.
- JPL Horizons and NAIF SPICE give the same Sun and Earth directions to a millionth of a degree, and the Moon's elevation from the three DSN stations to a thousandth.
- Against NASA Goddard's published values for Connecting Ridge (Barker et al. 2021, 2024 to 2026): our longest night falls within their range at both 1 m and 5 m above the ground (ours 13.5 to 21.2 days and 4.5 to 8.0 days across nine nearby points; theirs 13 to 22 and 4 to 8). Our average illumination is a few points higher than theirs (73.8 to 83.2% against 67 to 71% at 1 m), which is the expected direction: they report a deliberately cautious figure, the 1st percentile across 100 terrain variants, and we use the best-estimate terrain. We do not claim the illumination matches.

**Limits, stated plainly.**
- The Sun is a 0.53° disc, with the terrain taken as level across its width. Earth is taken at its centre, though it is about 1.9° wide from the Moon.
- Each site is one point, and at 1 m above the ground the result changes by several points between spots 20 m apart.
- Three sites (Nobile Rim 1, Nobile Rim 2, Peak near Cabeus B) have no 5 m terrain under them and are labelled approximate.
- The six Artemis-region sites are placed at the highest summit within 8 km of the region's centre, which is not necessarily where a mission would land.
- The battery presets are round illustrative numbers, not real vehicles.
- A site you add must be south of 80°S, where the terrain models reach. To keep the hosted machine from being overused, one site is computed at a time, a project can compute five, and the whole site a hundred a day.

**What we would do next.** A scored grid to find new sites, the 3D Moon lit from the real Sun direction, and the true skyline across the Sun's and Earth's discs.

**How we built it.** The repository is laid out so a coding agent can walk it: numbered stages with a contract and an output folder each, shared facts in one place, one card per dataset. We used AI coding tools (Claude) to help write the code, tests and data pipeline; the idea, the design decisions and the checking of results are ours. In the app, the short "Site review" paragraph for each site is written by a language model on Cloudflare Workers AI (Llama 3.3 70B) from numbers we computed, and is labelled as AI-written; every number in it is checked against those numbers. The "ask in plain English" box uses the same model only to turn a typed question into the planner's settings; it never produces the answer. There are no AI-generated images, video or audio in the project.

**Disclosures.**
- **Prepared before the start:** the plan, data contract and build prompts were written before the start, and raw NASA files were mirrored unmodified as an outage fallback; all code and data processing happened after 09:00 Sat 14 Nov 2026 (AEST).
- **Pre-existing work:** Ice Rover (https://icerover.refactor.red), a small educational game about why the lunar south pole is hard, built by Steve before the event. Same theme, separate codebase: no code or assets shared with this project, and it is not part of this entry.

## 6. Use of Super Intelligence (SI)
_On the live form this is only a tick-list of how AI was used, with no text box. Ticked (Steve, Sun 15 Nov): Research or Information Gathering; Building SI/ML Into the Project; Coding, Debugging, or Troubleshooting; Writing, Editing, or Translation; Presentation, Video, or Audio. The paragraph below has no field of its own, so it is also in field 5 under "How we built it" (added Sun 15 Nov), where judges can read it. The form asks: "Did you utilize any Super Intelligence (SI) tools and software in preparing your solution? If yes, how did you use them?" Judges do not see this answer; they see the acknowledgements in the project itself (field 5 and the README)._

Yes. We used AI coding tools (Claude) to help write the code, tests and data pipeline; the idea, the design decisions and the checking of results are ours. In the app, the short "Site review" paragraph for each site is written by a language model on Cloudflare Workers AI (Llama 3.3 70B) from numbers we computed, and is labelled as AI-written; every number in it is checked against those numbers. The "ask in plain English" box uses the same model only to turn a typed question into the planner's settings; it never produces the answer. There are no AI-generated images, video or audio in the project.

## 7. NASA Data
_Live form (read Sun 15 Nov, about 10:05): this field is not free text. It is a list of **Link Text + Link Url** pairs ("Add New Link"), so what each dataset is used for has to live in field 5 or on the app's sources page. Pairs to enter, in order:_

| Link Text | Link Url |
|---|---|
| LRO LOLA 5 m south-pole site elevation models (NASA GSFC PGDA) | https://pgda.gsfc.nasa.gov/products/78 |
| LRO LOLA 87°S 5 m elevation mosaic (NASA GSFC PGDA) | https://pgda.gsfc.nasa.gov/products/81 |
| LRO LOLA polar gridded elevation models, 20, 60 and 240 m (NASA PDS) | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/ |
| NASA Moon Trek: LRO WAC global mosaic and LOLA colour-shaded elevation | https://trek.nasa.gov/moon/ |
| JPL Horizons: Sun and Earth positions (NASA JPL) | https://ssd.jpl.nasa.gov/horizons/ |
| NAIF SPICE kernels: DE440s, Moon frames, DSN stations (NASA JPL) | https://naif.jpl.nasa.gov/ |
| Artemis III candidate landing regions (USGS, for NASA) | https://doi.org/10.5066/P1MEQ6UK |
| NASA Image and Video Library: nine photographs | https://images.nasa.gov |
| DSN Telecommunications Link Design Handbook 810-005, module 301 (NASA JPL) | https://deepspace.jpl.nasa.gov/dsndocs/810-005/301/301P.pdf |

_The same list in prose, for field 5 or the README:_
_The app has its own data-sources page with the same information in more depth: https://fourlights.gcsa.space/sources_

- **LRO LOLA south-pole elevation models** (NASA GSFC Planetary Geodesy Data Archive and PDS): the 5 m site models and the 87°S mosaic, https://pgda.gsfc.nasa.gov/products/78 and https://pgda.gsfc.nasa.gov/products/81 ; the polar gridded models at 20, 60 and 240 m, https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/ . Every horizon in the app comes from these.
- **LRO WAC global mosaic and LOLA colour-shaded elevation** (NASA GSFC / Arizona State University / MIT, via NASA Moon Trek), https://trek.nasa.gov/moon/ : the imagery and elevation layers on the 3D Moon.
- **JPL Horizons** (NASA JPL Solar System Dynamics), https://ssd.jpl.nasa.gov/horizons/ : the Sun's and Earth's direction from each site for every hour of 2028 and 2029, and the Moon's elevation from the DSN stations as a check.
- **NAIF SPICE kernels** (NASA JPL), https://naif.jpl.nasa.gov/ : an independent check on Horizons, and the DSN station positions for Canberra Link.
- **Artemis candidate landing regions** (USGS, for NASA), https://doi.org/10.5066/P1MEQ6UK : the centres of six of our sites.
- **NASA Image and Video Library**, https://images.nasa.gov : nine photographs. Surveyor 3 (AS12-48-7121), a VIPER rover prototype (GRC-2021-C-00493) and the Apollo 11 lunar module (AS11-40-5927) as examples of vehicle classes; the Clementine south-pole mosaic (PIA00001), Earth over the lunar horizon from Apollo 8 (AS08-14-2383), Deep Space Station 43 (PIA23797), the south pole from LRO's Wide Angle Camera (PIA13523), an artist's rendering of the Lunar Reconnaissance Orbiter (PIA18163) and Alan Bean fuelling Apollo 12's generator (AS12-46-6790) in the Guide.

## 8. Space Agency Partner Data and Other References
_Live form (read Sun 15 Nov, about 10:05): also **Link Text + Link Url** pairs, and optional. No Space Agency Partner data is used. Pairs to enter (every URL returned 200 on Sun 15 Nov):_

| Link Text | Link Url |
|---|---|
| Barker et al. (2021), Improved LOLA elevation maps for south pole landing sites, PSS 203, 105119 | https://doi.org/10.1016/j.pss.2020.105119 |
| Mazarico et al. (2011), Illumination conditions of the lunar polar regions using LOLA topography, Icarus 211 | https://doi.org/10.1016/j.icarus.2010.10.030 |
| Acton (1996), Ancillary data services of NASA's NAIF (SPICE), PSS 44 | https://doi.org/10.1016/0032-0633(95)00107-7 |
| GDAL | https://gdal.org/ |
| GRASS GIS | https://grass.osgeo.org/ |
| QGIS (free, open-source desktop mapping software) | https://qgis.org/ |
| three.js | https://threejs.org/ |
| Hono | https://hono.dev/ |
| Vite | https://vite.dev/ |
| Cloudflare Workers, Durable Objects, R2 and Workers AI | https://developers.cloudflare.com/workers/ |
| Fly.io (runs the pipeline container for added sites) | https://fly.io/ |
| Mermaid (diagrams on the how-we-built-it page) | https://mermaid.js.org/ |
| IBM Plex typefaces (SIL Open Font License 1.1) | https://www.ibm.com/plex/ |
| Phosphor Icons (MIT licence) | https://phosphoricons.com/ |
| Colaprete et al. (2010), Detection of water in the LCROSS ejecta plume, Science 330 (deck, slide 2) | https://doi.org/10.1126/science.1186986 |
| Photo: Patrick Stewart, 2019, by Gage Skidmore, CC BY-SA 2.0, cropped (deck, slide 7) | https://commons.wikimedia.org/wiki/File:Patrick_Stewart_(48445083306).jpg |
| Ice Rover (pre-existing work by Steve, not part of this entry) | https://icerover.refactor.red |

_The deck is the demo link, so its two extra credits (the LCROSS water-ice paper, which opens in a browser but refuses scripts with 403, and the slide-7 photo) are in the pairs above. The same references in prose:_
_One field on the form: partner data, then every resource and tool, including code, text and images._

No Space Agency Partner data is used; the data is from NASA and USGS (listed under NASA Data).

- Barker, M. K., et al. (2021). Improved LOLA elevation maps for south pole landing sites: error estimates and their impact on illumination conditions. Planetary and Space Science 203, 105119. https://doi.org/10.1016/j.pss.2020.105119
- Mazarico, E., et al. (2011). Illumination conditions of the lunar polar regions using LOLA topography. Icarus 211, 1066–1081. https://doi.org/10.1016/j.icarus.2010.10.030
- JPL Horizons On-Line Ephemeris System, NASA/JPL Solar System Dynamics. https://ssd.jpl.nasa.gov/horizons/
- Acton, C. H. (1996). Ancillary data services of NASA's Navigation and Ancillary Information Facility. Planetary and Space Science 44, 65–70. (SPICE)
- USGS Astrogeology (2024). Lunar Grid Reference System navigational grids for the Artemis III candidate landing regions. https://doi.org/10.5066/P1MEQ6UK
- DSN Telecommunications Link Design Handbook 810-005, module 301 (elevation limits). https://deepspace.jpl.nasa.gov/dsndocs/810-005/301/301P.pdf
- Software: GDAL, rasterio, pyproj, NumPy, spiceypy, GRASS GIS, QGIS, Hono, Vite, three.js, Cloudflare Workers, Durable Objects, R2 and Workers AI, Mermaid, and Fly.io for the hosted pipeline container. Typefaces: IBM Plex (SIL Open Font License 1.1). Icons: Phosphor Icons (MIT licence).
- Deck only: Colaprete, A., et al. (2010). Detection of water in the LCROSS ejecta plume. Science 330, 463–468. https://doi.org/10.1126/science.1186986 ; photograph of Patrick Stewart, 2019, by Gage Skidmore, CC BY-SA 2.0, cropped, https://commons.wikimedia.org/wiki/File:Patrick_Stewart_(48445083306).jpg
