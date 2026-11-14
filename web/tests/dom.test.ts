// @vitest-environment happy-dom
// The drawing and control code against a simulated DOM: what gets drawn, not how it looks.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PRESETS, renderBattery, simulateBattery } from '../src/battery';
import { renderChart } from '../src/chart';
import { infoTip, lightIcon, upgradeIcons, upgradeInfoTips } from '../src/icons';
import { profileFor } from '../src/lights';
import { segmented, syncSegmented } from '../src/segmented';
import { key, setupShortcuts, type Shortcut } from '../src/shortcuts';
import type { SiteData } from '../src/types';

const NS = 'http://www.w3.org/2000/svg';
const svg = (): SVGSVGElement => document.createElementNS(NS, 'svg');

/** 48 hours; the Sun is above a level horizon for the first day and well below it after. */
function site(): SiteData {
  const n = 48;
  return {
    id: 't',
    site: { lat: -89, lon_e: 0, elev_m: 0 },
    horizons: [{ height_m: 2, step_deg: 0.5, elev_deg: new Array<number>(720).fill(0) }],
    times: { start_utc: '2028-01-01T00:00:00Z', step_min: 60, n },
    sun: {
      az: Array.from({ length: n }, (_, i) => 10 + i),
      el: Array.from({ length: n }, (_, i) => (i < 24 ? 1 : -2)),
    },
    earth: { az: new Array<number>(n).fill(200), el: new Array<number>(n).fill(5) },
    meta: { dem_rings: [], ephem: 'fake', frame: 'MOON_ME', built_utc: '' },
  };
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe('Sun-Path Chart', () => {
  it('draws the skyline, both tracks and both markers, with the range taken from the data', () => {
    const s = site();
    const el = svg();
    renderChart(el, {
      site: s,
      profile: profileFor(s, 2),
      start: 0,
      end: 48,
      cursor: 0,
      centreAz: 0,
    });
    expect(el.querySelectorAll('polygon.terrain')).toHaveLength(1);
    expect(el.querySelectorAll('path.track')).toHaveLength(2);
    expect(el.querySelectorAll('circle.marker')).toHaveLength(2);
    expect(el.querySelector('polygon.terrain')?.getAttribute('points')?.split(' ').length).toBe(
      720 * 2 + 2,
    );
    const ticks = [...el.querySelectorAll('text.tick')].map((t) => t.textContent);
    expect(ticks).toContain('N');
    expect(ticks).toContain('5°'); // Earth reaches 5°, so the axis does too
    expect(ticks.some((t) => t?.includes('observer 2 m'))).toBe(true);
  });

  it('fades and names a body that is behind the terrain', () => {
    const s = site();
    const el = svg();
    renderChart(el, {
      site: s,
      profile: profileFor(s, 2),
      start: 0,
      end: 48,
      cursor: 30,
      centreAz: 0,
    });
    expect(el.querySelector('circle.marker.sun')?.getAttribute('class')).toContain('hidden');
    expect(el.querySelector('text.label.sun')?.textContent).toBe('Sun (hidden)');
    expect(el.querySelector('circle.marker.earth')?.getAttribute('class')).not.toContain('hidden');
    expect(el.querySelector('text.label.earth')?.textContent).toBe('Earth');
  });
});

describe('battery strip', () => {
  it('shades the dark spell and colours the charge by the outcome', () => {
    const s = site();
    const preset = PRESETS[0];
    if (!preset) throw new Error('no presets');
    const el = svg();
    const run = simulateBattery(s, profileFor(s, 2), 0, 48, preset);
    renderBattery(el, run, 5);
    expect(el.querySelectorAll('rect.dark-spell')).toHaveLength(1);
    expect(el.querySelector('polygon.soc')?.getAttribute('class')).toContain('ok');
    expect(el.querySelectorAll('line.soc-cursor')).toHaveLength(1);
    const flat = simulateBattery(s, profileFor(s, 2), 0, 48, { ...preset, batteryWh: 100 });
    renderBattery(el, flat, 5);
    expect(el.querySelector('polygon.soc')?.getAttribute('class')).toContain('flat');
  });
});

describe('icons and info tips', () => {
  it('gives each light a different icon for on and off', () => {
    for (const name of ['sun', 'earth', 'power', 'comms'] as const) {
      expect(lightIcon(name, true).outerHTML).not.toBe(lightIcon(name, false).outerHTML);
      expect(lightIcon(name, true).getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('builds an info button whose label carries the text, and upgrades data-info once', () => {
    const tip = infoTip('From NASA.');
    expect(tip.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Where this comes from: From NASA.',
    );
    expect(tip.querySelector('[role="tooltip"]')?.textContent).toBe('From NASA.');
    document.body.innerHTML =
      '<h2 data-info="LOLA terrain.">Chart</h2><span data-icon="sun"></span>';
    upgradeInfoTips();
    upgradeInfoTips();
    upgradeIcons();
    expect(document.querySelectorAll('h2 .info')).toHaveLength(1);
    expect(document.querySelector('[data-icon] svg')).not.toBeNull();
  });
});

describe('button groups', () => {
  it('mirror a select: clicks set it, and changes to it move the pressed button', () => {
    document.body.innerHTML =
      '<label>Observer height (m) <select id="h"><option value="1">1</option><option value="2" selected>2</option><option value="5">5</option></select></label>';
    const select = document.getElementById('h') as HTMLSelectElement;
    const changes: string[] = [];
    select.addEventListener('change', () => changes.push(select.value));
    segmented(select);
    const pressed = () =>
      document.querySelector('.segmented button[aria-pressed="true"]')?.textContent;
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('.segmented button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['1', '2', '5']);
    expect(buttons[2]?.getAttribute('aria-label')).toBe('Observer height (m): 5');
    expect(pressed()).toBe('2');
    buttons[2]?.click();
    expect(select.value).toBe('5');
    expect(changes).toEqual(['5']);
    buttons[2]?.click(); // already chosen: no second change
    expect(changes).toEqual(['5']);
    select.value = '1';
    syncSegmented();
    expect(pressed()).toBe('1');
    expect(select.hidden).toBe(true);
  });
});

describe('keyboard shortcuts', () => {
  function setup() {
    document.body.innerHTML =
      '<input id="box" /><button data-open-shortcuts>Keys</button><dialog id="d"><div class="shortcut-list"></div></dialog>';
    const dialog = document.getElementById('d') as HTMLDialogElement;
    dialog.showModal = vi.fn(() => dialog.setAttribute('open', ''));
    dialog.close = vi.fn(() => dialog.removeAttribute('open'));
    const ran: string[] = [];
    const list: Shortcut[] = [
      {
        group: 'Planner',
        keys: [']'],
        what: 'Slip a day',
        match: key(']'),
        run: () => ran.push(']'),
      },
      { group: 'Page', keys: ['T'], what: 'Theme', match: key('t', 'T'), run: () => ran.push('t') },
    ];
    setupShortcuts(list, dialog);
    const press = (k: string, init: KeyboardEventInit = {}, target: EventTarget = document) =>
      target.dispatchEvent(
        new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }),
      );
    return { dialog, ran, press };
  }

  it('runs a shortcut, but not with Ctrl held or while typing in a field', () => {
    const { ran, press } = setup();
    press(']');
    press('T');
    press(']', { ctrlKey: true });
    press(']', {}, document.getElementById('box') as HTMLElement);
    expect(ran).toEqual([']', 't']);
  });

  it('lists every shortcut in the help, and opens it with Ctrl+/, ? or the button', () => {
    const { dialog, ran, press } = setup();
    const help = dialog.querySelector('.shortcut-list')?.textContent ?? '';
    for (const text of ['Slip a day', 'Theme', 'Show or hide this help', 'Planner', 'Page'])
      expect(help).toContain(text);
    press('/', { ctrlKey: true });
    expect(dialog.showModal).toHaveBeenCalledTimes(1);
    press(']'); // ignored while the help is open
    expect(ran).toEqual([]);
    press('?');
    expect(dialog.close).toHaveBeenCalledTimes(1);
    (document.querySelector('[data-open-shortcuts]') as HTMLElement).click();
    expect(dialog.showModal).toHaveBeenCalledTimes(2);
  });
});
