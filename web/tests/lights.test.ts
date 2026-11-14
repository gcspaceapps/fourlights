// The rules in _shared/concept.md, on hand-built data with known answers, and the demo scenario
// on the real published files (so a data or rule change that breaks the demo fails the build).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { indexAt, lightsAt, profileFor, terrainAt, windowSummary } from '../src/lights';
import { verdict } from '../src/planner';
import type { SiteData } from '../src/types';

function site(sunEl: number[], earthEl: number[], terrainDeg = 0): SiteData {
  const n = sunEl.length;
  return {
    id: 'test',
    site: { lat: -89, lon_e: 0, elev_m: 0 },
    horizons: [{ height_m: 2, step_deg: 0.5, elev_deg: new Array<number>(720).fill(terrainDeg) }],
    times: { start_utc: '2028-01-01T00:00:00Z', step_min: 60, n },
    sun: { az: new Array<number>(n).fill(10), el: sunEl },
    earth: { az: new Array<number>(n).fill(200), el: earthEl },
    meta: { dem_rings: [], ephem: 'fake', frame: 'MOON_ME', built_utc: '' },
  };
}

describe('four lights', () => {
  it('reads the terrain sector that contains an azimuth', () => {
    const s = site([0], [0]);
    const h = profileFor(s, 2);
    h.elev_deg[20] = 3; // sector [10.0°, 10.5°)
    expect(terrainAt(h, 10.25)).toBe(3);
    expect(terrainAt(h, 10.5)).toBe(0);
    expect(terrainAt(h, 370.1)).toBe(3);
    expect(terrainAt(h, -0.1)).toBe(0); // wraps to sector 719
  });

  it('Sun and Earth need to clear the terrain; Comms needs a 1° margin', () => {
    const s = site([0.5, -0.5, 0.5], [0.5, 2, 1], 0);
    const h = profileFor(s, 2);
    expect(lightsAt(s, h, 0)).toEqual({ sun: true, earth: true, comms: false });
    expect(lightsAt(s, h, 1)).toEqual({ sun: false, earth: true, comms: true });
    expect(lightsAt(s, h, 2)).toEqual({ sun: true, earth: true, comms: true });
  });

  it('Power needs 70% sunlit and no dark spell over 48 h', () => {
    const lit = (hours: boolean[]): SiteData =>
      site(
        hours.map((x) => (x ? 1 : -1)),
        hours.map(() => 5),
      );
    const week = (dark: number, at: number): boolean[] =>
      Array.from({ length: 168 }, (_, i) => !(i >= at && i < at + dark));
    const run = (hours: boolean[]) => {
      const s = lit(hours);
      return windowSummary(s, profileFor(s, 2), 0, 168);
    };
    expect(run(week(48, 10)).power).toBe(true); // 48 h dark, 71% lit
    expect(run(week(49, 10)).power).toBe(false); // one hour too long
    const split = Array.from({ length: 168 }, (_, i) => i % 3 !== 0); // 67% lit, 1 h spells
    expect(run(split).power).toBe(false);
    expect(run(week(0, 0))).toMatchObject({
      sunlitFraction: 1,
      longestDarkHours: 0,
      usableDays: 7,
    });
  });

  it('usable days count hours with Sun and Comms both on', () => {
    const sun = Array.from({ length: 48 }, (_, i) => (i < 36 ? 1 : -1));
    const earth = Array.from({ length: 48 }, (_, i) => (i >= 12 ? 5 : -5));
    const s = site(sun, earth);
    expect(windowSummary(s, profileFor(s, 2), 0, 48).usableDays).toBe(1); // hours 12..35
  });

  it('planner verdicts', () => {
    expect(verdict(false, 6.9, 7)).toBe('red');
    expect(verdict(true, 3.5, 7)).toBe('green');
    expect(verdict(true, 3.4, 7)).toBe('amber');
  });
});

describe('demo scenario on the published data (_shared/concept.md)', () => {
  const load = (id: string): SiteData =>
    JSON.parse(readFileSync(`web/public/data/sites/${id}.json`, 'utf8')) as SiteData;
  const at = (id: string, date: string): string => {
    const s = load(id);
    const w = windowSummary(s, profileFor(s, 2), indexAt(s, new Date(`${date}T00:00:00Z`)), 168);
    return verdict(w.power, w.usableDays, 7);
  };

  it('planned 19 Apr 2028: four sites work', () => {
    for (const id of [
      'connecting-ridge',
      'de-gerlache-rim',
      'peak-near-cabeus-b',
      'peak-near-shackleton',
    ]) {
      expect(at(id, '2028-04-19'), id).toBe('green');
    }
    expect(at('shackleton-rim', '2028-04-19')).toBe('red');
  });

  it('slipped to 22 Apr: three go red, Peak near Shackleton stays green, Shackleton rim turns green', () => {
    for (const id of ['connecting-ridge', 'de-gerlache-rim', 'peak-near-cabeus-b']) {
      expect(at(id, '2028-04-22'), id).toBe('red');
    }
    expect(at('peak-near-shackleton', '2028-04-22')).toBe('green');
    expect(at('shackleton-rim', '2028-04-22')).toBe('green');
  });
});
