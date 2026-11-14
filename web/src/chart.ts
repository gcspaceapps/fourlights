// Sun-Path Chart: a 360° panorama of the site's terrain horizon with the Sun and Earth tracks.
// Azimuth runs across (true north from the site; the centre azimuth is selectable), elevation up.
// The vertical range comes from the data (horizons and tracks), never a fixed range.
import { SUN_RADIUS_DEG } from './lights';
import { at, type HorizonProfile, type SiteData } from './types';

const NS = 'http://www.w3.org/2000/svg';
const W = 1000;
const H = 340;
const M = { left: 46, right: 10, top: 14, bottom: 30 };
const PW = W - M.left - M.right;
const PH = H - M.top - M.bottom;
const CARDINALS: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };

export interface ChartView {
  site: SiteData;
  profile: HorizonProfile;
  /** First and one-past-last time step of the mission window. */
  start: number;
  end: number;
  /** Time step of the slider. */
  cursor: number;
  /** Azimuth at the centre of the panorama, degrees. */
  centreAz: number;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.appendChild(e);
  return e;
}

function niceStep(range: number): number {
  for (const s of [0.5, 1, 2, 5, 10]) if (range / s <= 10) return s;
  return 20;
}

export function renderChart(svg: SVGSVGElement, v: ChartView): void {
  const { site, profile, start, end, cursor, centreAz } = v;
  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  // Vertical range from the data: the horizon and both tracks over the window.
  let lo = Math.min(...profile.elev_deg);
  let hi = Math.max(...profile.elev_deg);
  for (let i = start; i < end; i++) {
    lo = Math.min(lo, at(site.sun.el, i), at(site.earth.el, i));
    hi = Math.max(hi, at(site.sun.el, i), at(site.earth.el, i));
  }
  lo = Math.floor(lo - 0.5);
  hi = Math.ceil(hi + 0.5);

  const xOf = (az: number): number =>
    M.left + ((((az - centreAz + 180) % 360) + 360) % 360) * (PW / 360);
  const yOf = (e: number): number => M.top + ((hi - e) / (hi - lo)) * PH;

  const clip = el('clipPath', { id: 'plot' }, svg);
  el('rect', { x: M.left, y: M.top, width: PW, height: PH }, clip);
  el('rect', { x: M.left, y: M.top, width: PW, height: PH, class: 'sky' }, svg);

  // Grid: elevation lines, azimuth every 45° with cardinal labels.
  const step = niceStep(hi - lo);
  for (let e = Math.ceil(lo / step) * step; e <= hi; e += step) {
    const y = yOf(e);
    el(
      'line',
      { x1: M.left, x2: W - M.right, y1: y, y2: y, class: e === 0 ? 'grid zero' : 'grid' },
      svg,
    );
    el('text', { x: M.left - 6, y: y + 4, class: 'tick', 'text-anchor': 'end' }, svg).textContent =
      `${e}°`;
  }
  for (let a = 0; a < 360; a += 45) {
    const x = xOf(a);
    el('line', { x1: x, x2: x, y1: M.top, y2: M.top + PH, class: 'grid' }, svg);
    el('text', { x, y: H - 10, class: 'tick', 'text-anchor': 'middle' }, svg).textContent =
      CARDINALS[a] ?? `${a}°`;
  }

  // Skyline: a filled silhouette, one flat step per 0.5° sector.
  const n = profile.elev_deg.length;
  const first = Math.floor(((((centreAz - 180) % 360) + 360) % 360) / profile.step_deg) % n;
  const pts: string[] = [`${M.left},${M.top + PH}`];
  for (let k = 0; k < n; k++) {
    const s = (first + k) % n;
    const y = yOf(at(profile.elev_deg, s)).toFixed(1);
    const x0 = (M.left + (k * PW) / n).toFixed(1);
    const x1 = (M.left + ((k + 1) * PW) / n).toFixed(1);
    pts.push(`${x0},${y}`, `${x1},${y}`);
  }
  pts.push(`${M.left + PW},${M.top + PH}`);

  // Tracks over the mission window, broken where they wrap across the panorama's edge.
  for (const [body, cls] of [
    [site.sun, 'track sun'],
    [site.earth, 'track earth'],
  ] as const) {
    let d = '';
    let px = Number.NaN;
    for (let i = start; i < end; i++) {
      const x = xOf(at(body.az, i));
      const y = yOf(at(body.el, i));
      d += `${Number.isNaN(px) || Math.abs(x - px) > PW / 2 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      px = x;
    }
    el('path', { d, class: cls, 'clip-path': 'url(#plot)' }, svg);
    // A tick every 24 hours from the window start.
    for (let i = start; i < end; i += 24) {
      el(
        'circle',
        { cx: xOf(at(body.az, i)), cy: yOf(at(body.el, i)), r: 2.5, class: `${cls} tick-dot` },
        svg,
      );
    }
  }

  // The skyline goes on top of the tracks, slightly see-through: where the Sun or Earth is behind
  // the terrain, its path shows only faintly, as it would be hidden from the site.
  el('polygon', { points: pts.join(' '), class: 'terrain', 'clip-path': 'url(#plot)' }, svg);

  // Markers at the slider time.
  for (const [body, cls, label] of [
    [site.sun, 'marker sun', 'Sun'],
    [site.earth, 'marker earth', 'Earth'],
  ] as const) {
    const az = at(body.az, cursor);
    const elev = at(body.el, cursor);
    const x = xOf(az);
    const y = yOf(elev);
    // Dimmed when the body's centre is behind the terrain in its direction. The Sun is a disc:
    // with its centre just behind the terrain part of it still shows and the Sun light is on,
    // so the label says "partly hidden" and matches the light.
    const sector = Math.floor((((az % 360) + 360) % 360) / profile.step_deg) % n;
    const clear = elev - at(profile.elev_deg, sector);
    const hidden = clear <= 0 ? ' hidden' : '';
    const partly = body === site.sun && clear <= 0 && clear > -SUN_RADIUS_DEG;
    el('circle', { cx: x, cy: y, r: 8, class: cls + hidden }, svg);
    el('text', { x: x + 11, y: y - 9, class: `label ${cls}${hidden}` }, svg).textContent = partly
      ? `${label} (partly hidden)`
      : hidden
        ? `${label} (hidden)`
        : label;
  }

  el('text', { x: M.left + 6, y: M.top + 16, class: 'tick' }, svg).textContent =
    `elevation (°), observer ${profile.height_m} m`;
}
