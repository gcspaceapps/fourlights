# Build log

## Now / Next / Blocked
- **Now:** S2 well ahead of plan: the horizon engine works on real LOLA data for Shackleton rim (skyline: `media/skyline-shackleton-rim.png`); final checks running
- **Next (Steve):** finish S2 (log the checks), then S3 ephemeris pull; M1 Sun-Path Chart UI in a second session in its own worktree. Prompts in `stages/02_build/CONTEXT.md`
- **Next (Matt, from 17:30):** read this log, start M2 (published numbers table, by 20:30); ~18:45 Stellarium view (or telescope if clear); 20:30 cold run of the demo from the README
- **Blocked:** none

## Log (AEST, one line per block)
| Time | Who | What changed | Blocked |
|---|---|---|---|
| 09:20 Sat | Steve + agent | Repo bootstrapped: ICM layout, licences, walking skeleton (Hono Worker + Vite page) deployed and answering `/api/health`; linters, type check and ruff on; commit-msg hook blocks AI attribution; weekend password gate on | none |
| 09:35 Sat | Steve + agent | S1: data contract as TS types and field docs; `npm run fake-data` writes fake-a/b/c (90 days hourly, 3 heights) with a built-in slip scenario (land 21 Jan 2028, 7-day window, 3-day slip: A stays green, B and C lose Power; C also loses Comms 25%); Vite copies them to dist, Worker serves `/data/...` | none |
| 09:58 Sat | Steve + agent | S2 progress: horizon engine (3D ENU frame, true azimuth, max over each 0.5° sector, finest-DEM ring hand-off, bilinear near field). Shackleton rim real run: 79 s, 1.5 GB; rings 5 m tile → 87S 5 m (20 km) → 20 m (60 km) → 60 m (150 km) → 240 m (653 km); DEM rings agree to a median of ±0.06 m. Horizon −2.5° to +1.0° (one far ridge at ~31° above level), so a well-lit site, as published. Brute-force check: engine matches an independent pyproj/spherical-trig version to 0.0000° on 8 sectors × 6 rings. GRASS r.horizon (tile only): same 14 sectors above 0°, peak 27.0° vs ours 27.5°, GRASS ~0.1° higher (no lunar curvature: expected). Gotchas found: PDS heights are DN×0.5 (GDAL's offset gives radius); r.horizon's `-c` output is already true azimuth | none |
