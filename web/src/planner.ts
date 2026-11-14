// Slip Planner: rows = sites, columns = landing dates, cell = usable days in the mission window
// starting that day, coloured by the Power light and usable days. Site files load lazily, row by
// row. Clicking a cell opens the Sun-Path Chart for that site and window.
import { loadPlannerSummary, loadSite } from './data';
import { verdict, type Verdict } from './lights';
import { buildSummary, cellAt, type PlannerSummary } from './summary';
import type { SiteSummary } from './types';

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
  planned: Date;
  windowDays: number;
  onOpen: (siteId: string, date: string, windowDays: number) => void;
  /** The site's name was chosen: make it the selected site. */
  onSelect?: (siteId: string) => void;
  /** Called once every site has loaded, with each site's result for the planned date. */
  onAnswer?: (results: PlannedResult[]) => void;
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
}

/** The planner's answer in a sentence: which sites work for the planned landing. */
export function answerText(results: PlannedResult[], planned: Date, windowDays: number): string {
  const by = (v: Verdict): PlannedResult[] =>
    results
      .filter((r) => r.verdict === v)
      .sort((a, b) => b.usableDays - a.usableDays || a.name.localeCompare(b.name));
  const list = (rs: PlannedResult[]): string =>
    rs.map((r) => `${r.name} (${r.usableDays.toFixed(1)} usable days)`).join(', ');
  const green = by('green');
  const amber = by('amber');
  const when = `Landing ${short(planned)} ${planned.getUTCFullYear()}, ${windowDays}-day window`;
  const head =
    green.length === 0
      ? `${when}: no site works.`
      : `${when}: ${green.length} of ${results.length} sites work: ${list(green)}.`;
  const tail = [
    amber.length ? `Marginal: ${amber.map((r) => r.name).join(', ')}.` : '',
    `${by('red').length} without power.`,
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
  const dates = Array.from(
    { length: DAYS_BEFORE + DAYS_AFTER + 1 },
    (_, k) => new Date(planned.getTime() + (k - DAYS_BEFORE) * DAY_MS),
  );

  const head = document.createElement('thead');
  const hr = head.insertRow();
  const corner = document.createElement('th');
  corner.scope = 'col';
  corner.textContent = 'Site';
  hr.appendChild(corner);
  dates.forEach((d, k) => {
    const th = document.createElement('th');
    th.scope = 'col';
    const slip = k - DAYS_BEFORE;
    th.textContent = short(d);
    const sub = document.createElement('span');
    sub.className = 'slip';
    sub.textContent = slip === 0 ? 'planned' : `${slip > 0 ? '+' : ''}${slip} d`;
    th.appendChild(sub);
    if (slip === 0) th.className = 'planned';
    hr.appendChild(th);
  });

  const body = document.createElement('tbody');
  const plannedResults: PlannedResult[] = [];
  let pending = sites.length;
  const done = (): void => {
    pending--;
    if (pending === 0) o.onAnswer?.(plannedResults);
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
    if (s.approx) th.title = 'approximate: no 5 m terrain under this site';
    tr.appendChild(th);
    const cells = dates.map((_, k) => {
      const td = tr.insertCell();
      td.className = `pending${k === DAYS_BEFORE ? ' planned' : ''}`;
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
          if (k === DAYS_BEFORE) {
            plannedResults.push({
              id: s.id,
              name: s.name,
              verdict: c.verdict,
              usableDays: Number(c.text) || 0,
            });
          }
          td.className = `${c.verdict ?? 'none'}${k === DAYS_BEFORE ? ' planned' : ''}`;
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
