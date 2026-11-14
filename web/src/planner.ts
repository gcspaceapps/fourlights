// Slip Planner: rows = sites, columns = landing dates, cell = usable days in the mission window
// starting that day, coloured by the Power light and usable days. Site files load lazily, row by
// row. Clicking a cell opens the Sun-Path Chart for that site and window.
import { loadSite } from './data';
import { DEFAULT_HEIGHT_M, indexAt, profileFor, windowSummary } from './lights';
import type { SiteData, SiteSummary } from './types';

/** Green needs Power on and at least this fraction of the window usable. */
export const GREEN_MIN_USABLE_FRACTION = 0.5;
/** Landing dates shown: this many days before the planned date... */
export const DAYS_BEFORE = 2;
/** ...and this many after it. */
export const DAYS_AFTER = 11;

export type Verdict = 'green' | 'amber' | 'red';

export function verdict(power: boolean, usableDays: number, windowDays: number): Verdict {
  if (!power) return 'red';
  return usableDays >= GREEN_MIN_USABLE_FRACTION * windowDays ? 'green' : 'amber';
}

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
  /** Called once every site has loaded, with each site's result for the planned date. */
  onAnswer?: (results: PlannedResult[]) => void;
}

const DAY_MS = 86_400_000;
const ymd = (d: Date): string => d.toISOString().slice(0, 10);
const short = (d: Date): string =>
  d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function cellFor(
  site: SiteData,
  start: Date,
  windowDays: number,
): { text: string; label: string; verdict: Verdict | null } {
  const first = Date.parse(site.times.start_utc);
  const lastStart = first + (site.times.n - windowDays * 24) * site.times.step_min * 60_000;
  if (start.getTime() < first || start.getTime() > lastStart) {
    return { text: '–', label: 'outside the data range', verdict: null };
  }
  const profile = profileFor(site, DEFAULT_HEIGHT_M);
  const w = windowSummary(site, profile, indexAt(site, start), windowDays * 24);
  const v = verdict(w.power, w.usableDays, windowDays);
  return {
    text: w.usableDays.toFixed(1),
    label: `${w.usableDays.toFixed(1)} usable days, ${WORDS[v]}; sunlit ${(w.sunlitFraction * 100).toFixed(0)}%, longest dark ${w.longestDarkHours} h`,
    verdict: v,
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
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = s.id.startsWith('fake-') ? `${s.name} [fixture]` : s.name;
    if (s.approx) th.title = 'approximate: no 5 m terrain under this site';
    tr.appendChild(th);
    const cells = dates.map((_, k) => {
      const td = tr.insertCell();
      td.className = `pending${k === DAYS_BEFORE ? ' planned' : ''}`;
      td.textContent = '…';
      return td;
    });
    void loadSite(s.id).then(
      (site) => {
        dates.forEach((d, k) => {
          const td = cells[k];
          if (!td) return;
          const c = cellFor(site, d, windowDays);
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
