// Slip Planner: rows = sites, columns = landing dates, cell = usable days in the mission window
// starting that day, coloured by the Power light and usable days. Site files load lazily, row by
// row. Clicking a cell opens the Sun-Path Chart for that site and window.
//
// Two dates matter: the PLANNED landing (the plan, which stays put) and the LANDING now shown
// (the plan plus the slip). The columns hang off the planned date, so a slip moves the highlight
// along the row instead of moving the row, and the answer says what the slip cost.
import { loadPlannerSummary, loadSite } from './data';
import { verdict, type Verdict } from './lights';
import { buildSummary, cellAt, type PlannerSummary } from './summary';
import type { SiteSummary } from './types';

/** Shown in a row name and the answer for a site with no 5 m terrain model under it. */
export const APPROX_TAG = 'approx. terrain';
export const APPROX_TITLE =
  'Approximate: no 5 m terrain model under this site, so its skyline starts from coarser data';

/** Landing dates shown: this many days before the planned date... */
export const DAYS_BEFORE = 2;
/** ...and this many after it. */
export const DAYS_AFTER = 11;

const WORDS: Record<Verdict, string> = {
  green: 'works',
  amber: 'marginal',
  red: 'no power',
};
const SYMBOLS: Record<Verdict, string> = { green: '●', amber: '▲', red: '✕' };

export interface PlannerOptions {
  table: HTMLTableElement;
  sites: SiteSummary[];
  /** The planned landing: the plan, before any slip. */
  planned: Date;
  /** Days the landing now shown is after (or, negative, before) the planned one. */
  slipDays?: number;
  windowDays: number;
  onOpen: (siteId: string, date: string, windowDays: number) => void;
  /** Where the reason for the cell under the pointer or the keyboard focus is written. */
  why?: HTMLElement | null;
  /** The site's name was chosen: make it the selected site. */
  onSelect?: (siteId: string) => void;
  /**
   * Called once every site has loaded, with each site's result for the landing now shown and,
   * when that is a slip, for the planned landing too.
   */
  onAnswer?: (results: PlannedResult[], planned: PlannedResult[] | null) => void;
}

const DAY_MS = 86_400_000;
const ymd = (d: Date): string => d.toISOString().slice(0, 10);
const short = (d: Date): string =>
  d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' });

interface Cell {
  text: string;
  label: string;
  verdict: Verdict | null;
}

/** One planner cell from the precomputed summary (or one computed on the fly). */
function cellFor(summary: PlannerSummary, siteId: string, start: Date, windowDays: number): Cell {
  const c = cellAt(summary, siteId, start, windowDays);
  if (!c) return { text: '–', label: 'outside the data range', verdict: null };
  return {
    text: c.usableDays.toFixed(1),
    label: `${c.usableDays.toFixed(1)} usable days, ${WORDS[c.verdict]}; sunlit ${c.sunlitPct}%, longest dark ${c.longestDarkHours} h`,
    verdict: c.verdict,
  };
}

export interface PlannedResult {
  id: string;
  name: string;
  verdict: Verdict | null;
  usableDays: number;
  /** No 5 m terrain model under the site. */
  approx?: boolean;
}

/** What the answer is compared against when the landing has slipped. */
export interface SlipFrom {
  planned: Date;
  slipDays: number;
  results: PlannedResult[];
}

const days = (n: number): string => `${Math.abs(n)} day${Math.abs(n) === 1 ? '' : 's'}`;
const named = (r: PlannedResult): string => (r.approx ? `${r.name} (${APPROX_TAG})` : r.name);

/** What a slip cost: the sites that worked on the planned date against those that work now. */
export function slipText(now: PlannedResult[], from: SlipFrom): string {
  const works = (rs: PlannedResult[]): Set<string> =>
    new Set(rs.filter((r) => r.verdict === 'green').map((r) => r.id));
  const before = works(from.results);
  const after = works(now);
  const names = (ids: string[], rs: PlannedResult[]): string =>
    ids
      .map((id) => named(rs.find((r) => r.id === id) ?? ({ id, name: id } as PlannedResult)))
      .join(', ');
  const lost = [...before].filter((id) => !after.has(id));
  const gained = [...after].filter((id) => !before.has(id));
  const kept = [...after].filter((id) => before.has(id));
  const how = from.slipDays > 0 ? `${days(from.slipDays)} later` : `${days(from.slipDays)} earlier`;
  const parts = [
    lost.length ? `lost ${lost.length} (${names(lost, from.results)})` : 'lost none',
    gained.length ? `gained ${gained.length} (${names(gained, now)})` : '',
    `${kept.length} still work${kept.length === 1 ? 's' : ''}`,
  ].filter(Boolean);
  return `Against the planned ${short(from.planned)} (${how}; ${before.size} worked then): ${parts.join(', ')}.`;
}

/**
 * The planner's answer in a sentence: which sites work for the landing shown and, when that
 * landing is a slip from the plan (`from`), what the slip cost.
 */
export function answerText(
  results: PlannedResult[],
  landing: Date,
  windowDays: number,
  from?: SlipFrom | null,
): string {
  const by = (v: Verdict): PlannedResult[] =>
    results
      .filter((r) => r.verdict === v)
      .sort((a, b) => b.usableDays - a.usableDays || a.name.localeCompare(b.name));
  const list = (rs: PlannedResult[]): string =>
    rs.map((r) => `${named(r)} (${r.usableDays.toFixed(1)} usable days)`).join(', ');
  const green = by('green');
  const amber = by('amber');
  const when = `Landing ${short(landing)} ${landing.getUTCFullYear()}, ${windowDays}-day window`;
  // When nothing passes, the least bad site is still worth naming.
  const best = [...results].sort(
    (a, b) => b.usableDays - a.usableDays || a.name.localeCompare(b.name),
  )[0];
  const closest =
    best && best.verdict
      ? ` The most usable time is at ${named(best)}: ${best.usableDays.toFixed(1)} usable days, but ${WORDS[best.verdict]}.`
      : '';
  const head =
    green.length === 0
      ? `${when}: no site works.${amber.length ? '' : closest}`
      : `${when}: ${green.length} of ${results.length} sites work: ${list(green)}.`;
  const tail = [
    amber.length ? `Marginal: ${amber.map(named).join(', ')}.` : '',
    `${by('red').length} without power.`,
    from && from.slipDays !== 0 ? slipText(results, from) : '',
  ];
  return [head, ...tail].filter(Boolean).join(' ');
}

/**
 * The summary covering a site: the published planner.json if it has the site, otherwise one
 * computed in the browser from that site's own file (slower: about half a megabyte per site).
 */
async function summaryFor(siteId: string): Promise<PlannerSummary> {
  const published = await loadPlannerSummary();
  if (published && Object.values(published.windows).every((w) => siteId in w)) return published;
  return buildSummary([await loadSite(siteId)]);
}

export function renderPlanner(o: PlannerOptions): void {
  const { table, sites, planned, windowDays } = o;
  const slipDays = o.slipDays ?? 0;
  // Columns hang off the planned date and stretch to take in the landing if it slips far.
  const first = Math.min(-DAYS_BEFORE, slipDays);
  const last = Math.max(DAYS_AFTER, slipDays);
  const offsets = Array.from({ length: last - first + 1 }, (_, k) => first + k);
  const dates = offsets.map((n) => new Date(planned.getTime() + n * DAY_MS));
  /** Column of the planned landing, and of the landing now shown (the same until it slips). */
  const kPlanned = offsets.indexOf(0);
  const kLanding = offsets.indexOf(slipDays);
  const marks = (k: number): string =>
    `${k === kLanding ? ' landing' : ''}${k === kPlanned ? ' planned' : ''}`;

  const head = document.createElement('thead');
  const hr = head.insertRow();
  const corner = document.createElement('th');
  corner.scope = 'col';
  corner.textContent = 'Site';
  hr.appendChild(corner);
  dates.forEach((d, k) => {
    const th = document.createElement('th');
    th.scope = 'col';
    const n = offsets[k] ?? 0;
    th.textContent = short(d);
    const sub = document.createElement('span');
    sub.className = 'slip';
    const off = `${n > 0 ? '+' : ''}${n} d`;
    sub.textContent = n === 0 ? 'planned' : k === kLanding ? `now ${off}` : off;
    th.appendChild(sub);
    th.className = marks(k).trim();
    hr.appendChild(th);
  });

  const body = document.createElement('tbody');
  const landingResults: PlannedResult[] = [];
  const plannedResults: PlannedResult[] = [];
  let pending = sites.length;
  const done = (): void => {
    pending--;
    if (pending === 0) o.onAnswer?.(landingResults, slipDays === 0 ? null : plannedResults);
  };
  for (const s of sites) {
    const tr = body.insertRow();
    tr.dataset.site = s.id;
    const th = document.createElement('th');
    th.scope = 'row';
    const label = s.id.startsWith('fake-')
      ? `${s.name} [fixture]`
      : s.user
        ? `${s.name} (yours)`
        : s.name;
    if (o.onSelect) {
      const pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'row-select';
      pick.textContent = label;
      pick.title = 'Select this site';
      pick.addEventListener('click', () => o.onSelect?.(s.id));
      th.appendChild(pick);
    } else th.textContent = label;
    if (s.approx) {
      const tag = document.createElement('span');
      tag.className = 'approx';
      tag.textContent = APPROX_TAG;
      tag.title = APPROX_TITLE;
      th.append(' ', tag);
    }
    tr.appendChild(th);
    const cells = dates.map((_, k) => {
      const td = tr.insertCell();
      td.className = `pending${marks(k)}`;
      td.textContent = '…';
      return td;
    });
    if (s.user) {
      // Added by the visitor: no data yet, so nothing to fetch. If it is published later it
      // arrives through sites.json like any other site.
      tr.classList.add('user');
      for (const td of cells) {
        td.className = 'none';
        td.textContent = '–';
        td.title = 'No data yet for this site';
      }
      done();
      continue;
    }
    void summaryFor(s.id).then(
      (summary) => {
        dates.forEach((d, k) => {
          const td = cells[k];
          if (!td) return;
          const c = cellFor(summary, s.id, d, windowDays);
          const result: PlannedResult = {
            id: s.id,
            name: s.name,
            verdict: c.verdict,
            usableDays: Number(c.text) || 0,
            approx: s.approx,
          };
          if (k === kLanding) landingResults.push(result);
          if (k === kPlanned) plannedResults.push(result);
          td.className = `${c.verdict ?? 'none'}${marks(k)}`;
          td.replaceChildren();
          if (!c.verdict) {
            td.textContent = c.text;
            td.title = c.label;
            return;
          }
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = `${SYMBOLS[c.verdict]} ${c.text}`;
          b.setAttribute('aria-label', `${s.name}, landing ${ymd(d)}: ${c.label}. Open the chart.`);
          b.title = c.label;
          b.addEventListener('click', () => o.onOpen(s.id, ymd(d), windowDays));
          // The same words as the tooltip, where a keyboard or touch user can see them.
          const say = (): void => {
            if (o.why) o.why.textContent = `${s.name}, landing ${short(d)}: ${c.label}.`;
          };
          b.addEventListener('focus', say);
          b.addEventListener('pointerenter', say);
          td.appendChild(b);
        });
        done();
      },
      () => {
        for (const td of cells) td.textContent = '!';
        done();
      },
    );
  }
  table.replaceChildren(head, body);
}

export { verdict, type Verdict };
