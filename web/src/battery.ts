// Survive the Night: battery state of charge through the mission window, from the Sun light.
// A deliberately simple energy balance, hour by hour: in sunlight the array (scaled by the share
// of the Sun's disc in view) runs the day load and charges the battery with what is left; with
// the Sun fully hidden the battery runs the survival load.
// The presets are illustrative round numbers, not real vehicle specifications.
import { lightsAt } from './lights';
import type { HorizonProfile, SiteData } from './types';

export interface PowerPreset {
  id: string;
  name: string;
  /** Solar array output in sunlight, W. */
  arrayW: number;
  /** Load while sunlit, W. */
  dayLoadW: number;
  /** Survival load in the dark (heaters, avionics), W. */
  darkLoadW: number;
  /** Usable battery capacity, Wh. */
  batteryWh: number;
  /** A NASA photograph of a real vehicle of this class. The numbers above are NOT that vehicle's. */
  photo: { src: string; alt: string; caption: string; credit: string };
}

export const PRESETS: readonly PowerPreset[] = [
  {
    id: 'small',
    name: 'Small lander',
    arrayW: 600,
    dayLoadW: 300,
    darkLoadW: 60,
    batteryWh: 3000,
    photo: {
      src: '/img/surveyor-3.jpg',
      alt: 'A small robotic lander on the lunar surface, its solar panel raised on a mast',
      caption:
        'A lander of this kind: Surveyor 3 on the Moon, photographed by the Apollo 12 crew in 1969.',
      credit: 'NASA, AS12-48-7121',
    },
  },
  {
    id: 'rover',
    name: 'Hibernating rover',
    arrayW: 400,
    dayLoadW: 200,
    darkLoadW: 25,
    batteryWh: 5000,
    photo: {
      src: '/img/viper-prototype.jpg',
      alt: 'A four-wheeled rover prototype on sand in a test laboratory',
      caption:
        "A rover of this kind: a prototype of NASA's VIPER polar rover in mobility tests, 2021.",
      credit: 'NASA/GRC/Bridget Caswell, GRC-2021-C-00493',
    },
  },
  {
    id: 'crew',
    name: 'Crewed lander',
    arrayW: 6000,
    dayLoadW: 3000,
    darkLoadW: 1500,
    batteryWh: 100_000,
    photo: {
      src: '/img/apollo-11-lunar-module.jpg',
      alt: 'The Apollo 11 lunar module on the Moon with an astronaut working beside it',
      caption: 'A lander of this kind: the Apollo 11 lunar module on the Moon, 1969.',
      credit: 'NASA, AS11-40-5927',
    },
  },
];

/** Hours a full battery lasts in continuous darkness. */
export function darkEnduranceHours(p: PowerPreset): number {
  return p.batteryWh / p.darkLoadW;
}

export interface BatteryRun {
  /** State of charge at the END of each hour, 0..1. */
  soc: number[];
  /** Whether each hour was sunlit. */
  lit: boolean[];
  minSoc: number;
  /** Hours spent with a flat battery. */
  flatHours: number;
  /** Index (within the window) of the first flat hour, or -1. */
  firstFlat: number;
  survives: boolean;
}

/** Simulate from a full battery at landing. Data must be hourly. */
export function simulateBattery(
  site: SiteData,
  h: HorizonProfile,
  start: number,
  hours: number,
  p: PowerPreset,
): BatteryRun {
  const stepH = site.times.step_min / 60;
  const end = Math.min(site.times.n, start + hours);
  let wh = p.batteryWh;
  let minSoc = 1;
  let flatHours = 0;
  let firstFlat = -1;
  const soc: number[] = [];
  const lit: boolean[] = [];
  for (let i = start; i < end; i++) {
    const { sun, sunFraction } = lightsAt(site, h, i);
    lit.push(sun);
    // The array's output scales with the share of the Sun's disc in view.
    wh += sun ? (p.arrayW * sunFraction - p.dayLoadW) * stepH : -p.darkLoadW * stepH;
    wh = Math.min(p.batteryWh, wh);
    if (wh <= 0) {
      wh = 0;
      flatHours += stepH;
      if (firstFlat < 0) firstFlat = i - start;
    }
    const s = wh / p.batteryWh;
    minSoc = Math.min(minSoc, s);
    soc.push(s);
  }
  return { soc, lit, minSoc, flatHours, firstFlat, survives: flatHours === 0 };
}

const NS = 'http://www.w3.org/2000/svg';
const W = 1000;
const H = 120;
const M = { left: 46, right: 10, top: 8, bottom: 22 };

/** A strip under the panorama: dark spells shaded, state of charge as a filled line. */
export function renderBattery(svg: SVGSVGElement, run: BatteryRun, cursor: number): void {
  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const n = run.soc.length;
  const pw = W - M.left - M.right;
  const ph = H - M.top - M.bottom;
  const x = (k: number): number => M.left + (k / Math.max(1, n)) * pw;
  const y = (s: number): number => M.top + (1 - s) * ph;
  const add = (tag: string, attrs: Record<string, string | number>, text?: string): void => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    if (text !== undefined) e.textContent = text;
    svg.appendChild(e);
  };
  add('rect', { x: M.left, y: M.top, width: pw, height: ph, class: 'sky' });
  // Dark spells.
  let k = 0;
  while (k < n) {
    if (run.lit[k]) {
      k++;
      continue;
    }
    let e = k;
    while (e < n && !run.lit[e]) e++;
    add('rect', { x: x(k), y: M.top, width: x(e) - x(k), height: ph, class: 'dark-spell' });
    k = e;
  }
  for (const s of [0, 0.5, 1]) {
    add('line', { x1: M.left, x2: W - M.right, y1: y(s), y2: y(s), class: 'grid' });
    add('text', { x: M.left - 6, y: y(s) + 4, class: 'tick', 'text-anchor': 'end' }, `${s * 100}%`);
  }
  for (let d = 0; d * 24 <= n; d++) {
    add('text', { x: x(d * 24), y: H - 6, class: 'tick', 'text-anchor': 'middle' }, `d${d + 1}`);
  }
  const pts = [`${x(0)},${y(0)}`, `${x(0)},${y(1)}`];
  run.soc.forEach((s, i) => pts.push(`${x(i + 1).toFixed(1)},${y(s).toFixed(1)}`));
  pts.push(`${x(n)},${y(0)}`);
  add('polygon', { points: pts.join(' '), class: run.survives ? 'soc ok' : 'soc flat' });
  add('line', {
    x1: x(cursor + 0.5),
    x2: x(cursor + 0.5),
    y1: M.top,
    y2: M.top + ph,
    class: 'soc-cursor',
  });
}
