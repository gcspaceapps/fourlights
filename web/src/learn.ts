// Learn view: two small charts drawn from the site file that is already loaded, so the teaching
// panels show this site's real numbers, not a sketch.
import { profileFor, terrainAt } from './lights';
import { at, type SiteData } from './types';

const NS = 'http://www.w3.org/2000/svg';
const W = 560;
const H = 200;
const M = { left: 40, right: 8, top: 10, bottom: 26 };

interface Series {
  values: number[];
  cls: string;
}

function el(tag: string, attrs: Record<string, string | number>, text?: string): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

/** A plain line chart: values against a day axis, with degree gridlines. */
function lineChart(
  svg: SVGSVGElement,
  series: Series[],
  days: number,
  xTicks: [number, string][],
): void {
  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const all = series.flatMap((s) => s.values);
  const lo = Math.floor(Math.min(...all, 0) - 0.5);
  const hi = Math.ceil(Math.max(...all, 0) + 0.5);
  const pw = W - M.left - M.right;
  const ph = H - M.top - M.bottom;
  const y = (v: number): number => M.top + ((hi - v) / (hi - lo)) * ph;
  const step = hi - lo > 8 ? 4 : hi - lo > 4 ? 2 : 1;
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
    svg.appendChild(
      el('line', {
        x1: M.left,
        x2: W - M.right,
        y1: y(v),
        y2: y(v),
        class: v === 0 ? 'grid zero' : 'grid',
      }),
    );
    svg.appendChild(
      el('text', { x: M.left - 6, y: y(v) + 4, class: 'tick', 'text-anchor': 'end' }, `${v}°`),
    );
  }
  for (const [day, label] of xTicks) {
    svg.appendChild(
      el(
        'text',
        { x: M.left + (day / days) * pw, y: H - 8, class: 'tick', 'text-anchor': 'middle' },
        label,
      ),
    );
  }
  for (const s of series) {
    const n = s.values.length;
    const d = s.values
      .map(
        (v, i) => `${i ? 'L' : 'M'}${(M.left + (i / (n - 1)) * pw).toFixed(1)},${y(v).toFixed(1)}`,
      )
      .join('');
    svg.appendChild(el('path', { d, class: s.cls }));
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Earth's height above level, and the terrain in its direction, for the first 60 days. */
export function renderEarthBob(svg: SVGSVGElement, site: SiteData): void {
  const h = profileFor(site, 2);
  const perDay = (24 * 60) / site.times.step_min;
  const n = Math.min(site.times.n, 60 * perDay);
  const earth: number[] = [];
  const terrain: number[] = [];
  for (let i = 0; i < n; i += 2) {
    earth.push(at(site.earth.el, i));
    terrain.push(terrainAt(h, at(site.earth.az, i)));
  }
  lineChart(
    svg,
    [
      { values: terrain, cls: 'learn-line terrain-line' },
      { values: earth, cls: 'learn-line earth-line' },
    ],
    60,
    [0, 15, 30, 45, 60].map((d) => [d, `day ${d}`]),
  );
}

/** The Sun's height above level, averaged over each Earth day, for the first year. */
export function renderSunYear(svg: SVGSVGElement, site: SiteData): void {
  const perDay = (24 * 60) / site.times.step_min;
  const days = Math.min(365, Math.floor(site.times.n / perDay));
  const mean: number[] = [];
  for (let d = 0; d < days; d++) {
    let sum = 0;
    for (let i = d * perDay; i < (d + 1) * perDay; i++) sum += at(site.sun.el, i);
    mean.push(sum / perDay);
  }
  const start = new Date(site.times.start_utc);
  const ticks: [number, string][] = [0, 3, 6, 9].map((m) => {
    const t = Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + m, 1);
    return [(t - start.getTime()) / 86_400_000, MONTHS[(start.getUTCMonth() + m) % 12] ?? ''];
  });
  lineChart(svg, [{ values: mean, cls: 'learn-line sun-line' }], days, ticks);
}
