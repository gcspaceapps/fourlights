import './style.css';
import {
  PRESETS,
  darkEnduranceHours,
  renderBattery,
  simulateBattery,
  type PowerPreset,
} from './battery';
import { renderChart } from './chart';
import { infoTip, lightIcon, upgradeIcons, upgradeInfoTips, type LightName } from './icons';
import { renderEarthBob, renderSunYear } from './learn';
import { setupMap } from './map';
import { loadUserSites, makeUserSite, mergeSites, saveUserSites } from './usersites';
import { answerText, renderPlanner, type PlannedResult } from './planner';
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
import { pointingAt, pointingCsv, renderPointing } from './pointing';
import { segmented, syncSegmented } from './segmented';
import { key, setupShortcuts, type Shortcut } from './shortcuts';
import { activeTab, refreshTabs, setupTabs, showTab, stepTab } from './tabs';
import { at, type SiteData, type SiteSummary } from './types';
import { setupShare } from './share';
import {
  PROJECT_ID,
  SyncClient,
  createProject,
  fetchProject,
  remember,
  type Snapshot,
  type SyncStatus,
} from './sync';
import type {
  DataState,
  Event as ProjectEvent,
  ProjectSite,
  ViewState,
} from '../../api/src/project-state';

function $(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e;
}

const ui = {
  site: $('site') as HTMLSelectElement,
  // One landing date and one mission window for the whole page: the controls in the bar above
  // the tabs. `date`/`days` and `plan`/`planDays` are the same elements.
  date: $('plan') as HTMLInputElement,
  days: $('plan-days') as HTMLSelectElement,
  height: $('height') as HTMLSelectElement,
  centre: $('centre') as HTMLSelectElement,
  time: $('time') as HTMLInputElement,
  timeLabel: $('time-label') as HTMLOutputElement,
  chart: $('chart') as unknown as SVGSVGElement,
  lights: $('lights'),
  window: $('window'),
  pointing: $('pointing') as HTMLTableElement,
  pointingCsv: $('pointing-csv') as HTMLButtonElement,
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
  theme: $('theme'),
  ask: $('ask') as HTMLFormElement,
  askQ: $('ask-q') as HTMLInputElement,
  askNote: $('ask-note'),
  planNote: $('plan-note'),
  chartSection: $('chart-title'),
};

/** The demo scenario (_shared/concept.md): planned landing, the slip, and the site that survives. */
const DEFAULT_PLAN = '2028-04-19';
const DEMO_SITE = 'peak-near-shackleton';

const mapTab = setupMap(
  $('map-tab'),
  (siteId) => openChart(siteId, ui.plan.value || DEFAULT_PLAN, Number(ui.planDays.value)),
  (siteId) => chooseSite(siteId, false),
  (name, lat, lon) => addUserSite(name, lat, lon),
  (siteId) => removeUserSite(siteId),
  { onLook: () => queuePush() },
);
let lastResults: PlannedResult[] = [];
/**
 * Days the landing shown is after the planned landing (negative: before). The Landing field
 * holds the landing shown; the plan is that date less the slip. Slipping changes both together;
 * typing a new date is a new plan, so the slip goes back to 0.
 */
let slipDays = 0;
let sites: SiteSummary[] = [];
let published: SiteSummary[] = [];
/** True while the selected site is one of ours with no data yet (see usersites.ts). */
let noData = false;
let current: SiteData | null = null;

const ymd = (d: Date): string => d.toISOString().slice(0, 10);
const fmtTime = (d: Date): string => `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;

/** URL hash holds the view, so a Slip Planner cell (or a judge) can link straight to it. */
function readHash(): URLSearchParams {
  return new URLSearchParams(location.hash.slice(1));
}

function writeHash(): void {
  syncSegmented();
  const p = new URLSearchParams({
    site: ui.site.value,
    date: ui.date.value,
    days: ui.days.value,
    slip: String(slipDays),
    h: ui.height.value,
    c: ui.centre.value,
    t: ui.time.value,
    ps: ui.preset.value,
    pw: [ui.pArray.value, ui.pDay.value, ui.pDark.value, ui.pBatt.value].join('_'),
    tab: activeTab(),
    v: document.documentElement.dataset.view ?? 'explore',
  });
  if (project) p.set('project', project.id);
  history.replaceState(null, '', `#${p.toString()}`);
  queuePush();
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
  if (!site || noData) return;
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
  renderPointing(ui.pointing, pointingAt(site, profile, cursor));
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
  const mine = sites.find((x) => x.id === id);
  noData = !!mine?.user;
  document.documentElement.dataset.nodata = String(noData);
  if (mine?.user) {
    const note = `${mine.name} is a site you added, at ${Math.abs(mine.lat).toFixed(2)}°${mine.lat < 0 ? 'S' : 'N'}, ${Math.abs(mine.lon_e).toFixed(2)}°${mine.lon_e < 0 ? 'W' : 'E'}. It has no data yet: the lights, chart and battery need its terrain horizon, which we compute ahead of time. Once it is published it will fill in here by itself.`;
    for (const el of document.querySelectorAll('.nodata-note')) el.textContent = note;
    writeHash();
    return;
  }
  // Say so if the site's file takes a moment, instead of leaving the chart and lights empty.
  const notes = document.querySelectorAll('.nodata-note');
  const slow = window.setTimeout(() => {
    for (const el of notes) el.textContent = `Loading the data for ${mine?.name ?? 'this site'}…`;
    document.documentElement.dataset.nodata = 'true';
  }, 200);
  try {
    current = await loadSite(id);
  } catch (err) {
    window.clearTimeout(slow);
    for (const el of notes) {
      el.textContent = `The data for ${mine?.name ?? 'this site'} could not be loaded. Check the connection, then choose the site again.`;
    }
    document.documentElement.dataset.nodata = 'true';
    throw err;
  }
  window.clearTimeout(slow);
  document.documentElement.dataset.nodata = 'false';
  const first = timeAt(current, 0);
  const last = timeAt(current, current.times.n - 1);
  renderSunYear($('learn-sun') as unknown as SVGSVGElement, current);
  renderEarthBob($('learn-earth') as unknown as SVGSVGElement, current);
  ui.date.min = ymd(first);
  ui.date.max = ymd(last);
  if (!ui.date.value || ui.date.value < ui.date.min || ui.date.value > ui.date.max) {
    ui.date.value = ui.date.min;
  }
  const heights = current.horizons.map((h) => h.height_m);
  const keep = Number(ui.height.value) || DEFAULT_HEIGHT_M;
  ui.height.replaceChildren(
    ...heights.map((h) => new Option(String(h), String(h), false, h === keep)),
  );
  render();
}

function fillSiteOptions(): void {
  ui.site.replaceChildren(
    ...sites.map(
      (s) =>
        new Option(
          s.id.startsWith('fake-') ? `${s.name} [fixture]` : s.user ? `${s.name} (yours)` : s.name,
          s.id,
        ),
    ),
  );
}

/** Sites changed (one added or removed): every list, the planner and the map follow. */
function sitesChanged(select?: string): void {
  const keep = select ?? ui.site.value;
  fillSiteOptions();
  ui.site.value = sites.some((x) => x.id === keep) ? keep : (sites[0]?.id ?? '');
  drawPlanner();
  mapTab.setData(sites, lastResults);
  ui.site.dispatchEvent(new Event('change'));
}

function addUserSite(name: string, lat: number, lon: number): void {
  if (project) {
    // The project is the one place that names and keeps its sites; everyone, this page too, gets
    // the new list back from it.
    client?.send({ t: 'addSite', name, lat, lon_e: lon, avoid: published.map((s) => s.id) });
    return;
  }
  const mine = sites.filter((s) => s.user);
  const site = makeUserSite(
    name,
    lat,
    lon,
    sites.map((s) => s.id),
  );
  saveUserSites([...mine, site]);
  sites = mergeSites(published, [...mine, site]);
  sitesChanged(site.id);
}

function removeUserSite(id: string): void {
  if (project) {
    client?.send({ t: 'removeSite', id, fallback: DEMO_SITE });
    return;
  }
  const mine = sites.filter((s) => s.user && s.id !== id);
  saveUserSites(mine);
  sites = mergeSites(published, mine);
  sitesChanged(ui.site.value === id ? DEMO_SITE : undefined);
}

/** Make a site the selected one everywhere: the chart, the planner row, the map and the bar. */
function chooseSite(id: string, turnMap = true): void {
  // Chosen outside the map, the Moon turns to show it; a marker click leaves the view alone.
  if (turnMap) mapTab.showSite(id);
  if (ui.site.value === id) {
    showSelected();
    return;
  }
  ui.site.value = id;
  ui.site.dispatchEvent(new Event('change'));
}

/** Highlight the selected site in every view (the dropdown in the chart is its source of truth). */
function showSelected(): void {
  const id = ui.site.value;
  for (const el of document.querySelectorAll<HTMLElement>('tr[data-site]')) {
    el.classList.toggle('selected', el.dataset.site === id);
  }
  mapTab.setSelected(id);
  const r = lastResults.find((x) => x.id === id);
  const mine = sites.find((x) => x.id === id)?.user;
  const words = mine
    ? 'your site, no data yet'
    : r?.verdict
      ? `${{ green: 'works', amber: 'marginal', red: 'no power' }[r.verdict]}, ${r.usableDays.toFixed(1)} usable days for this landing`
      : '';
  $('selected-note').textContent = words ? `· ${words}` : '';
}

/** Show a site and landing date in the Sun-Path Chart (from a planner cell or a map marker). */
function openChart(siteId: string, date: string, days: number): void {
  ui.site.value = siteId;
  mapTab.showSite(siteId);
  showSelected();
  const moved = ui.date.value !== date || ui.days.value !== String(days);
  // A cell on another date is a slip to that date: the plan stays where it was.
  if (ui.date.value && ui.date.value !== date) slipDays += dayGap(ui.date.value, date);
  ui.date.value = date;
  ui.days.value = String(days);
  if (moved) drawPlanner();
  ui.time.value = '0';
  showTab('sun-path-chart');
  void selectSite(siteId).then(() => {
    ui.chartSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    ui.site.focus({ preventScroll: true });
  });
}

const DAY_MS = 86_400_000;
const utc = (date: string): Date => new Date(`${date}T00:00:00Z`);
/** Whole days from one YYYY-MM-DD date to another. */
const dayGap = (from: string, to: string): number =>
  Math.round((utc(to).getTime() - utc(from).getTime()) / DAY_MS);
const longDate = (date: string): string =>
  utc(date).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

/**
 * Keep the landing date inside the data. A date before or after it is moved to the nearest day
 * we have, and the page says so, instead of answering "no site works" for a day with no data.
 * Returns true if the date had to move.
 */
function clampLanding(): boolean {
  const { min, max } = ui.plan;
  const value = ui.plan.value;
  if (!value) {
    ui.plan.value = DEFAULT_PLAN;
    slipDays = 0;
    ui.planNote.textContent = '';
    return true;
  }
  if (!min || !max || (value >= min && value <= max)) {
    ui.planNote.textContent = '';
    return false;
  }
  const to = value < min ? min : max;
  // The plan stays where it was: only the landing stops at the edge of the data.
  slipDays += dayGap(value, to);
  ui.plan.value = to;
  ui.planNote.textContent =
    value < min
      ? `No data before ${longDate(min)}: showing ${longDate(min)}.`
      : `No data after ${longDate(max)}: showing ${longDate(max)}.`;
  return true;
}

function drawPlanner(): void {
  const landing = utc(ui.plan.value || DEFAULT_PLAN);
  const planned = new Date(landing.getTime() - slipDays * DAY_MS);
  const slipped = slipDays;
  renderPlanner({
    table: ui.planner,
    why: document.getElementById('cell-why'),
    sites,
    planned,
    slipDays: slipped,
    windowDays: Number(ui.planDays.value),
    onAnswer: (results, before) => {
      ui.answer.textContent = answerText(
        results.filter((r) => r.verdict),
        landing,
        Number(ui.planDays.value),
        before ? { planned, slipDays: slipped, results: before.filter((r) => r.verdict) } : null,
      );
      lastResults = results;
      mapTab.setData(sites, results);
      showSelected();
    },
    onOpen: openChart,
    onSelect: chooseSite,
  });
  writeHash();
}

function slip(days: number): void {
  const d = utc(ui.plan.value || DEFAULT_PLAN);
  d.setUTCDate(d.getUTCDate() + days);
  ui.plan.value = ymd(d);
  slipDays += days;
  clampLanding();
  render();
  drawPlanner();
}

// ───────────────────────────── shared project ─────────────────────────────
// A project is a Durable Object that every page on it talks to (sync.ts, api/src/project.ts).
// Two kinds of state travel: DATA (the selected site, date, window, height, power system, the
// sites) always, and VIEW (tab, Mission/Explore/Learn, chart centre and time, the Moon's layer,
// graticule and camera) while "follow the group's view" is on. A page reports a change by
// comparing what it shows now with what it last sent or received (`lastData`, `lastView`), so
// applying someone else's change never echoes back, and each existing handler needs no hook:
// `writeHash` already runs after every change.
let project: { id: string; name: string } | null = null;
let projectSites: ProjectSite[] = [];
let client: SyncClient | null = null;
let syncStatus: SyncStatus = 'connecting';
let peerCount = 1;
/** True while a change from someone else is being put on the page. */
let applying = false;
let lastData: Partial<DataState> = {};
let lastView: Partial<ViewState> = {};
/** Where the group is looking, kept even while this person is not following. */
let groupView: Partial<ViewState> = {};
let pushTimer = 0;
const FOLLOW_KEY = 'fourlights.follow';
let follow = ((): boolean => {
  try {
    return localStorage.getItem(FOLLOW_KEY) !== '0';
  } catch {
    return true;
  }
})();

const fromProject = (list: ProjectSite[]): SiteSummary[] =>
  list.map((s) => ({
    ...makeUserSite(s.name, s.lat, s.lon_e, []),
    id: s.id,
    source: 'Added to this shared project',
  }));
const mySites = (): SiteSummary[] => (project ? fromProject(projectSites) : loadUserSites());

function basePreset(): PowerPreset | undefined {
  return PRESETS.find((p) => p.id === ui.preset.value) ?? PRESETS[0];
}

function collectData(): DataState {
  const pw = [ui.pArray.value, ui.pDay.value, ui.pDark.value, ui.pBatt.value];
  const custom =
    currentPowerSystem()?.id === 'custom' &&
    pw.every((v) => v !== '' && Number.isFinite(Number(v)));
  return {
    site: ui.site.value,
    date: ui.date.value,
    days: ui.days.value,
    slip: String(slipDays),
    height: ui.height.value,
    preset: ui.preset.value,
    power: custom ? pw.join('_') : '',
  };
}

function collectView(): ViewState {
  const look = mapTab.getLook();
  return {
    tab: activeTab(),
    mode: (document.documentElement.dataset.view as View | undefined) ?? 'explore',
    centre: ui.centre.value,
    time: ui.time.value,
    layer: look.layer,
    grid: look.grid,
    cam: look.cam
      ? {
          lon: look.cam.lon,
          lat: look.cam.lat,
          D: look.cam.D,
          bearing: look.cam.bearing,
          pitch: look.cam.pitch,
        }
      : null,
  };
}

/** The keys of `now` whose values differ from `last`. */
function differing<T extends object>(now: T, last: Partial<T>): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(now) as (keyof T)[]) {
    if (JSON.stringify(now[k]) !== JSON.stringify(last[k])) out[k] = now[k];
  }
  return out;
}

/** Send what changed, at most ten times a second (a slider or the Moon turning is a stream). */
function queuePush(): void {
  if (!client || applying || pushTimer) return;
  pushTimer = window.setTimeout(() => {
    pushTimer = 0;
    if (!client?.live || applying) return;
    const data = differing(collectData(), lastData);
    const view = follow ? differing(collectView(), lastView) : {};
    const hasData = Object.keys(data).length > 0;
    const hasView = Object.keys(view).length > 0;
    if (!hasData && !hasView) return;
    client.send({ t: 'set', ...(hasData ? { data } : {}), ...(hasView ? { view } : {}) });
    Object.assign(lastData, data);
    Object.assign(lastView, view);
  }, 100);
}

/** Put someone else's data change on the page. Only what differs from what is showing. */
function applyData(d: Partial<DataState>): void {
  const cur = collectData();
  const has = (k: keyof DataState): boolean => d[k] !== undefined && d[k] !== cur[k];
  const power = d.power ?? lastData.power ?? cur.power;
  const powerChanged = d.power !== undefined && d.power !== cur.power;
  const presetChanged = has('preset') && d.preset !== '' && PRESETS.some((p) => p.id === d.preset);
  const siteChanged = has('site') && sites.some((x) => x.id === d.site);
  const plannerChanged = has('date') || has('days') || has('slip');
  if (!siteChanged && !plannerChanged && !has('height') && !presetChanged && !powerChanged) {
    Object.assign(lastData, d);
    return;
  }
  applying = true;
  try {
    if (has('date') && d.date) ui.date.value = d.date;
    if (has('days') && d.days) ui.days.value = d.days;
    if (has('slip') && d.slip) slipDays = Number(d.slip) || 0;
    if (has('height') && d.height) {
      if (![...ui.height.options].some((o) => o.value === d.height)) {
        ui.height.add(new Option(d.height, d.height));
      }
      ui.height.value = d.height;
    }
    if (presetChanged && d.preset) ui.preset.value = d.preset;
    if (presetChanged || powerChanged) {
      // The preset's own values, then any adjusted ones on top (as when a link is opened).
      const base = basePreset();
      if (base) fillPowerInputs(base);
      const pw = power.split('_');
      if (pw.length === 4 && pw.every((v) => v !== '' && Number.isFinite(Number(v)))) {
        [ui.pArray.value, ui.pDay.value, ui.pDark.value, ui.pBatt.value] = pw as [
          string,
          string,
          string,
          string,
        ];
        ui.customise.open = true;
      }
    }
    syncSegmented();
    if (plannerChanged) drawPlanner();
    if (siteChanged && d.site) {
      ui.site.value = d.site;
      ui.site.dispatchEvent(new Event('change'));
    } else {
      render();
    }
  } finally {
    applying = false;
  }
  Object.assign(lastData, d);
}

/** Put someone else's view on the page: the tab, the chart's cursor, the Moon. */
function applyView(v: Partial<ViewState>): void {
  const cur = collectView();
  applying = true;
  try {
    // The mode first: a Learn-only tab does not exist in the other modes.
    if (v.mode && v.mode !== cur.mode) setView(v.mode, false);
    if (v.tab && v.tab !== cur.tab) showTab(v.tab);
    let redraw = false;
    if (v.centre !== undefined && v.centre !== cur.centre) {
      ui.centre.value = v.centre;
      redraw = true;
    }
    if (v.time !== undefined && v.time !== cur.time) {
      ui.time.value = v.time;
      redraw = true;
    }
    syncSegmented();
    if (redraw) render();
    mapTab.setLook({ layer: v.layer, grid: v.grid, cam: v.cam });
  } finally {
    applying = false;
  }
  Object.assign(lastView, v);
}

function setProjectSites(list: ProjectSite[], data?: Partial<DataState>): void {
  projectSites = list;
  sites = mergeSites(published, fromProject(list));
  if (data) Object.assign(lastData, data);
  applying = true;
  try {
    sitesChanged(data?.site);
  } finally {
    applying = false;
  }
}

function startSync(snap: Snapshot): void {
  lastData = { ...snap.data };
  lastView = { ...snap.view };
  groupView = { ...snap.view };
  client = new SyncClient(snap.id, {
    snapshot: (s, peers) => {
      peerCount = peers;
      share.setStatus(syncStatus, peers);
      groupView = { ...s.view };
      if (JSON.stringify(s.sites) !== JSON.stringify(projectSites)) setProjectSites(s.sites);
      applyData(s.data);
      if (follow) applyView(s.view);
    },
    event: (e: ProjectEvent) => {
      if (e.t === 'sites') {
        setProjectSites(e.sites, e.data);
        if (e.data) applyData(e.data);
        return;
      }
      if (e.data) applyData(e.data);
      if (e.view) {
        Object.assign(groupView, e.view);
        if (follow) applyView(e.view);
      }
    },
    peers: (n) => {
      peerCount = n;
      share.setStatus(syncStatus, n);
    },
    status: (st) => {
      syncStatus = st;
      share.setStatus(st, peerCount);
    },
    gone: () => leaveProject(),
  });
}

/** The link's state, as the hash keys the page already reads at start-up. */
function seedHash(hash: URLSearchParams, snap: Snapshot): void {
  const { data: d, view: v } = snap;
  hash.set('site', d.site);
  hash.set('date', d.date);
  hash.set('days', d.days);
  hash.set('slip', d.slip);
  hash.set('h', d.height);
  if (d.preset) hash.set('ps', d.preset);
  if (d.power) hash.set('pw', d.power);
  else hash.delete('pw');
  hash.set('c', v.centre);
  hash.set('t', v.time);
  hash.set('v', v.mode);
  if (follow) hash.set('tab', v.tab);
}

function leaveProject(): void {
  client?.close();
  const p = readHash();
  p.delete('project');
  history.replaceState(null, '', `#${p.toString()}`);
  location.reload();
}

async function createShared(name: string): Promise<{ id: string; name: string }> {
  const mine = loadUserSites().map(({ id, name: n, lat, lon_e }) => ({ id, name: n, lat, lon_e }));
  const snap = await createProject({ name, sites: mine, data: collectData(), view: collectView() });
  project = { id: snap.id, name: snap.name };
  remember(project);
  setProjectSites(snap.sites);
  writeHash();
  startSync(snap);
  share.setProject(project);
  return project;
}

async function init(): Promise<void> {
  published = await loadSites();
  const hash = readHash();
  // A project in the link: its state wins over whatever else the link says.
  const joinId = hash.get('project');
  let joined: Snapshot | null = null;
  if (joinId && PROJECT_ID.test(joinId)) joined = await fetchProject(joinId);
  if (joined) {
    project = { id: joined.id, name: joined.name };
    projectSites = joined.sites;
    remember(project);
    seedHash(hash, joined);
  } else if (joinId) {
    hash.delete('project');
  }
  sites = mergeSites(published, mySites());
  fillSiteOptions();
  ui.planDays.replaceChildren(...WINDOW_DAYS.map((d) => new Option(String(d), String(d))));
  // Old links carried a planner date (plan, pdays) and a chart date (date, days); the chart's wins.
  ui.plan.value = hash.get('date') ?? hash.get('plan') ?? DEFAULT_PLAN;
  ui.planDays.value = hash.get('days') ?? hash.get('pdays') ?? String(WINDOW_DAYS[0]);
  const slipIn = Number(hash.get('slip') ?? '0');
  slipDays = Number.isInteger(slipIn) && Math.abs(slipIn) <= 999 ? slipIn : 0;
  const demoSite = sites.some((x) => x.id === DEMO_SITE) ? DEMO_SITE : (sites[0]?.id ?? '');
  const wanted = hash.get('site');
  ui.site.value = wanted && sites.some((x) => x.id === wanted) ? wanted : demoSite;
  ui.centre.value = hash.get('c') ?? '0';
  // A range input starts with max = 100 and would clamp a later time from a shared link;
  // render() sets the real maximum for the window.
  ui.time.max = '100000';
  ui.time.value = hash.get('t') ?? '0';
  if (hash.get('h')) ui.height.replaceChildren(new Option('', hash.get('h') ?? ''));

  ui.site.addEventListener('change', (e) => {
    // Picked from the dropdown by this person (not set by code or by someone else on the project).
    if (e.isTrusted) mapTab.showSite(ui.site.value);
    showSelected();
    void selectSite(ui.site.value);
  });
  ui.preset.replaceChildren(...PRESETS.map((p) => new Option(p.name, p.id)));
  ui.preset.value = hash.get('ps') ?? PRESETS[0]?.id ?? '';
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
  // First, before the chart and the planner read it: a date typed in is a new plan (no slip),
  // and it has to be a day we have data for.
  ui.plan.addEventListener('change', () => {
    slipDays = 0;
    clampLanding();
  });
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
  if (joined) {
    share.setProject(project);
    startSync(joined);
  } else if (joinId) {
    ui.askNote.textContent = 'That shared project does not exist, so this is your own copy.';
    writeHash();
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
        // A date in the question is a new plan; a slip alone adds to the slip so far.
        slipDays = i.date ? i.slip_days : slipDays + i.slip_days;
        const moved = clampLanding();
        if (i.window_days) ui.planDays.value = String(i.window_days);
        render();
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
        ui.askNote.textContent = `Understood as: ${parts.join(', ')}.${moved ? ` ${ui.planNote.textContent}` : ''} ${note}`;
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
  refreshTabs();
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
    // A radio button moves its choice with the arrow keys; here the arrows belong to the tabs
    // (Left and Right) and the page, so the views change only when clicked or activated.
    r.addEventListener('keydown', (e) => {
      if (!e.key.startsWith('Arrow')) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'ArrowLeft') stepTab(-1);
      if (e.key === 'ArrowRight') stepTab(1);
    });
  }
}

function nextView(): void {
  const cur = document.documentElement.dataset.view as View;
  setView(VIEWS[(VIEWS.indexOf(cur) + 1) % VIEWS.length] ?? 'explore');
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
    run: () => {
      showTab('planner');
      ui.askQ.focus();
    },
  },
  {
    group: 'Planner',
    keys: ['M'],
    what: 'Go to the map',
    match: key('m', 'M'),
    run: () => {
      showTab('map');
    },
  },
  {
    group: 'Planner',
    keys: ['D'],
    what: 'Back to the demo scenario (19 April 2028)',
    match: key('d', 'D'),
    run: () => {
      ui.plan.value = DEFAULT_PLAN;
      slipDays = 0;
      clampLanding();
      setPlannerWindow(WINDOW_DAYS[0]);
    },
  },
  {
    group: 'Page',
    keys: ['←', '→'],
    what: 'Previous or next tab',
    match: (e) => key('ArrowLeft', 'ArrowRight')(e) && !e.shiftKey,
    run: (e) => stepTab(e.key === 'ArrowLeft' ? -1 : 1),
  },
  {
    group: 'Sun-Path Chart',
    keys: [',', '.'],
    what: 'Move the time one hour',
    match: key(',', '.'),
    run: (e) => moveTime(e.key === ',' ? -1 : 1),
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
    run: (e) => {
      stepSelect(ui.site, e.key.toLowerCase() === 'j' ? 1 : -1);
      mapTab.showSite(ui.site.value);
    },
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
    run: () => {
      showTab('sun-path-chart');
      ui.chartSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
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

const share = setupShare({
  uploadCount: () => loadUserSites().length,
  create: createShared,
  follow: () => follow,
  setFollow: (on) => {
    follow = on;
    try {
      localStorage.setItem(FOLLOW_KEY, on ? '1' : '0');
    } catch {
      // storage blocked: lasts for this page only
    }
    // Switching it on joins the group where it is now.
    if (on) applyView(groupView);
  },
  leave: leaveProject,
});

setupViews();
setupTabs($('tabs'), readHash().get('tab'), (slug) => {
  writeHash();
  mapTab.setActive(slug === 'map');
});
mapTab.setActive(activeTab() === 'map');
for (const sel of [
  ui.planDays,
  ui.height,
  ui.centre,
  ui.preset,
  $('globe-layer') as HTMLSelectElement,
])
  segmented(sel);
ui.pointingCsv.addEventListener('click', () => {
  const site = current;
  if (!site || noData) return;
  const profile = profileFor(site, Number(ui.height.value));
  const start = indexAt(site, new Date(`${ui.date.value}T00:00:00Z`));
  const csv = pointingCsv(site, profile, start, Number(ui.days.value) * 24);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `four-lights_${site.id}_${ui.date.value}_${ui.days.value}d_${ui.height.value}m.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});
upgradeIcons();
upgradeInfoTips();
setupShortcuts(SHORTCUTS, $('shortcuts') as HTMLDialogElement);
setupAsk();
setupTheme();
init().catch((e: unknown) => {
  ui.lights.textContent = `Could not load the site data: ${String(e)}`;
});
