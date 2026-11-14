// South-pole map: where the 12 sites are, on LOLA terrain shading, coloured by whether each
// works for the planned landing. The image is a hillshade of NASA's LDEM_75S_240M, a 420 km
// square centred on the pole in south polar stereographic (made by `make map` in pipeline/).
import type { PlannedResult } from './planner';
import type { SiteSummary } from './types';

const NS = 'http://www.w3.org/2000/svg';
/** Half-width of the map, metres; the image is 1000 px across. */
const HALF_M = 210_000;
const PX = 1000;
const MOON_RADIUS_M = 1_737_400;
/** Sites whose label goes to the left of the marker, to keep crowded labels apart. */
const LABEL_LEFT = new Set([
  'connecting-ridge',
  'de-gerlache-rim-2',
  'malapert-massif',
  'mons-mouton',
]);
const WORDS = { green: 'works', amber: 'marginal', red: 'no power' } as const;

const px = (m: number): number => ((m + HALF_M) / (2 * HALF_M)) * PX;
const py = (m: number): number => ((HALF_M - m) / (2 * HALF_M)) * PX;

function el(tag: string, attrs: Record<string, string | number>, text?: string): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

export function renderMap(
  svg: SVGSVGElement,
  sites: SiteSummary[],
  results: PlannedResult[],
  onOpen: (siteId: string) => void,
): void {
  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${PX} ${PX}`);
  svg.appendChild(
    el('image', { href: '/map/south-pole-hillshade.jpg', width: PX, height: PX, class: 'relief' }),
  );
  // Latitude circles and the pole.
  for (const lat of [-88, -86, -84]) {
    const rho = 2 * MOON_RADIUS_M * Math.tan(((90 + lat) / 2) * (Math.PI / 180));
    svg.appendChild(
      el('circle', { cx: px(0), cy: py(0), r: (rho / (2 * HALF_M)) * PX, class: 'lat' }),
    );
    svg.appendChild(el('text', { x: px(0) + 4, y: py(-rho) - 4, class: 'map-note' }, `${-lat}°S`));
  }
  svg.appendChild(
    el('path', { d: `M${px(0) - 7},${py(0)}h14M${px(0)},${py(0) - 7}v14`, class: 'pole' }),
  );
  svg.appendChild(
    el(
      'text',
      { x: PX / 2, y: 22, class: 'map-note', 'text-anchor': 'middle' },
      '↑ 0°E: toward Earth',
    ),
  );

  const byId = new Map(results.map((r) => [r.id, r]));
  for (const s of sites) {
    const r = byId.get(s.id);
    const v = r?.verdict ?? null;
    const x = px(s.ps_x_m);
    const y = py(s.ps_y_m);
    const g = el('g', { class: `site ${v ?? 'none'}`, tabindex: 0, role: 'button' });
    const label =
      r && v ? `${s.name}: ${WORDS[v]}, ${r.usableDays.toFixed(1)} usable days` : s.name;
    g.setAttribute('aria-label', `${label}. Open the chart.`);
    g.appendChild(el('title', {}, label));
    g.appendChild(el('circle', { cx: x, cy: y, r: 9 }));
    // Labels sit to the right, or to the left near the right edge.
    const left = x > PX - 190 || LABEL_LEFT.has(s.id);
    g.appendChild(
      el(
        'text',
        { x: left ? x - 16 : x + 16, y: y + 5, 'text-anchor': left ? 'end' : 'start' },
        s.name,
      ),
    );
    g.addEventListener('click', () => onOpen(s.id));
    g.addEventListener('keydown', (e) => {
      const k = (e as KeyboardEvent).key;
      if (k === 'Enter' || k === ' ') {
        e.preventDefault();
        onOpen(s.id);
      }
    });
    svg.appendChild(g);
  }
}
