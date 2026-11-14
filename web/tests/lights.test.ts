// The rules in _shared/concept.md, on hand-built data with known answers, and the demo scenario
// on the real published files (so a data or rule change that breaks the demo fails the build).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRESETS, darkEnduranceHours, simulateBattery } from '../src/battery';
import { indexAt, lightsAt, profileFor, terrainAt, windowSummary } from '../src/lights';
import { answerText, verdict } from '../src/planner';
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
    expect(lightsAt(s, h, 0)).toMatchObject({ sun: true, earth: true, comms: false });
    expect(lightsAt(s, h, 1)).toMatchObject({ sun: false, earth: true, comms: true });
    expect(lightsAt(s, h, 2)).toMatchObject({
      sun: true,
      earth: true,
      comms: true,
      stations: null,
    });
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

  it('Canberra Link: Comms also needs a DSN station that sees the Moon', () => {
    const s = site([1, 1, 1], [5, 5, 5]);
    s.stations = [0, 2, 5]; // none; Canberra; Goldstone + Madrid
    const h = profileFor(s, 2);
    expect(lightsAt(s, h, 0)).toMatchObject({ earth: true, comms: false, stations: [] });
    expect(lightsAt(s, h, 1)).toMatchObject({ comms: true, stations: ['canberra'] });
    expect(lightsAt(s, h, 2)).toMatchObject({ comms: true, stations: ['goldstone', 'madrid'] });
    expect(windowSummary(s, h, 0, 3).usableDays).toBe(0.1); // 2 of 3 hours
  });

  it('the planner answers in a sentence', () => {
    const text = answerText(
      [
        { id: 'a', name: 'A', verdict: 'green', usableDays: 5.2 },
        { id: 'b', name: 'B', verdict: 'red', usableDays: 4.5 },
        { id: 'c', name: 'C', verdict: 'green', usableDays: 7 },
        { id: 'd', name: 'D', verdict: 'amber', usableDays: 1 },
      ],
      new Date('2028-04-22T00:00:00Z'),
      7,
    );
    expect(text).toBe(
      'Landing 22 Apr 2028, 7-day window: 2 of 4 sites work: C (7.0 usable days), A (5.2 usable days). Marginal: D. 1 without power.',
    );
  });

  it('planner verdicts', () => {
    expect(verdict(false, 6.9, 7)).toBe('red');
    expect(verdict(true, 3.5, 7)).toBe('green');
    expect(verdict(true, 3.4, 7)).toBe('amber');
  });
});

describe('Survive the Night', () => {
  const small = PRESETS[0];
  if (!small) throw new Error('no presets');
  const run = (lit: boolean[]) => {
    const s = site(
      lit.map((x) => (x ? 1 : -1)),
      lit.map(() => 5),
    );
    return simulateBattery(s, profileFor(s, 2), 0, lit.length, small);
  };

  it('a full battery lasts exactly its dark endurance', () => {
    const e = darkEnduranceHours(small); // 3000 Wh / 60 W = 50 h
    expect(e).toBe(50);
    expect(run(new Array<boolean>(49).fill(false))).toMatchObject({ survives: true, flatHours: 0 });
    const r = run(new Array<boolean>(52).fill(false));
    expect(r.survives).toBe(false);
    expect(r.firstFlat).toBe(49); // empty at the end of the 50th hour
    expect(r.flatHours).toBe(3);
  });

  it('charges with the surplus in sunlight and never above full', () => {
    const r = run([false, false, false, false, false, true, true]); // -300 Wh, then +300 Wh/h
    expect(r.soc[4]).toBeCloseTo(0.9);
    expect(r.soc[5]).toBeCloseTo(1);
    expect(r.soc[6]).toBe(1);
    expect(r.minSoc).toBeCloseTo(0.9);
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
