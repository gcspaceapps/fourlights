# Build log

## Now / Next / Blocked
- **Now:** S1 done (ahead of plan): data contract in `web/src/types.ts` + `stages/01_data/CONTEXT.md`; three fake sites served at `/data/...`
- **Next (Steve):** S2 horizon pipeline for Shackleton rim (10:30–13:00, hard stop 13:30), with M1 Sun-Path Chart UI in a second session in its own worktree. Prompts in `stages/02_build/CONTEXT.md`
- **Next (Matt, from 17:30):** read this log, start M2 (published numbers table, by 20:30); ~18:45 Stellarium view (or telescope if clear); 20:30 cold run of the demo from the README
- **Blocked:** none

## Log (AEST, one line per block)
| Time | Who | What changed | Blocked |
|---|---|---|---|
| 09:20 Sat | Steve + agent | Repo bootstrapped: ICM layout, licences, walking skeleton (Hono Worker + Vite page) deployed and answering `/api/health`; linters, type check and ruff on; commit-msg hook blocks AI attribution; weekend password gate on | none |
| 09:35 Sat | Steve + agent | S1: data contract as TS types and field docs; `npm run fake-data` writes fake-a/b/c (90 days hourly, 3 heights) with a built-in slip scenario (land 21 Jan 2028, 7-day window, 3-day slip: A stays green, B and C lose Power; C also loses Comms 25%); Vite copies them to dist, Worker serves `/data/...` | none |
