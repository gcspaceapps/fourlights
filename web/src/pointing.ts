// The raw pointing numbers: where the Sun and Earth are (azimuth and elevation), how high the
// terrain stands in that direction, and the clearance between them. What you would point a solar
// panel or an antenna with. Also the same figures, hour by hour, as a CSV for the mission window.
import { lightsAt, stationsAt, terrainAt } from './lights';
import { at, type HorizonProfile, type SiteData } from './types';

export interface Pointing {
  body: 'Sun' | 'Earth';
  azDeg: number;
  elDeg: number;
  terrainDeg: number;
  /** Elevation of the body's centre above the terrain in its direction (negative = behind it). */
  clearDeg: number;
}

export function pointingAt(site: SiteData, h: HorizonProfile, i: number): Pointing[] {
  return (
    [
      ['Sun', site.sun],
      ['Earth', site.earth],
    ] as const
  ).map(([body, track]) => {
    const azDeg = at(track.az, i);
    const elDeg = at(track.el, i);
    const terrainDeg = terrainAt(h, azDeg);
    return { body, azDeg, elDeg, terrainDeg, clearDeg: elDeg - terrainDeg };
  });
}

const deg = (v: number): string => `${v.toFixed(2)}°`;
const signed = (v: number): string => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}°`;

export function renderPointing(table: HTMLTableElement, rows: Pointing[]): void {
  const head = document.createElement('thead');
  const hr = head.insertRow();
  for (const text of ['', 'Azimuth', 'Elevation', 'Terrain there', 'Clearance']) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = text;
    hr.appendChild(th);
  }
  const body = document.createElement('tbody');
  for (const r of rows) {
    const tr = body.insertRow();
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = r.body;
    th.className = r.body.toLowerCase();
    tr.appendChild(th);
    for (const text of [deg(r.azDeg), signed(r.elDeg), signed(r.terrainDeg), signed(r.clearDeg)]) {
      tr.insertCell().textContent = text;
    }
    tr.cells[4]?.classList.add(r.clearDeg > 0 ? 'clear' : 'blocked');
  }
  table.replaceChildren(head, body);
}

/** Hourly values for the mission window, as CSV text (angles in degrees, times in UTC). */
export function pointingCsv(
  site: SiteData,
  h: HorizonProfile,
  start: number,
  hours: number,
): string {
  const end = Math.min(site.times.n, start + hours);
  const t0 = Date.parse(site.times.start_utc);
  const lines = [
    [
      'time_utc',
      'sun_az_deg',
      'sun_el_deg',
      'sun_terrain_deg',
      'sun_disc_in_view',
      'earth_az_deg',
      'earth_el_deg',
      'earth_terrain_deg',
      'comms',
      'dsn_stations',
    ].join(','),
  ];
  for (let i = start; i < end; i++) {
    const [sun, earth] = pointingAt(site, h, i);
    if (!sun || !earth) continue;
    const l = lightsAt(site, h, i);
    const time = new Date(t0 + i * site.times.step_min * 60_000).toISOString().slice(0, 16) + 'Z';
    lines.push(
      [
        time,
        sun.azDeg.toFixed(2),
        sun.elDeg.toFixed(2),
        sun.terrainDeg.toFixed(2),
        l.sunFraction.toFixed(3),
        earth.azDeg.toFixed(2),
        earth.elDeg.toFixed(2),
        earth.terrainDeg.toFixed(2),
        l.comms ? 1 : 0,
        (stationsAt(site, i) ?? []).join(' '),
      ].join(','),
    );
  }
  return lines.join('\n') + '\n';
}
