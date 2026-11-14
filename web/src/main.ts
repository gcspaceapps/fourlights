import './style.css';
import {
  PRESETS,
  darkEnduranceHours,
  renderBattery,
  simulateBattery,
  type PowerPreset,
} from './battery';
import { renderChart } from './chart';
import { infoTip, lightIcon, upgradeInfoTips, type LightName } from './icons';
import { renderMap } from './map';
import { answerText, renderPlanner } from './planner';
import { loadReviews, loadSite, loadSites } from './data';
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
import { key, setupShortcuts, type Shortcut } from './shortcuts';
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
  review: $('review'),
  reviewText: $('review-text'),
  reviewNote: $('review-note'),
  preset: $('preset') as HTMLSelectElement,
  customise: $('customise') as HTMLDetailsElement,
  presetImg: $('preset-img') as HTMLImageElement,
  presetCap: $('preset-cap'),
  presetCredit: $('preset-credit'),
  pArray: $('p-array') as HTMLInputElement,
  pDay: $('p-day') as HTMLInputElement,
  pDark: $('p-dark') as HTMLInputElement,
  pBatt: $('p-batt') as HTMLInputElement,
  pReset: $('p-reset') as HTMLButtonElement,
  battery: $('battery') as unknown as SVGSVGElement,
  batterySummary: $('battery-summary'),
  plan: $('plan') as HTMLInputElement,
  planDays: $('plan-days') as HTMLSelectElement,
  slipBack: $('slip-back') as HTMLButtonElement,
  slipOn: $('slip-on') as HTMLButtonElement,
  planner: $('planner') as HTMLTableElement,
  answer: $('answer'),
  mapDetails: $('map-details') as HTMLDetailsElement,
  theme: $('theme'),
  ask: $('ask') as HTMLFormElement,
  askQ: $('ask-q') as HTMLInputElement,
  askNote: $('ask-note'),
  map: $('map') as unknown as SVGSVGElement,
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
    pw: [ui.pArray.value, ui.pDay.value, ui.pDark.value, ui.pBatt.value].join('_'),
    plan: ui.plan.value,
    v: document.documentElement.dataset.view ?? 'explore',
    pdays: ui.planDays.value,
  });
  history.replaceState(null, '', `#${p.toString()}`);
}

/** Where each light comes from, shown in its info tip. */
const LIGHT_SOURCES: Record<LightName, string> = {
  sun: "The Sun's position (NASA JPL Horizons, hourly) against the highest terrain in its direction (our horizon from NASA LOLA elevation models). The Sun is a 0.53° disc; the light is on when any of it shows, and partial sunlight counts in proportion. The terrain is taken as level across the disc's width.",
  earth:
    "Earth's centre (NASA JPL Horizons, hourly) against the highest terrain in its direction (our horizon from NASA LOLA elevation models).",
  power: `Our definition, for the whole mission window: the share of the Sun's disc in view averages at least ${POWER_MIN_SUNLIT_FRACTION * 100}%, and the Sun is never fully hidden for more than ${POWER_MAX_DARK_HOURS} hours. The thresholds are ours, checked against 8,688 real site-windows; they are not a NASA requirement.`,
  comms: `Earth's centre at least ${COMMS_MARGIN_DEG}° above the terrain (our margin), and a Deep Space Network 70 m station with the Moon at least 10° up (the DSN's transmit limit, handbook 810-005; station positions from NASA NAIF).`,
};

function light(name: string, on: boolean, detail: string): HTMLLIElement {
  const key = name.toLowerCase() as LightName;
  const li = document.createElement('li');
  li.className = on ? 'on' : 'off';
  li.dataset.light = key;
  li.appendChild(lightIcon(key, on));
  const head = document.createElement('span');
  head.className = 'name';
  head.textContent = name;
  head.appendChild(infoTip(LIGHT_SOURCES[key]));
  const state = document.createElement('span');
  state.className = 'state';
  state.textContent = on ? 'on' : 'off';
  const more = document.createElement('span');
  more.className = 'detail';
  more.textContent = detail;
  li.append(head, state, more);
  return li;
}

const STATION_LABELS = { goldstone: 'Goldstone', canberra: 'Canberra', madrid: 'Madrid' } as const;

function commsDetail(now: InstantLights): string {
  if (!now.earthClearForComms) return `Earth is not ${COMMS_MARGIN_DEG}° above the terrain`;
  if (now.stations === null) return `Earth at least ${COMMS_MARGIN_DEG}° above the terrain`;
  if (now.stations.length === 0) return 'Earth is clear, but no DSN station sees the Moon';
  return `Earth clear by ${COMMS_MARGIN_DEG}°+; link via ${now.stations.map((s) => STATION_LABELS[s]).join(', ')} (DSN)`;
}

/** Fill the adjust-the-power-system inputs from a preset. */
function fillPowerInputs(p: PowerPreset): void {
  ui.pArray.value = String(p.arrayW);
  ui.pDay.value = String(p.dayLoadW);
  ui.pDark.value = String(p.darkLoadW);
  ui.pBatt.value = String(p.batteryWh / 1000);
}

/** The chosen preset, with any adjusted values; named "Custom" once it differs. */
function currentPowerSystem(): PowerPreset | undefined {
  const base = PRESETS.find((p) => p.id === ui.preset.value) ?? PRESETS[0];
  if (!base) return undefined;
  const num = (el: HTMLInputElement, fallback: number, min: number): number => {
    const v = Number(el.value);
    return el.value !== '' && Number.isFinite(v) && v >= min ? v : fallback;
  };
  const p: PowerPreset = {
    ...base,
    arrayW: num(ui.pArray, base.arrayW, 0),
    dayLoadW: num(ui.pDay, base.dayLoadW, 0),
    darkLoadW: num(ui.pDark, base.darkLoadW, 1),
    batteryWh: num(ui.pBatt, base.batteryWh / 1000, 0.1) * 1000,
  };
  const changed =
    p.arrayW !== base.arrayW ||
    p.dayLoadW !== base.dayLoadW ||
    p.darkLoadW !== base.darkLoadW ||
    p.batteryWh !== base.batteryWh;
  return changed ? { ...p, id: 'custom', name: `Custom (from ${base.name})` } : p;
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
    light(
      'Sun',
      now.sun,
      now.sunFraction >= 1
        ? `whole disc above the terrain (centre ${sunEl}° up)`
        : now.sun
          ? `${(now.sunFraction * 100).toFixed(0)}% of the disc above the terrain (centre ${sunEl}° up)`
          : `hidden behind the terrain (centre ${sunEl}° up)`,
    ),
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
  ui.window.textContent = `Usable days in this ${days}-day window (sunlight with a link to Earth): ${w.usableDays.toFixed(1)}`;
  ui.window.appendChild(
    infoTip(
      'Our measure: the hours in the mission window with the Comms light on, each counted by the share of the Sun in view (half the disc showing counts as half an hour), divided by 24.',
    ),
  );

  const preset = currentPowerSystem();
  if (preset) {
    if (!ui.presetImg.src.endsWith(preset.photo.src)) ui.presetImg.src = preset.photo.src;
    ui.presetImg.alt = preset.photo.alt;
    ui.presetCap.textContent = preset.photo.caption;
    ui.presetCredit.textContent = ` Photo: ${preset.photo.credit}.`;
    const run = simulateBattery(site, profile, start, hours, preset);
    renderBattery(ui.battery, run, cursor - start);
    const spec = `${preset.name}: ${preset.arrayW} W array, ${preset.dayLoadW} W by day, ${preset.darkLoadW} W in the dark, ${preset.batteryWh / 1000} kWh battery (${darkEnduranceHours(preset).toFixed(0)} h of darkness from full).`;
    const flatAt = run.firstFlat >= 0 ? fmtTime(timeAt(site, start + run.firstFlat)) : '';
    const head = run.survives
      ? `Survives: battery never below ${(run.minSoc * 100).toFixed(0)}%.`
      : `Does not survive: battery flat for ${run.flatHours} h, first at ${flatAt}.`;
    const detail = document.createElement('span');
    detail.className = 'detail';
    detail.textContent = spec;
    ui.batterySummary.replaceChildren(head, detail);
    ui.batterySummary.className = `window ${run.survives ? 'ok' : 'bad'}`;
  }

  const s = sites.find((x) => x.id === site.id);
  void loadReviews().then((r) => {
    if (current?.id !== site.id) return;
    const review = r?.sites[site.id];
    ui.review.hidden = !review;
    if (!r || !review) return;
    ui.reviewText.textContent = review.text;
    ui.reviewNote.textContent = `Site review: AI-written (${r.provider}, ${r.model.split('/').pop() ?? r.model}) on ${r.generated_utc.slice(0, 10)} from this site's computed numbers for a 2 m observer; every number is checked against them.`;
  });
  const all = windowSummary(site, profile, 0, site.times.n);
  let earthUp = 0;
  let commsOn = 0;
  for (let i = 0; i < site.times.n; i++) {
    const l = lightsAt(site, profile, i);
    if (l.earth) earthUp++;
    if (l.comms) commsOn++;
  }
  const pct = (x: number): string => `${((x / site.times.n) * 100).toFixed(0)}%`;
  const span = `${ymd(timeAt(site, 0))} to ${ymd(timeAt(site, site.times.n - 1))}`;
  const rows: [string, string][] = [
    [
      `Whole period, ${profile.height_m} m`,
      `${span}: sunlit ${(all.sunlitFraction * 100).toFixed(0)}% of the time, longest night ${(all.longestDarkHours / 24).toFixed(1)} days, Earth above the terrain ${pct(earthUp)}, Comms ${pct(commsOn)}`,
    ],
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

/** Show a site and landing date in the Sun-Path Chart (from a planner cell or a map marker). */
function openChart(siteId: string, date: string, days: number): void {
  ui.site.value = siteId;
  ui.date.value = date;
  ui.days.value = String(days);
  ui.time.value = '0';
  void selectSite(siteId).then(() => {
    ui.chartSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    ui.site.focus({ preventScroll: true });
  });
}

function drawPlanner(): void {
  renderPlanner({
    table: ui.planner,
    sites,
    planned: new Date(`${ui.plan.value || DEFAULT_PLAN}T00:00:00Z`),
    windowDays: Number(ui.planDays.value),
    onAnswer: (results) => {
      const planned = new Date(`${ui.plan.value || DEFAULT_PLAN}T00:00:00Z`);
      ui.answer.textContent = answerText(results, planned, Number(ui.planDays.value));
      renderMap(ui.map, sites, results, (siteId) =>
        openChart(siteId, ui.plan.value || DEFAULT_PLAN, Number(ui.planDays.value)),
      );
    },
    onOpen: openChart,
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
  const basePreset = (): PowerPreset | undefined =>
    PRESETS.find((p) => p.id === ui.preset.value) ?? PRESETS[0];
  const first = basePreset();
  if (first) fillPowerInputs(first);
  // Adjusted values from a shared link: array_day_dark_battery.
  const pw = (hash.get('pw') ?? '').split('_');
  if (pw.length === 4 && pw.every((v) => v !== '' && Number.isFinite(Number(v)))) {
    [ui.pArray.value, ui.pDay.value, ui.pDark.value, ui.pBatt.value] = pw as [
      string,
      string,
      string,
      string,
    ];
    ui.customise.open = currentPowerSystem()?.id === 'custom';
  }
  ui.preset.addEventListener('change', () => {
    const p = basePreset();
    if (p) fillPowerInputs(p);
    render();
  });
  ui.pReset.addEventListener('click', () => {
    const p = basePreset();
    if (p) fillPowerInputs(p);
    render();
  });
  for (const e of [ui.pArray, ui.pDay, ui.pDark, ui.pBatt]) e.addEventListener('input', render);
  for (const e of [ui.date, ui.days, ui.height, ui.centre]) {
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

interface AskReply {
  ok: boolean;
  error?: string;
  intent?: {
    date: string | null;
    slip_days: number;
    window_days: number | null;
    site: string | null;
  };
}

/** Plain-English query: the Worker's model returns settings; we apply them to the planner. */
function setupAsk(): void {
  const note = ui.askNote.textContent ?? '';
  ui.ask.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = ui.askQ.value.trim();
    if (!q) return;
    ui.askNote.textContent = 'Working it out…';
    void fetch('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q }),
    })
      .then(async (res) => (await res.json()) as AskReply)
      .then((r) => {
        const i = r.intent;
        if (!r.ok || !i) {
          ui.askNote.textContent = r.error ?? 'That did not work; use the controls instead.';
          return;
        }
        const base = i.date ?? (ui.plan.value || DEFAULT_PLAN);
        const d = new Date(`${base}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + i.slip_days);
        ui.plan.value = ymd(d);
        if (i.window_days) ui.planDays.value = String(i.window_days);
        drawPlanner();
        const parts = [
          `landing ${ymd(d)}${i.slip_days ? ` (${base} + ${i.slip_days} days)` : ''}`,
          `${ui.planDays.value}-day window`,
        ];
        const site = i.site ? sites.find((s) => s.id === i.site) : undefined;
        if (site) {
          parts.push(`chart opened for ${site.name}`);
          openChart(site.id, ymd(d), Number(ui.planDays.value));
        }
        ui.askNote.textContent = `Understood as: ${parts.join(', ')}. ${note}`;
      })
      .catch(() => {
        ui.askNote.textContent = 'The language model is unavailable; use the controls instead.';
      });
  });
}

const VIEWS = ['mission', 'explore', 'learn'] as const;
type View = (typeof VIEWS)[number];

/**
 * Three views of the same data: Mission (no explanation, shortcuts in sight), Explore (the
 * default) and Learn (teaching panels). In the URL as `v`, and remembered in this browser.
 */
function setView(v: View, remember = true): void {
  document.documentElement.dataset.view = v;
  for (const r of document.querySelectorAll<HTMLInputElement>('input[name="view"]')) {
    r.checked = r.value === v;
  }
  if (remember) {
    try {
      localStorage.setItem('view', v);
    } catch {
      // storage blocked: lasts for this page only
    }
    writeHash();
  }
}

function setupViews(): void {
  const isView = (x: string | null): x is View => VIEWS.includes(x as View);
  let saved: string | null = null;
  try {
    saved = localStorage.getItem('view');
  } catch {
    // storage blocked
  }
  const fromUrl = readHash().get('v');
  setView(isView(fromUrl) ? fromUrl : isView(saved) ? saved : 'explore', false);
  for (const r of document.querySelectorAll<HTMLInputElement>('input[name="view"]')) {
    r.addEventListener('change', () => {
      if (r.checked && isView(r.value)) setView(r.value);
    });
  }
}

function nextView(): void {
  const cur = document.documentElement.dataset.view as View;
  setView(VIEWS[(VIEWS.indexOf(cur) + 1) % VIEWS.length] ?? 'explore');
}

/** The map is tucked away by default; remember whether this browser had it open. */
function setupMapToggle(): void {
  const d = document.getElementById('map-details') as HTMLDetailsElement | null;
  if (!d) return;
  try {
    d.open = localStorage.getItem('map') === 'open';
  } catch {
    // storage blocked: stay closed
  }
  d.addEventListener('toggle', () => {
    try {
      localStorage.setItem('map', d.open ? 'open' : 'closed');
    } catch {
      // storage blocked
    }
  });
}

/** Step a <select> to its next or previous option and fire its change handler. */
function stepSelect(sel: HTMLSelectElement, by: number): void {
  const n = sel.options.length;
  if (!n) return;
  sel.selectedIndex = (sel.selectedIndex + by + n) % n;
  sel.dispatchEvent(new Event('change'));
}

function moveTime(hours: number): void {
  const max = Number(ui.time.max);
  ui.time.value = String(Math.max(0, Math.min(max, Number(ui.time.value) + hours)));
  render();
}

function setPlannerWindow(days: number): void {
  ui.planDays.value = String(days);
  drawPlanner();
}

const SHORTCUTS: Shortcut[] = [
  {
    group: 'Planner',
    keys: [']'],
    what: 'Slip the planned landing one day later',
    match: key(']'),
    run: () => slip(1),
  },
  { group: 'Planner', keys: ['['], what: 'One day earlier', match: key('['), run: () => slip(-1) },
  {
    group: 'Planner',
    keys: ['1', '2', '3'],
    what: 'Mission window: 7, 14 or 30 days',
    match: key('1', '2', '3'),
    run: (e) => setPlannerWindow(WINDOW_DAYS[Number(e.key) - 1] ?? 7),
  },
  {
    group: 'Planner',
    keys: ['/'],
    what: 'Ask in plain English',
    match: key('/'),
    run: () => ui.askQ.focus(),
  },
  {
    group: 'Planner',
    keys: ['M'],
    what: 'Show or hide the map',
    match: key('m', 'M'),
    run: () => {
      ui.mapDetails.open = !ui.mapDetails.open;
    },
  },
  {
    group: 'Planner',
    keys: ['D'],
    what: 'Back to the demo scenario (19 April 2028)',
    match: key('d', 'D'),
    run: () => {
      ui.plan.value = DEFAULT_PLAN;
      setPlannerWindow(WINDOW_DAYS[0]);
    },
  },
  {
    group: 'Sun-Path Chart',
    keys: ['←', '→'],
    what: 'Move the time one hour',
    match: (e) => key('ArrowLeft', 'ArrowRight')(e) && !e.shiftKey,
    run: (e) => moveTime(e.key === 'ArrowLeft' ? -1 : 1),
  },
  {
    group: 'Sun-Path Chart',
    keys: ['Shift ←', 'Shift →'],
    what: 'Move the time one day',
    match: (e) => key('ArrowLeft', 'ArrowRight')(e) && e.shiftKey,
    run: (e) => moveTime(e.key === 'ArrowLeft' ? -24 : 24),
  },
  {
    group: 'Sun-Path Chart',
    keys: ['J', 'K'],
    what: 'Next or previous site',
    match: key('j', 'J', 'k', 'K'),
    run: (e) => stepSelect(ui.site, e.key.toLowerCase() === 'j' ? 1 : -1),
  },
  {
    group: 'Sun-Path Chart',
    keys: ['H'],
    what: 'Observer height: 1, 2 or 5 m',
    match: key('h', 'H'),
    run: () => stepSelect(ui.height, 1),
  },
  {
    group: 'Sun-Path Chart',
    keys: ['C'],
    what: 'Centre the panorama on north, east, south or west',
    match: key('c', 'C'),
    run: () => stepSelect(ui.centre, 1),
  },
  {
    group: 'Sun-Path Chart',
    keys: ['P'],
    what: 'Next power system',
    match: key('p', 'P'),
    run: () => stepSelect(ui.preset, 1),
  },
  {
    group: 'Sun-Path Chart',
    keys: ['G'],
    what: 'Go to the chart',
    match: key('g', 'G'),
    run: () => ui.chartSection.scrollIntoView({ behavior: 'smooth', block: 'start' }),
  },
  {
    group: 'Page',
    keys: ['V'],
    what: 'Next view: Mission, Explore, Learn',
    match: key('v', 'V'),
    run: nextView,
  },
  {
    group: 'Page',
    keys: ['T'],
    what: 'Switch between dark and light',
    match: key('t', 'T'),
    run: () => ui.theme.click(),
  },
  {
    group: 'Page',
    keys: ['Home'],
    what: 'Back to the top',
    match: key('Home'),
    run: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
  },
];

setupViews();
upgradeInfoTips();
setupShortcuts(SHORTCUTS, $('shortcuts') as HTMLDialogElement);
setupAsk();
setupMapToggle();
setupTheme();
void showHealth();
init().catch((e: unknown) => {
  ui.lights.textContent = `Could not load the site data: ${String(e)}`;
});
