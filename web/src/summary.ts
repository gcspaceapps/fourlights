// The planner's precomputed summary: for every site, mission window and landing day, the same
// figures the planner would compute from the site file. Built by scripts/build-planner-summary.mjs
// with THESE functions and the rules in lights.ts, so the summary and the live maths can't differ;
// a test recomputes it and fails if the published file is stale.
// (Explicit .ts extensions so Node can run this file directly.)
import {
  DEFAULT_HEIGHT_M,
  WINDOW_DAYS,
  profileFor,
  verdict,
  windowSummary,
  type Verdict,
} from './lights.ts';
import type { SiteData } from './types.ts';

const VERDICT_CODES = { green: 'g', amber: 'a', red: 'r' } as const;
const CODE_VERDICTS: Record<string, Verdict> = { g: 'green', a: 'amber', r: 'red' };
const DAY_MS = 86_400_000;

/** One site and window: an entry per landing day, from the first day of the data. */
export interface SiteWindowSummary {
  /** Usable days x 10. */
  u: number[];
  /** Average share of the Sun in view, percent. */
  s: number[];
  /** Longest fully dark spell, hours. */
  d: number[];
  /** Verdict per day: g, a or r. */
  v: string;
}

export interface PlannerSummary {
  height_m: number;
  start_utc: string;
  /** windows[days][siteId] */
  windows: Record<string, Record<string, SiteWindowSummary>>;
}

export function summariseSite(site: SiteData, windowDays: number): SiteWindowSummary {
  const profile = profileFor(site, DEFAULT_HEIGHT_M);
  const perDay = (24 * 60) / site.times.step_min;
  const hours = windowDays * perDay;
  const out: SiteWindowSummary = { u: [], s: [], d: [], v: '' };
  for (let start = 0; start + hours <= site.times.n; start += perDay) {
    const w = windowSummary(site, profile, start, hours);
    out.u.push(Math.round(w.usableDays * 10));
    out.s.push(Math.round(w.sunlitFraction * 100));
    out.d.push(w.longestDarkHours);
    out.v += VERDICT_CODES[verdict(w.power, w.usableDays, windowDays)];
  }
  return out;
}

export function buildSummary(sites: SiteData[]): PlannerSummary {
  const first = sites[0];
  if (!first) throw new Error('no sites');
  const windows: PlannerSummary['windows'] = {};
  for (const days of WINDOW_DAYS) {
    const bySite: Record<string, SiteWindowSummary> = {};
    for (const site of sites) bySite[site.id] = summariseSite(site, days);
    windows[String(days)] = bySite;
  }
  return { height_m: DEFAULT_HEIGHT_M, start_utc: first.times.start_utc, windows };
}

export interface SummaryCell {
  usableDays: number;
  sunlitPct: number;
  longestDarkHours: number;
  verdict: Verdict;
}

/** The cell for a site, landing date and window; null outside the data range. */
export function cellAt(
  summary: PlannerSummary,
  siteId: string,
  start: Date,
  windowDays: number,
): SummaryCell | null {
  const row = summary.windows[String(windowDays)]?.[siteId];
  if (!row) return null;
  const k = Math.round((start.getTime() - Date.parse(summary.start_utc)) / DAY_MS);
  const u = row.u[k];
  const s = row.s[k];
  const d = row.d[k];
  const v = CODE_VERDICTS[row.v[k] ?? ''];
  if (k < 0 || u === undefined || s === undefined || d === undefined || !v) return null;
  return { usableDays: u / 10, sunlitPct: s, longestDarkHours: d, verdict: v };
}
