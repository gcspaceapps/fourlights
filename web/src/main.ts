import './style.css';
import { PRESETS, darkEnduranceHours, renderBattery, simulateBattery } from './battery';
import { renderChart } from './chart';
import { renderPlanner } from './planner';
import { loadSite, loadSites } from './data';
import {
  COMMS_MARGIN_DEG,
  DEFAULT_HEIGHT_M,
  POWER_MAX_DARK_HOURS,
  POWER_MIN_SUNLIT_FRACTION,
  WINDOW_DAYS,
  indexAt,
  lightsAt,
  profileFor,
  timeAt,
  windowSummary,
  type InstantLights,
} from './lights';
import { at, type SiteData, type SiteSummary } from './types';

function $(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e;
}

const ui = {
  site: $('site') as HTMLSelectElement,
  date: $('date') as HTMLInputElement,
  days: $('days') as HTMLSelectElement,
  height: $('height') as HTMLSelectElement,
  centre: $('centre') as HTMLSelectElement,
  time: $('time') as HTMLInputElement,
  timeLabel: $('time-label') as HTMLOutputElement,
  chart: $('chart') as unknown as SVGSVGElement,
  lights: $('lights'),
  window: $('window'),
  info: $('site-info'),
  preset: $('preset') as HTMLSelectElement,
  battery: $('battery') as unknown as SVGSVGElement,
  batterySummary: $('battery-summary'),
  plan: $('plan') as HTMLInputElement,
  planDays: $('plan-days') as HTMLSelectElement,
  slipBack: $('slip-back') as HTMLButtonElement,
  slipOn: $('slip-on') as HTMLButtonElement,
  planner: $('planner') as HTMLTableElement,
  chartSection: $('chart-title'),
};

/** The demo scenario (_shared/concept.md): planned landing, the slip, and the site that survives. */
const DEFAULT_PLAN = '2028-04-19';
const DEMO_SLIP_DAYS = 3;
const DEMO_SITE = 'peak-near-shackleton';

let sites: SiteSummary[] = [];
let current: SiteData | null = null;

const ymd = (d: Date): string => d.toISOString().slice(0, 10);
const fmtTime = (d: Date): string => `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;

/** URL hash holds the view, so a Slip Planner cell (or a judge) can link straight to it. */
function readHash(): URLSearchParams {
  return new URLSearchParams(location.hash.slice(1));
}

function writeHash(): void {
  const p = new URLSearchParams({
    site: ui.site.value,
    date: ui.date.value,
    days: ui.days.value,
    h: ui.height.value,
    c: ui.centre.value,
    t: ui.time.value,
    ps: ui.preset.value,
    plan: ui.plan.value,
    pdays: ui.planDays.value,
  });
  history.replaceState(null, '', `#${p.toString()}`);
}

function light(name: string, on: boolean, detail: string): HTMLLIElement {
  const li = document.createElement('li');
  li.className = on ? 'on' : 'off';
  li.dataset.light = name.toLowerCase();
  for (const [cls, text] of [
    ['name', name],
    ['state', on ? 'on' : 'off'],
    ['detail', detail],
  ] as const) {
    const span = document.createElement('span');
    span.className = cls;
    span.textContent = text;
    li.appendChild(span);
  }
  return li;
}

const STATION_LABELS = { goldstone: 'Goldstone', canberra: 'Canberra', madrid: 'Madrid' } as const;

function commsDetail(now: InstantLights): string {
  if (!now.earthClearForComms) return `Earth is not ${COMMS_MARGIN_DEG}° above the terrain`;
  if (now.stations === null) return `Earth at least ${COMMS_MARGIN_DEG}° above the terrain`;
  if (now.stations.length === 0) return 'Earth is clear, but no DSN station sees the Moon';
  return `Earth clear by ${COMMS_MARGIN_DEG}°+; link via ${now.stations.map((s) => STATION_LABELS[s]).join(', ')} (DSN)`;
}

function render(): void {
  const site = current;
  if (!site) return;
  const profile = profileFor(site, Number(ui.height.value));
  const days = Number(ui.days.value);
  const start = indexAt(site, new Date(`${ui.date.value}T00:00:00Z`));
  const hours = Math.min(days * 24, site.times.n - start);
  ui.time.max = String(Math.max(0, hours - 1));
  if (Number(ui.time.value) > hours - 1) ui.time.value = String(hours - 1);
  const cursor = start + Number(ui.time.value);

  renderChart(ui.chart, {
    site,
    profile,
    start,
    end: start + hours,
    cursor,
    centreAz: Number(ui.centre.value),
  });

  const t = timeAt(site, cursor);
  ui.timeLabel.textContent = `${fmtTime(t)} (day ${Math.floor(Number(ui.time.value) / 24) + 1} of ${days})`;

  const now = lightsAt(site, profile, cursor);
  const w = windowSummary(site, profile, start, hours);
  const sunEl = at(site.sun.el, cursor).toFixed(2);
  const earthEl = at(site.earth.el, cursor).toFixed(2);
  ui.lights.replaceChildren(
    light('Sun', now.sun, `Sun's centre ${sunEl}° up, ${now.sun ? 'above' : 'below'} the terrain`),
    light(
      'Earth',
      now.earth,
      `Earth's centre ${earthEl}° up, ${now.earth ? 'above' : 'below'} the terrain`,
    ),
    light(
      'Power',
      w.power,
      `whole window: sunlit ${(w.sunlitFraction * 100).toFixed(0)}% (need ${POWER_MIN_SUNLIT_FRACTION * 100}%), longest dark ${w.longestDarkHours} h (max ${POWER_MAX_DARK_HOURS} h)`,
    ),
    light('Comms', now.comms, commsDetail(now)),
  );
  ui.window.textContent = `Usable days in this ${days}-day window (Sun and Comms both on): ${w.usableDays.toFixed(1)}`;

  const preset = PRESETS.find((p) => p.id === ui.preset.value) ?? PRESETS[0];
  if (preset) {
    const run = simulateBattery(site, profile, start, hours, preset);
    renderBattery(ui.battery, run, cursor - start);
    const spec = `${preset.name}: ${preset.arrayW} W array, ${preset.dayLoadW} W by day, ${preset.darkLoadW} W in the dark, ${preset.batteryWh / 1000} kWh battery (${darkEnduranceHours(preset).toFixed(0)} h of darkness from full).`;
    const flatAt = run.firstFlat >= 0 ? fmtTime(timeAt(site, start + run.firstFlat)) : '';
    ui.batterySummary.textContent = run.survives
      ? `Survives: battery never below ${(run.minSoc * 100).toFixed(0)}%. ${spec}`
      : `Does not survive: battery flat for ${run.flatHours} h, first at ${flatAt}. ${spec}`;
    ui.batterySummary.className = `window ${run.survives ? 'ok' : 'bad'}`;
  }

  const s = sites.find((x) => x.id === site.id);
  const rows: [string, string][] = [
    [
      'Position',
      `${site.site.lat.toFixed(3)}°, ${site.site.lon_e.toFixed(3)}°E, ground ${site.site.elev_m.toFixed(0)} m`,
    ],
    ['Site point', s?.point_rule ?? ''],
    [
      'Source',
      `${s?.source ?? ''}${s?.approx ? ' (approximate: no 5 m terrain under this site)' : ''}`,
    ],
    [
      'Terrain (DEM rings)',
      site.meta.dem_rings.map((r) => `${r.source} (${r.res_m} m, to ${r.max_km} km)`).join('; '),
    ],
    ['Sun and Earth', `${site.meta.ephem}, frame ${site.meta.frame}`],
  ];
  ui.info.replaceChildren(
    ...rows.flatMap(([k, v]) => {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      return [dt, dd];
    }),
  );
  writeHash();
}

async function selectSite(id: string): Promise<void> {
  current = await loadSite(id);
  const first = timeAt(current, 0);
  const last = timeAt(current, current.times.n - 1);
  ui.date.min = ymd(first);
  ui.date.max = ymd(last);
  if (!ui.date.value || ui.date.value < ui.date.min || ui.date.value > ui.date.max) {
    ui.date.value = ui.date.min;
  }
  const heights = current.horizons.map((h) => h.height_m);
  const keep = Number(ui.height.value) || DEFAULT_HEIGHT_M;
  ui.height.replaceChildren(
    ...heights.map((h) => new Option(`${h} m`, String(h), false, h === keep)),
  );
  render();
}

function drawPlanner(): void {
  renderPlanner({
    table: ui.planner,
    sites,
    planned: new Date(`${ui.plan.value || DEFAULT_PLAN}T00:00:00Z`),
    windowDays: Number(ui.planDays.value),
    onOpen: (siteId, date, days) => {
      ui.site.value = siteId;
      ui.date.value = date;
      ui.days.value = String(days);
      ui.time.value = '0';
      void selectSite(siteId).then(() => {
        ui.chartSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        ui.site.focus({ preventScroll: true });
      });
    },
  });
  writeHash();
}

function slip(days: number): void {
  const d = new Date(`${ui.plan.value || DEFAULT_PLAN}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  ui.plan.value = ymd(d);
  drawPlanner();
}

async function init(): Promise<void> {
  sites = await loadSites();
  const hash = readHash();
  ui.site.replaceChildren(
    ...sites.map(
      (s) => new Option(s.id.startsWith('fake-') ? `${s.name} [fixture]` : s.name, s.id),
    ),
  );
  ui.days.replaceChildren(...WINDOW_DAYS.map((d) => new Option(`${d} days`, String(d))));
  ui.planDays.replaceChildren(...WINDOW_DAYS.map((d) => new Option(`${d} days`, String(d))));
  ui.plan.value = hash.get('plan') ?? DEFAULT_PLAN;
  ui.planDays.value = hash.get('pdays') ?? String(WINDOW_DAYS[0]);
  const demoSite = sites.some((x) => x.id === DEMO_SITE) ? DEMO_SITE : (sites[0]?.id ?? '');
  ui.site.value = hash.get('site') ?? demoSite;
  const slipped = new Date(`${DEFAULT_PLAN}T00:00:00Z`);
  slipped.setUTCDate(slipped.getUTCDate() + DEMO_SLIP_DAYS);
  ui.date.value = hash.get('date') ?? ymd(slipped);
  ui.days.value = hash.get('days') ?? String(WINDOW_DAYS[0]);
  ui.centre.value = hash.get('c') ?? '0';
  ui.time.value = hash.get('t') ?? '0';
  if (hash.get('h')) ui.height.replaceChildren(new Option('', hash.get('h') ?? ''));

  ui.site.addEventListener('change', () => void selectSite(ui.site.value));
  ui.preset.replaceChildren(...PRESETS.map((p) => new Option(p.name, p.id)));
  ui.preset.value = hash.get('ps') ?? PRESETS[0]?.id ?? '';
  for (const e of [ui.date, ui.days, ui.height, ui.centre, ui.preset]) {
    e.addEventListener('change', render);
  }
  ui.time.addEventListener('input', render);
  for (const e of [ui.plan, ui.planDays]) e.addEventListener('change', drawPlanner);
  ui.slipBack.addEventListener('click', () => slip(-1));
  ui.slipOn.addEventListener('click', () => slip(1));
  drawPlanner();
  await selectSite(ui.site.value);
  // On a phone the panorama scrolls: start with the chosen centre azimuth in view.
  const scroller = ui.chart.parentElement;
  if (scroller) scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2;
}

async function showHealth(): Promise<void> {
  const out = document.getElementById('health');
  if (!out) return;
  try {
    const res = await fetch('/api/health');
    const body = (await res.json()) as { ok: boolean };
    out.textContent = body.ok ? 'ok' : 'not ok';
  } catch {
    out.textContent = 'unreachable';
  }
}

/**
 * Dark/light switch. Until it is touched it follows the device (and changes with it); once
 * slid, the choice is remembered in this browser only.
 */
function setupTheme(): void {
  const btn = document.getElementById('theme');
  if (!btn) return;
  const root = document.documentElement;
  const deviceDark = window.matchMedia('(prefers-color-scheme: dark)');
  let saved: string | null = null;
  try {
    saved = localStorage.getItem('theme');
  } catch {
    // storage blocked: follow the device
  }
  const isDark = (): boolean =>
    root.dataset.theme ? root.dataset.theme === 'dark' : deviceDark.matches;
  const show = (): void => btn.setAttribute('aria-checked', String(isDark()));
  if (saved === 'dark' || saved === 'light') root.dataset.theme = saved;
  show();
  deviceDark.addEventListener('change', show);
  btn.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    root.dataset.theme = next;
    show();
    try {
      localStorage.setItem('theme', next);
    } catch {
      // storage blocked: the choice lasts for this page only
    }
  });
}

setupTheme();
void showHealth();
init().catch((e: unknown) => {
  ui.lights.textContent = `Could not load the site data: ${String(e)}`;
});
