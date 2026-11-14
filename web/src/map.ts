// The Map tab: a 3D Moon (three.js) with the 12 sites on it, a layer switcher, a graticule toggle,
// a legend and a site list. The list is also the keyboard and screen-reader path: the canvas itself
// is a picture. three.js and the tiles load only when the tab is first shown, and the WebGL
// context is given back when the tab is left (see globe/globe.ts).
import type { Globe, GlobeSite, LayerId } from './globe/globe';
import type { View } from './globe/math';
import type { PlannedResult } from './planner';
import type { SiteSummary } from './types';

const WORDS = { green: 'works', amber: 'marginal', red: 'no power' } as const;
const SYMBOLS = { green: '●', amber: '▲', red: '✕', none: '○' } as const;
const LAYERS: LayerId[] = ['wac', 'lola', 'hillshade'];
/** What each layer is, shown under the map for the one in use. */
const LAYER_NOTES: Record<LayerId, string> = {
  wac: 'Imagery (WAC): real photographs from the Wide Angle Camera on NASA’s Lunar Reconnaissance Orbiter, joined into one picture of the whole Moon. Near the pole the Sun is always low, so much of the ground is in shadow, and the picture is stretched and streaky in the last few degrees.',
  lola: 'Elevation (LOLA): height measured by the laser altimeter on NASA’s Lunar Reconnaissance Orbiter, coloured by height and shaded. The colours are NASA’s: deep crater floors are violet. Good for the shape of the land, less sharp than the imagery.',
  hillshade:
    'Polar shading: not a photograph. We made it from NASA’s laser-measured elevation model of the pole (240 m per pixel) by lighting the terrain evenly from several directions, so every ridge and crater shows, including floors that never see the Sun. It covers the area about 420 km across around the pole and is the clearest view of the sites.',
};

export interface MapTab {
  /** The planner's answer changed: recolour the markers and the list. */
  setData(sites: SiteSummary[], results: PlannedResult[]): void;
  /** The tab was shown or left. */
  /** The selected site changed (from anywhere): highlight it. */
  setSelected(id: string | null): void;
  setActive(on: boolean): void;
  /** What this person is looking at (shared projects): the layer, the graticule and the camera. */
  getLook(): { layer: LayerId; grid: boolean; cam: View | null };
  /** Show what someone else is looking at. Only the keys given change. */
  setLook(look: { layer?: LayerId; grid?: boolean; cam?: View | null }): void;
}

/** Tells the page when this person changed the layer, the graticule or the camera. */
export interface MapHooks {
  onLook: () => void;
}

const byId = <T extends HTMLElement>(root: HTMLElement, id: string): T => {
  const el = root.querySelector<T>(`#${id}`);
  if (!el) throw new Error(`map: #${id} missing`);
  return el;
};

export function siteText(s: SiteSummary, r: PlannedResult | undefined): string {
  return r?.verdict
    ? `${s.name}: ${WORDS[r.verdict]}, ${r.usableDays.toFixed(1)} usable days`
    : s.name;
}

export function setupMap(
  root: HTMLElement,
  onOpen: (siteId: string) => void,
  onSelect: (siteId: string) => void,
  onAdd: (name: string, lat: number, lon: number) => void,
  onRemove: (siteId: string) => void,
  hooks: MapHooks = { onLook: () => {} },
): MapTab {
  const view = byId(root, 'globe-view');
  const tip = byId(root, 'globe-tip');
  const readout = byId(root, 'globe-readout');
  const fallback = byId(root, 'globe-fallback');
  const layer = byId<HTMLSelectElement>(root, 'globe-layer');
  const grid = byId<HTMLInputElement>(root, 'globe-grid');
  const layerNote = byId(root, 'globe-layer-note');
  const list = byId(root, 'globe-sites');
  const addBtn = byId<HTMLButtonElement>(root, 'globe-add');
  const form = byId<HTMLFormElement>(root, 'globe-add-form');
  const fName = byId<HTMLInputElement>(root, 'globe-add-name');
  const fLat = byId<HTMLInputElement>(root, 'globe-add-lat');
  const fLon = byId<HTMLInputElement>(root, 'globe-add-lon');
  /** A spot picked but not saved yet, drawn as a pin while the form is open. */
  let pending: { lat: number; lon: number } | null = null;

  let sites: SiteSummary[] = [];
  let results: PlannedResult[] = [];
  let globe: Globe | null = null;
  let active = false;
  /** Once the user picks a layer themselves, flying to a site stops switching it. */
  let userPicked = false;
  let token = 0;
  let selected: string | null = null;
  /** The camera last seen (ours or another person's), for when the globe is not showing. */
  let cam: View | null = null;

  // The browser restores form state on reload, so read it rather than assume the defaults.
  const layerNow = (): LayerId =>
    LAYERS.includes(layer.value as LayerId) ? (layer.value as LayerId) : 'wac';

  const pendingSite = (): GlobeSite[] =>
    pending
      ? [
          {
            id: 'pending',
            name: fName.value.trim() || 'New site',
            lat: pending.lat,
            lon: pending.lon,
            verdict: null,
            text: 'New site (not saved yet)',
          },
        ]
      : [];

  const globeSites = (): GlobeSite[] => [
    ...pendingSite(),
    ...sites.map((s) => {
      const r = results.find((x) => x.id === s.id);
      return {
        id: s.id,
        name: s.name,
        lat: s.lat,
        lon: s.lon_e,
        verdict: r?.verdict ?? null,
        text: s.user ? `${s.name}: your site, no data yet` : siteText(s, r),
      };
    }),
  ];

  const setLayer = (id: LayerId, fromUser: boolean): void => {
    if (fromUser) userPicked = true;
    if (layer.value !== id) {
      layer.value = id;
      layer.dispatchEvent(new Event('change'));
    }
  };

  const fly = (id: string): void => {
    const s = sites.find((x) => x.id === id);
    // Near the pole the hillshade is the sharpest picture we have, so show it unless the user chose.
    if (s && s.lat < -83 && !userPicked) setLayer('hillshade', false);
    onSelect(id);
    globe?.flyToSite(id);
  };

  function drawList(): void {
    const rows = sites.map((s) => {
      const r = results.find((x) => x.id === s.id);
      const v = r?.verdict ?? null;
      const word = v ? WORDS[v] : s.user ? 'your site, no data yet' : 'no result';
      return {
        id: s.id,
        name: s.name,
        v,
        note: v && r ? `${word}, ${r.usableDays.toFixed(1)} d` : word,
        label: s.user ? `${s.name}: your site, no data yet` : siteText(s, r),
        mine: !!s.user,
      };
    });
    list.replaceChildren(
      ...rows.map((row) => {
        const li = document.createElement('li');
        li.className = `globe-site ${row.v ?? 'none'}${row.mine ? ' mine' : ''}`;
        li.dataset.site = row.id;
        li.classList.toggle('selected', row.id === selected);
        const go = document.createElement('button');
        go.type = 'button';
        go.className = 'globe-fly';
        go.setAttribute('aria-label', `Fly to ${row.label}`);
        if (row.id === selected) go.setAttribute('aria-current', 'true');
        const sym = document.createElement('span');
        sym.className = 'sym';
        sym.setAttribute('aria-hidden', 'true');
        sym.textContent = SYMBOLS[row.v ?? 'none'];
        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = row.name;
        const note = document.createElement('span');
        note.className = 'note';
        note.textContent = row.note;
        go.append(sym, name, note);
        go.addEventListener('click', () => fly(row.id));
        const act = document.createElement('button');
        act.type = 'button';
        act.className = 'globe-open';
        act.textContent = 'Open chart';
        act.setAttribute('aria-label', `Open the chart for ${row.name}`);
        act.addEventListener('click', () => onOpen(row.id));
        const extra: HTMLButtonElement[] = [];
        if (row.mine) {
          const x = document.createElement('button');
          x.type = 'button';
          x.className = 'globe-open globe-x';
          x.textContent = '×';
          x.title = `Remove ${row.name}`;
          x.setAttribute('aria-label', `Remove ${row.name}`);
          x.addEventListener('click', () => onRemove(row.id));
          extra.push(x);
        }
        for (const b of [go, act, ...extra]) {
          b.addEventListener('pointerenter', () => globe?.highlight(row.id));
          b.addEventListener('pointerleave', () => globe?.highlight(null));
          b.addEventListener('focus', () => globe?.highlight(row.id));
          b.addEventListener('blur', () => globe?.highlight(null));
        }
        li.append(go, act, ...extra);
        return li;
      }),
    );
  }

  // ── Add a site: click the Moon (or type a position), name it, save it in this browser ──
  const pinMoved = (): void => globe?.setSites(globeSites());
  const closeForm = (): void => {
    form.hidden = true;
    pending = null;
    addBtn.setAttribute('aria-pressed', 'false');
    globe?.setPicking(false);
    pinMoved();
  };
  addBtn.addEventListener('click', () => {
    if (!form.hidden) return closeForm();
    form.hidden = false;
    addBtn.setAttribute('aria-pressed', 'true');
    globe?.setPicking(true);
    fName.focus();
  });
  byId(root, 'globe-add-cancel').addEventListener('click', closeForm);
  const typed = (): void => {
    const lat = parseFloat(fLat.value);
    const lon = parseFloat(fLon.value);
    pending = Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
    pinMoved();
  };
  for (const f of [fLat, fLon, fName]) f.addEventListener('input', typed);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const lat = parseFloat(fLat.value);
    const lon = parseFloat(fLon.value);
    const name = fName.value.trim();
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    fName.value = fLat.value = fLon.value = '';
    closeForm();
    onAdd(name, lat, lon);
  });

  async function start(): Promise<void> {
    const mine = ++token;
    let mod: typeof import('./globe/globe');
    try {
      mod = await import('./globe/globe');
    } catch {
      fallback.hidden = false;
      fallback.textContent = 'The 3D map could not load. The site list still works.';
      return;
    }
    if (mine !== token || !active) return;
    try {
      globe = new mod.Globe({
        container: view,
        tip,
        readout,
        layer: layerNow(),
        grid: grid.checked,
        // A click on a marker only selects the site: the user can already see it, and zooms or
        // turns the Moon themselves. The list's site buttons are the ones that fly.
        onOpen: onSelect,
        onCamera: (v) => {
          cam = v;
          hooks.onLook();
        },
        onPick: (lat, lon) => {
          fLat.value = lat.toFixed(4);
          fLon.value = lon.toFixed(4);
          typed();
          fName.focus();
        },
        onHover: (id) => {
          for (const li of list.children)
            li.classList.toggle('hot', (li as HTMLElement).dataset.site === id);
        },
      });
    } catch {
      globe = null;
      fallback.hidden = false;
      fallback.textContent =
        'The 3D map needs WebGL, which this browser or device does not offer. The site list below still works: open any site’s chart from it.';
      return;
    }
    fallback.hidden = true;
    globe.setSites(globeSites());
    globe.setSelected(selected);
    globe.setPicking(!form.hidden);
    if (cam) globe.setView(cam);
  }

  function stop(): void {
    token++;
    globe?.destroy();
    globe = null;
    readout.textContent = 'Cursor: move over the Moon';
  }

  const showLayerNote = (): void => {
    layerNote.textContent = LAYER_NOTES[layerNow()];
  };
  showLayerNote();
  layer.addEventListener('change', () => {
    showLayerNote();
    globe?.setLayer(layerNow());
    hooks.onLook();
  });
  // A click on one of the layer buttons is the user's own choice; our own setLayer is not.
  byId(root, 'globe-controls').addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.segmented button')) userPicked = true;
  });
  grid.addEventListener('change', () => {
    globe?.setGrid(grid.checked);
    hooks.onLook();
  });
  byId(root, 'globe-zoom-in').addEventListener('click', () => globe?.zoomBy(0.5));
  byId(root, 'globe-zoom-out').addEventListener('click', () => globe?.zoomBy(2));
  byId(root, 'globe-moon').addEventListener('click', () => globe?.goTo('moon'));
  byId(root, 'globe-pole').addEventListener('click', () => globe?.goTo('pole'));

  // Colours change with the theme.
  new MutationObserver(() => globe?.refreshTheme()).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  return {
    setData(s, r) {
      sites = s;
      results = r;
      drawList();
      globe?.setSites(globeSites());
    },
    setSelected(id) {
      selected = id;
      for (const li of list.children) {
        const on = (li as HTMLElement).dataset.site === id;
        li.classList.toggle('selected', on);
        li.querySelector('.globe-fly')?.toggleAttribute('aria-current', on);
      }
      globe?.setSelected(id);
    },
    getLook() {
      return { layer: layerNow(), grid: grid.checked, cam };
    },
    setLook(look) {
      if (look.layer && LAYERS.includes(look.layer)) setLayer(look.layer, false);
      if (look.grid !== undefined && grid.checked !== look.grid) {
        grid.checked = look.grid;
        globe?.setGrid(look.grid);
      }
      if (look.cam !== undefined) {
        cam = look.cam;
        if (cam) globe?.setView(cam);
      }
    },
    setActive(on) {
      if (on === active) return;
      active = on;
      if (on) void start();
      else stop();
    },
  };
}
