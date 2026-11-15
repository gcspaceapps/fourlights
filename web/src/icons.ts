// Icons: Phosphor Icons (MIT licence, https://phosphoricons.com), bundled from the npm package.
// Filled = the light is on; outline = off. Never the only signal: each card also says ON or OFF.
import broadcastOn from '@phosphor-icons/core/assets/fill/broadcast-fill.svg?raw';
import earthOn from '@phosphor-icons/core/assets/fill/globe-hemisphere-west-fill.svg?raw';
import panelOn from '@phosphor-icons/core/assets/fill/solar-panel-fill.svg?raw';
import sunOn from '@phosphor-icons/core/assets/fill/sun-fill.svg?raw';
import chartLine from '@phosphor-icons/core/assets/regular/chart-line.svg?raw';
import earthOff from '@phosphor-icons/core/assets/regular/globe-hemisphere-west.svg?raw';
import infoIcon from '@phosphor-icons/core/assets/regular/info.svg?raw';
import keyboardIcon from '@phosphor-icons/core/assets/regular/keyboard.svg?raw';
import moonIcon from '@phosphor-icons/core/assets/regular/moon.svg?raw';
import sunIcon from '@phosphor-icons/core/assets/regular/sun.svg?raw';
import panelOff from '@phosphor-icons/core/assets/regular/solar-panel.svg?raw';
import sunOff from '@phosphor-icons/core/assets/regular/sun-horizon.svg?raw';
import broadcastOff from '@phosphor-icons/core/assets/regular/wifi-slash.svg?raw';

export type LightName = 'sun' | 'earth' | 'power' | 'comms';

const LIGHT_ICONS: Record<LightName, { on: string; off: string }> = {
  sun: { on: sunOn, off: sunOff }, // off: the Sun behind the horizon
  earth: { on: earthOn, off: earthOff },
  power: { on: panelOn, off: panelOff }, // a lit solar panel, or a dark one
  comms: { on: broadcastOn, off: broadcastOff }, // a live link, or no signal
};

function svg(raw: string, cls: string): SVGElement {
  const doc = new DOMParser().parseFromString(raw, 'image/svg+xml');
  const el = doc.documentElement as unknown as SVGElement;
  el.setAttribute('class', cls);
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('focusable', 'false');
  return document.importNode(el, true);
}

/** The "open its chart" icon, for a button that carries its own accessible name. */
export function chartIcon(): SVGElement {
  return svg(chartLine, 'ui-icon');
}

export function lightIcon(name: LightName, on: boolean): SVGElement {
  return svg(LIGHT_ICONS[name][on ? 'on' : 'off'], 'light-icon');
}

/**
 * A small "i" button that shows where something comes from: on hover, keyboard focus or tap.
 * The text is also the button's accessible description.
 */
export function infoTip(text: string): HTMLSpanElement {
  const wrap = document.createElement('span');
  wrap.className = 'info';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('aria-label', `Where this comes from: ${text}`);
  btn.appendChild(svg(infoIcon, 'info-icon'));
  const tip = document.createElement('span');
  tip.className = 'tip';
  tip.setAttribute('role', 'tooltip');
  tip.textContent = text;
  wrap.append(btn, tip);
  return wrap;
}

/** Turn every `data-info="..."` attribute in the page into an info button after that element's text. */
export function upgradeInfoTips(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-info]')) {
    const text = el.dataset.info;
    if (!text || el.querySelector(':scope > .info')) continue;
    el.appendChild(infoTip(text));
  }
}

const UI_ICONS: Record<string, string> = { keyboard: keyboardIcon, moon: moonIcon, sun: sunIcon };

/** Fill every `data-icon="name"` placeholder in the page with its icon. */
export function upgradeIcons(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-icon]')) {
    const raw = UI_ICONS[el.dataset.icon ?? ''];
    if (raw && !el.firstChild) el.appendChild(svg(raw, 'ui-icon'));
  }
}
