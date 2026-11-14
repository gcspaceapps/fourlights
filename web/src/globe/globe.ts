// The 3D Moon: a three.js scene with Moon Trek tiles, the polar hillshade patch, a lat/lon
// graticule and the 12 site markers. Custom controls (OrbitControls cannot approach the surface
// smoothly), render on demand, and a destroy() that gives everything back.
import * as THREE from 'three';
import {
  cameraPose,
  clamp,
  D_MAX,
  D_MIN,
  DEG,
  facesCamera,
  flightAt,
  graticulePlan,
  hillshadeGeometry,
  latLabel,
  lonLabel,
  nearestMarker,
  pan,
  PITCH_MAX,
  polarBearing,
  rayUnitSphere,
  SHORT_HOP,
  spriteScale,
  surf,
  wrapLon,
  angleBetween,
  type LodView,
  type TileLayerId,
  type Vec3,
  type View,
} from './math';
import { TileLayer } from './tiles';

export type LayerId = TileLayerId | 'hillshade';
export type MarkerVerdict = 'green' | 'amber' | 'red' | null;

export interface GlobeSite {
  id: string;
  name: string;
  lat: number;
  lon: number;
  verdict: MarkerVerdict;
  /** The words a screen reader and the tooltip use, e.g. "Haworth: works, 6.5 usable days". */
  text: string;
}

export interface GlobeOptions {
  container: HTMLElement;
  tip: HTMLElement;
  readout: HTMLElement;
  layer: LayerId;
  grid: boolean;
  /** A marker was clicked: open that site's chart. */
  /** A marker was clicked. */
  onOpen: (id: string) => void;
  /** The pointer moved on or off a marker. */
  onHover: (id: string | null) => void;
  /** In add-a-site mode: an empty spot on the Moon was clicked. */
  onPick?: (lat: number, lon: number) => void;
  /** The camera moved because of this person (not the idle spin, not another person's move). */
  onCamera?: (view: View) => void;
}

const FOV = 45;
const FOV_RAD = FOV * DEG;
const MARKER_PX = 20;
const LABEL_PX = 16;
const HILLSHADE_URL = '/map/south-pole-hillshade.jpg';
/** Labels show below this distance (Moon radii), or for a highlighted site. */
const LABEL_D = 0.9;
const SPIN_DEG_PER_S = 3;
const INITIAL: View = { lon: 0, lat: -62, D: 1.7, bearing: 0, pitch: 0 };

/** Last camera, so coming back to the tab resumes where the user left. */
let saved: View | null = null;

interface Marker {
  site: GlobeSite;
  unit: Vec3;
  sprite: THREE.Sprite;
  label: THREE.Sprite | null;
}

const cssColour = (name: string, fallback: string): string => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A canvas of the wanted pixel size drawn at device-pixel resolution. */
function canvas(w: number, h: number, ratio = 2): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * ratio);
  c.height = Math.ceil(h * ratio);
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  g.scale(ratio, ratio);
  return [c, g];
}

function textureOf(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 1;
  return t;
}

/** One marker per verdict, each a different shape so colour is never the only cue. */
function markerTexture(verdict: MarkerVerdict, fill: string): THREE.CanvasTexture {
  const S = 40;
  const [c, g] = canvas(S, S);
  const m = S / 2;
  g.lineJoin = 'round';
  g.lineWidth = 5;
  g.strokeStyle = '#06080d';
  g.fillStyle = fill;
  g.beginPath();
  if (verdict === 'green') {
    g.arc(m, m, 12, 0, Math.PI * 2);
  } else if (verdict === 'amber') {
    g.moveTo(m, m - 14);
    g.lineTo(m + 14, m + 11);
    g.lineTo(m - 14, m + 11);
    g.closePath();
  } else if (verdict === 'red') {
    const r = 11;
    g.moveTo(m - r, m - r);
    g.lineTo(m + r, m + r);
    g.moveTo(m + r, m - r);
    g.lineTo(m - r, m + r);
    g.lineWidth = 11;
    g.stroke();
    g.lineWidth = 6;
    g.strokeStyle = fill;
    g.stroke();
    return textureOf(c);
  } else {
    g.arc(m, m, 10, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 3;
    g.strokeStyle = fill;
    g.stroke();
    return textureOf(c);
  }
  g.stroke();
  g.fill();
  return textureOf(c);
}

function ringTexture(): THREE.CanvasTexture {
  const S = 56;
  const [c, g] = canvas(S, S);
  g.lineWidth = 4;
  g.strokeStyle = '#ffffff';
  g.beginPath();
  g.arc(S / 2, S / 2, 22, 0, Math.PI * 2);
  g.stroke();
  return textureOf(c);
}

function crossTexture(): THREE.CanvasTexture {
  const S = 24;
  const [c, g] = canvas(S, S);
  g.lineCap = 'round';
  for (const [w, col] of [
    [5, '#06080d'],
    [2, '#ffffff'],
  ] as const) {
    g.lineWidth = w;
    g.strokeStyle = col;
    g.beginPath();
    g.moveTo(3, S / 2);
    g.lineTo(S - 3, S / 2);
    g.moveTo(S / 2, 3);
    g.lineTo(S / 2, S - 3);
    g.stroke();
  }
  return textureOf(c);
}

interface TextSprite {
  tex: THREE.CanvasTexture;
  aspect: number;
}

export class Globe {
  private readonly opts: GlobeOptions;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 1e-4, 300);
  private readonly overlay = new THREE.Group();
  private readonly gridGroup = new THREE.Group();
  private readonly gridLines = new THREE.LineSegments();
  private readonly gridLabels: THREE.Sprite[] = [];
  private readonly poleRings: THREE.LineLoop[] = [];
  private readonly poleLabels: THREE.Sprite[] = [];
  private poleCross: THREE.Sprite | null = null;
  private readonly textCache = new Map<string, TextSprite>();
  private readonly markerTextures = new Map<string, THREE.CanvasTexture>();
  private readonly ringTex = ringTexture();
  private readonly ring: THREE.Sprite;
  private readonly selRing: THREE.Sprite;
  private selectedId: string | null = null;
  private picking = false;
  private markers: Marker[] = [];
  private hillshade: THREE.Mesh | null = null;
  private hillshadeTex: THREE.Texture | null = null;
  private baseLayer: TileLayer | null = null;
  private retiring: TileLayer | null = null;
  private retireTimer = 0;
  private layerSerial = 0;
  private readonly abort = new AbortController();
  private readonly observer: ResizeObserver;
  private readonly reduced: boolean;
  private readonly frustum = new THREE.Frustum();
  private readonly pv = new THREE.Matrix4();
  private readonly raycaster = new THREE.Raycaster();

  private view: View;
  private targetD: number;
  private flight: { from: View; to: View; t: number; dur: number } | null = null;
  private spinning: boolean;
  /** True while the camera is following someone else's: it must not be reported back. */
  private quiet = false;
  private reported = '';
  private raf = 0;
  private running = false;
  private last = 0;
  private dead = false;
  private w = 1;
  private h = 1;
  private highlightId: string | null = null;
  private hoverId: string | null = null;
  private gridKey = '';
  private gridAt = 0;
  private gridTimer = 0;

  private pointers = new Map<number, { x: number; y: number }>();
  private pinch = 0;
  private drag: { mode: 'pan' | 'rotate'; sx: number; sy: number; moved: boolean } | null = null;

  constructor(opts: GlobeOptions) {
    this.opts = opts;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.spinning = !this.reduced && !saved;
    this.view = { ...(saved ?? INITIAL) };
    this.targetD = this.view.D;

    // Throws when WebGL is unavailable; the caller shows a message.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x02030a, 1);
    const el = this.renderer.domElement;
    el.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none';
    el.setAttribute('aria-hidden', 'true');
    opts.container.appendChild(el);

    this.scene.add(this.makeStars());
    // Hides overlays behind the limb; draws nothing.
    const occluder = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 32),
      new THREE.MeshBasicMaterial({ colorWrite: false }),
    );
    occluder.renderOrder = -10;
    occluder.frustumCulled = false;
    this.scene.add(occluder);

    this.scene.add(this.overlay);
    this.overlay.add(this.gridGroup);
    this.buildGridParts();
    this.buildPoleMarks();
    this.ring = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.ringTex,
        depthTest: false,
        depthWrite: false,
        sizeAttenuation: false,
        transparent: true,
      }),
    );
    this.ring.renderOrder = 2100;
    this.ring.visible = false;
    this.overlay.add(this.ring);
    this.selRing = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.ringTex,
        color: 0xffc233,
        depthTest: false,
        depthWrite: false,
        sizeAttenuation: false,
        transparent: true,
      }),
    );
    this.selRing.renderOrder = 2099;
    this.selRing.visible = false;
    this.overlay.add(this.selRing);

    this.setLayer(opts.layer);
    this.setGrid(opts.grid);

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(opts.container);
    this.bind();
    this.resize();
  }

  // ─────────────────────────────── public API ───────────────────────────────

  setSites(sites: GlobeSite[]): void {
    for (const m of this.markers) this.removeMarker(m);
    this.markers = sites.map((site) => {
      const sprite = new THREE.Sprite(this.markerMaterial(site.verdict));
      sprite.renderOrder = 2000;
      this.overlay.add(sprite);
      const label = this.textSprite(site.name, `600 ${LABEL_PX - 2}px system-ui, sans-serif`, 3);
      const ls = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: label.tex,
          depthTest: false,
          depthWrite: false,
          sizeAttenuation: false,
          transparent: true,
        }),
      );
      ls.renderOrder = 2001;
      ls.userData = { aspect: label.aspect };
      ls.visible = false;
      this.overlay.add(ls);
      return { site, unit: surf(site.lon, site.lat), sprite, label: ls };
    });
    this.invalidate();
  }

  setLayer(id: LayerId): void {
    const base: TileLayerId = id === 'lola' ? 'lola' : 'wac';
    if (this.baseLayer?.layer !== base) {
      if (this.retiring) {
        this.retiring.dispose();
        this.retiring = null;
      }
      const old = this.baseLayer;
      this.baseLayer = new TileLayer(base, (this.layerSerial++ % 2) * 20, () => this.invalidate());
      this.scene.add(this.baseLayer.group);
      if (old) {
        // Keep the old imagery under the new until the new has filled in (or 5 s).
        this.retiring = old;
        window.clearTimeout(this.retireTimer);
        this.retireTimer = window.setTimeout(() => this.retire(true), 5000);
      }
    }
    if (id === 'hillshade') this.ensureHillshade();
    if (this.hillshade) this.hillshade.visible = id === 'hillshade';
    this.invalidate();
  }

  setGrid(on: boolean): void {
    this.gridGroup.visible = on;
    for (const ring of this.poleRings) ring.visible = on;
    this.invalidate();
  }

  /** Add-a-site mode: clicks on the Moon report a position instead of doing nothing. */
  setPicking(on: boolean): void {
    this.picking = on;
    this.renderer.domElement.style.cursor = on ? 'crosshair' : 'grab';
  }

  /** The selected site keeps a gold ring and its label, whatever else is hovered. */
  setSelected(id: string | null): void {
    this.selectedId = id;
    this.invalidate();
  }

  highlight(id: string | null): void {
    this.highlightId = id;
    this.invalidate();
  }

  flyToSite(id: string): void {
    const m = this.markers.find((k) => k.site.id === id);
    if (!m) return;
    const { lon, lat } = m.site;
    const to: View = {
      lon,
      lat,
      D: Math.min(this.view.D, 0.08),
      bearing: this.view.bearing,
      pitch: 0,
    };
    // A long way off, end with 0°E up over the pole; a short hop keeps the heading, so no spin.
    const far = angleBetween(surf(this.view.lon, this.view.lat), surf(lon, lat)) >= SHORT_HOP;
    if (far && lat < -80) to.bearing = polarBearing(lon);
    this.startFlight(to);
  }

  /** Zoom by a factor (< 1 zooms in) as the buttons do. */
  zoomBy(factor: number): void {
    this.interacted();
    this.targetD = clamp(this.targetD * factor, D_MIN, D_MAX);
    this.invalidate();
  }

  /** Back to the whole Moon, or down onto the south pole. */
  goTo(where: 'moon' | 'pole'): void {
    this.interacted();
    this.startFlight(
      where === 'moon' ? { ...INITIAL } : { lon: 0, lat: -88, D: 0.5, bearing: 0, pitch: 0 },
    );
  }

  /** Another person moved the camera: glide to where they are. Not reported back. */
  setView(v: View): void {
    this.startFlight({ ...v }, true);
  }

  /** Re-read the theme's colours (markers). */
  refreshTheme(): void {
    for (const t of this.markerTextures.values()) t.dispose();
    this.markerTextures.clear();
    for (const m of this.markers) m.sprite.material = this.markerMaterial(m.site.verdict);
    this.invalidate();
  }

  /** For tests and the status line: the camera, and how many textures are held. */
  get state(): { view: View; textures: number } {
    return { view: { ...this.view }, textures: this.baseLayer?.textureCount ?? 0 };
  }

  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    saved = { ...this.view };
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.retireTimer);
    window.clearTimeout(this.gridTimer);
    this.abort.abort();
    this.observer.disconnect();
    this.baseLayer?.dispose();
    this.retiring?.dispose();
    this.scene.traverse((o) => {
      const any = o as THREE.Mesh;
      any.geometry?.dispose();
      const mats = Array.isArray(any.material) ? any.material : any.material ? [any.material] : [];
      for (const m of mats) {
        const mm = m as THREE.Material & {
          map?: THREE.Texture | null;
          alphaMap?: THREE.Texture | null;
        };
        mm.map?.dispose();
        mm.alphaMap?.dispose();
        mm.dispose();
      }
    });
    for (const t of this.markerTextures.values()) t.dispose();
    for (const t of this.textCache.values()) t.tex.dispose();
    this.ringTex.dispose();
    this.hillshadeTex?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.opts.tip.hidden = true;
  }

  // ─────────────────────────────── scene parts ───────────────────────────────

  private makeStars(): THREE.Points {
    const rnd = mulberry32(42);
    const pos: number[] = [];
    for (let i = 0; i < 1800; i++) {
      const z = rnd() * 2 - 1;
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - z * z);
      pos.push(r * Math.cos(a) * 90, z * 90, r * Math.sin(a) * 90);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const pts = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 1.6,
        sizeAttenuation: false,
        depthWrite: false,
        opacity: 0.85,
        transparent: false,
      }),
    );
    pts.renderOrder = -20;
    pts.frustumCulled = false;
    return pts;
  }

  private buildGridParts(): void {
    this.gridLines.material = new THREE.LineBasicMaterial({
      color: 0xdfe9ff,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    this.gridLines.renderOrder = 1500;
    this.gridLines.frustumCulled = false;
    this.gridLines.geometry = new THREE.BufferGeometry();
    this.gridGroup.add(this.gridLines);
  }

  /** The 84, 86 and 88°S circles and their labels (shown with the grid) and the pole cross (always on). */
  private buildPoleMarks(): void {
    for (const lat of [-84, -86, -88]) {
      const pts: number[] = [];
      for (let i = 0; i < 180; i++) pts.push(...surf((i * 360) / 180, lat));
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const ringLine = new THREE.LineLoop(
        geo,
        new THREE.LineBasicMaterial({
          color: 0xffd9a0,
          transparent: true,
          opacity: 0.6,
          depthWrite: false,
        }),
      );
      ringLine.renderOrder = 1501;
      ringLine.frustumCulled = false;
      this.overlay.add(ringLine);
      this.poleRings.push(ringLine);
      const t = this.textSprite(`${-lat}°S`, '600 12px ui-monospace, monospace', 3);
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: t.tex,
          depthTest: false,
          depthWrite: false,
          sizeAttenuation: false,
          transparent: true,
        }),
      );
      s.position.set(...surf(180, lat));
      s.renderOrder = 2002;
      s.userData = { aspect: t.aspect };
      this.overlay.add(s);
      this.poleLabels.push(s);
    }
    this.poleCross = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: crossTexture(),
        depthTest: false,
        depthWrite: false,
        sizeAttenuation: false,
        transparent: true,
      }),
    );
    this.poleCross.position.set(...surf(0, -90));
    this.poleCross.renderOrder = 2002;
    this.overlay.add(this.poleCross);
  }

  /** The hillshade patch: one texture draped on a spherical cap by stereographic UVs. */
  private ensureHillshade(): void {
    if (this.hillshade) return;
    const g = hillshadeGeometry();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.position, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
    geo.setIndex(g.index);
    // A soft rim, so the patch fades into the imagery instead of ending on a hard line.
    const [fade, fg] = canvas(256, 256, 1);
    const grad = fg.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, '#fff');
    grad.addColorStop(0.9, '#fff');
    grad.addColorStop(1, '#000');
    fg.fillStyle = grad;
    fg.fillRect(0, 0, 256, 256);
    const mat = new THREE.MeshBasicMaterial({
      alphaMap: new THREE.CanvasTexture(fade),
      transparent: true,
      side: THREE.FrontSide,
      depthTest: false,
      depthWrite: false,
      color: 0xe6e6e6,
    });
    new THREE.TextureLoader().load(
      HILLSHADE_URL,
      (tex) => {
        if (this.dead) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        this.hillshadeTex = tex;
        mat.map = tex;
        mat.needsUpdate = true;
        this.invalidate();
      },
      undefined,
      () => this.invalidate(),
    );
    this.hillshade = new THREE.Mesh(geo, mat);
    this.hillshade.renderOrder = 1000;
    this.hillshade.frustumCulled = false;
    this.scene.add(this.hillshade);
  }

  private markerMaterial(v: MarkerVerdict): THREE.SpriteMaterial {
    const key = String(v);
    let tex = this.markerTextures.get(key);
    if (!tex) {
      const fill =
        v === 'green'
          ? cssColour('--go-fg', '#3ddc84')
          : v === 'amber'
            ? cssColour('--warn-fg', '#ffb020')
            : v === 'red'
              ? cssColour('--nogo-fg', '#ff6b6b')
              : cssColour('--muted', '#9aa4b2');
      tex = markerTexture(v, fill);
      this.markerTextures.set(key, tex);
    }
    return new THREE.SpriteMaterial({
      map: tex,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: false,
      transparent: true,
    });
  }

  private removeMarker(m: Marker): void {
    this.overlay.remove(m.sprite);
    m.sprite.material.dispose();
    if (m.label) {
      this.overlay.remove(m.label);
      m.label.material.dispose();
    }
  }

  /** Cached canvas-texture text, keyed by text and font. */
  private textSprite(text: string, font: string, stroke: number): TextSprite {
    const key = `${font}|${text}`;
    const hit = this.textCache.get(key);
    if (hit) return hit;
    const [measure, mg] = canvas(10, 10, 1);
    mg.font = font;
    const w = Math.ceil(mg.measureText(text).width) + stroke * 2 + 2;
    void measure;
    const hpx = parseInt(font.match(/(\d+)px/)?.[1] ?? '14', 10) + stroke * 2 + 4;
    const [c, g] = canvas(w, hpx);
    g.font = font;
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = stroke * 2;
    g.strokeStyle = 'rgba(3,5,12,0.92)';
    g.strokeText(text, stroke + 1, hpx / 2 + 1);
    g.fillStyle = '#ffffff';
    g.fillText(text, stroke + 1, hpx / 2 + 1);
    const out = { tex: textureOf(c), aspect: w / hpx };
    this.textCache.set(key, out);
    return out;
  }

  // ───────────────────────────────── events ─────────────────────────────────

  private bind(): void {
    const el = this.renderer.domElement;
    const signal = this.abort.signal;
    el.addEventListener('pointerdown', (e) => this.onDown(e), { signal });
    el.addEventListener('pointermove', (e) => this.onMove(e), { signal });
    el.addEventListener('pointerup', (e) => this.onUp(e), { signal });
    el.addEventListener('pointercancel', (e) => this.onUp(e, true), { signal });
    el.addEventListener('pointerleave', () => this.setHover(null), { signal });
    el.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.interacted();
        const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
        this.targetD = clamp(this.targetD * Math.exp(e.deltaY * k * 0.0016), D_MIN, D_MAX);
        this.invalidate();
      },
      { passive: false, signal },
    );
  }

  private local(e: PointerEvent): { x: number; y: number } {
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private interacted(): void {
    this.quiet = false;
    this.spinning = false;
    this.flight = null;
  }

  private onDown(e: PointerEvent): void {
    const el = this.renderer.domElement;
    el.setPointerCapture(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    this.interacted();
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()] as [
        { x: number; y: number },
        { x: number; y: number },
      ];
      this.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      this.drag = null;
    } else {
      this.drag = {
        mode: e.button === 2 || e.ctrlKey ? 'rotate' : 'pan',
        sx: p.x,
        sy: p.y,
        moved: false,
      };
    }
  }

  private onMove(e: PointerEvent): void {
    const p = this.local(e);
    const prev = this.pointers.get(e.pointerId);
    if (!prev) {
      this.hover(p);
      return;
    }
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()] as [
        { x: number; y: number },
        { x: number; y: number },
      ];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinch > 0 && d > 0) {
        this.targetD = clamp(this.targetD * (this.pinch / d), D_MIN, D_MAX);
        this.view.D = clamp(this.view.D * (this.pinch / d), D_MIN, D_MAX);
      }
      this.pinch = d;
      this.invalidate();
      return;
    }
    const dr = this.drag;
    if (!dr) return;
    const dx = p.x - prev.x;
    const dy = p.y - prev.y;
    if (Math.hypot(p.x - dr.sx, p.y - dr.sy) > 4) dr.moved = true;
    if (dr.mode === 'rotate') {
      this.view.bearing += dx * 0.006;
      this.view.pitch = clamp(this.view.pitch + dy * 0.006, 0, PITCH_MAX);
    } else {
      this.view = pan(this.view, dx, dy, FOV_RAD, this.h);
    }
    this.setHover(null);
    this.readout(p);
    this.invalidate();
  }

  private onUp(e: PointerEvent, cancelled = false): void {
    const dr = this.drag;
    const had = this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = 0;
    if (had && dr && !dr.moved && !cancelled && dr.mode === 'pan' && this.pointers.size === 0) {
      const at = this.local(e);
      const id = this.hit(at);
      if (id) this.opts.onOpen(id);
      else if (this.picking) {
        const pt = this.surfacePoint(at);
        if (pt) this.opts.onPick?.(pt.lat, pt.lon);
      }
    }
    if (this.pointers.size === 0) this.drag = null;
  }

  private hover(p: { x: number; y: number }): void {
    this.readout(p);
    this.setHover(this.hit(p), p);
  }

  private setHover(id: string | null, p?: { x: number; y: number }): void {
    const el = this.renderer.domElement;
    el.style.cursor = id ? 'pointer' : this.picking ? 'crosshair' : this.drag ? 'grabbing' : 'grab';
    const tip = this.opts.tip;
    if (id && p) {
      const m = this.markers.find((k) => k.site.id === id);
      tip.textContent = m?.site.text ?? '';
      tip.hidden = false;
      tip.style.left = `${Math.min(p.x + 14, this.w - 8)}px`;
      tip.style.top = `${Math.max(p.y - 34, 4)}px`;
    } else {
      tip.hidden = true;
    }
    if (id !== this.hoverId) {
      this.hoverId = id;
      this.opts.onHover(id);
      this.invalidate();
    }
  }

  /** Screen-space hit test: within 14 px, on the hemisphere facing the camera. */
  private hit(p: { x: number; y: number }): string | null {
    const cam = this.camera.position.toArray() as Vec3;
    const pts = this.markers.map((m) => {
      const s = this.project(m.unit);
      return { x: s.x, y: s.y, visible: facesCamera(m.unit, cam) };
    });
    const i = nearestMarker(pts, p.x, p.y, 14);
    return i < 0 ? null : (this.markers[i]?.site.id ?? null);
  }

  private project(u: Vec3): { x: number; y: number } {
    const k = this.overlay.scale.x;
    const v = new THREE.Vector3(u[0] * k, u[1] * k, u[2] * k).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h };
  }

  /** The surface point under the pointer, from a ray against the unit sphere. */
  private surfacePoint(p: { x: number; y: number }): { lat: number; lon: number } | null {
    this.raycaster.setFromCamera(
      new THREE.Vector2((p.x / this.w) * 2 - 1, -(p.y / this.h) * 2 + 1),
      this.camera,
    );
    const o = this.raycaster.ray.origin;
    const d = this.raycaster.ray.direction;
    const hit = rayUnitSphere([o.x, o.y, o.z], [d.x, d.y, d.z]);
    if (!hit) return null;
    return {
      lat: Math.asin(clamp(hit[1], -1, 1)) / DEG,
      lon: Math.atan2(hit[0], hit[2]) / DEG,
    };
  }

  private readout(p: { x: number; y: number }): void {
    const pt = this.surfacePoint(p);
    if (!pt) {
      this.opts.readout.textContent = 'Cursor: off the Moon';
      return;
    }
    const { lat, lon } = pt;
    this.opts.readout.textContent = `Cursor: ${latLabel(lat)} ${lonLabel(lon)}`;
  }

  // ───────────────────────────────── frame loop ─────────────────────────────────

  private resize(): void {
    const r = this.opts.container.getBoundingClientRect();
    this.w = Math.max(1, Math.round(r.width));
    this.h = Math.max(1, Math.round(r.height));
    this.renderer.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  invalidate(): void {
    if (this.dead || this.raf) return;
    if (!this.running) {
      this.running = true;
      this.last = performance.now();
    }
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number): void => {
    this.raf = 0;
    if (this.dead) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const animating = this.step(dt);
    this.render(now);
    if (animating) this.invalidate();
    else this.running = false;
  };

  private startFlight(to: View, followed = false): void {
    this.spinning = false;
    this.quiet = followed;
    this.targetD = to.D;
    const from = { ...this.view };
    const dist = angleBetween(surf(from.lon, from.lat), surf(to.lon, to.lat));
    // Following someone: a short glide between the positions they send a few times a second.
    const dur = followed ? 0.15 : this.reduced ? 0.2 : clamp(0.8 + dist * 0.9, 0.8, 2.4);
    this.flight = { from, to, t: 0, dur };
    this.invalidate();
  }

  /** Advance animations; true while anything is still moving. */
  private step(dt: number): boolean {
    let moving = false;
    if (this.flight) {
      const f = this.flight;
      f.t += dt / f.dur;
      if (f.t >= 1) {
        this.view = { ...f.to };
        this.flight = null;
      } else {
        this.view = flightAt(f.from, f.to, f.t);
        moving = true;
      }
    } else {
      const ln = Math.log(this.view.D);
      const lt = Math.log(this.targetD);
      if (Math.abs(lt - ln) > 1e-3) {
        this.view.D = Math.exp(ln + (lt - ln) * (1 - Math.exp(-dt * 12)));
        moving = true;
      } else this.view.D = this.targetD;
    }
    if (this.spinning && this.view.D > 1.5) {
      this.view.lon = wrapLon(this.view.lon + SPIN_DEG_PER_S * dt);
      moving = true;
    }
    return moving;
  }

  private lod(): LodView {
    const p = this.camera.position;
    return {
      camera: [p.x, p.y, p.z],
      fovRad: FOV_RAD,
      viewportH: this.h,
      inFrustum: (c, r) =>
        this.frustum.intersectsSphere(new THREE.Sphere(new THREE.Vector3(...c), r)),
    };
  }

  private render(now: number): void {
    const pose = cameraPose(this.view);
    this.camera.position.set(...pose.position);
    this.camera.up.set(...pose.up);
    this.camera.lookAt(...pose.target);
    this.camera.updateMatrixWorld();
    this.pv.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);

    // Overlays sit a hair above the surface so they never z-fight with it when zoomed in.
    this.overlay.scale.setScalar(1 + Math.max(5e-5, this.view.D * 0.002));

    const lod = this.lod();
    const look = pose.target;
    this.baseLayer?.update(lod, look);
    if (this.retiring) {
      this.retiring.update(lod, look);
      if (this.baseLayer?.complete) this.retire(false);
    }
    this.updateGrid(now);
    this.updateMarkers(pose.position);
    this.renderer.render(this.scene, this.camera);
    this.reportCamera();
  }

  private reportCamera(): void {
    if (this.quiet || this.spinning || !this.opts.onCamera) return;
    const v = this.view;
    const key = [v.lon, v.lat, v.D, v.bearing, v.pitch].map((n) => n.toFixed(5)).join(',');
    if (key === this.reported) return;
    this.reported = key;
    this.opts.onCamera({ ...v });
  }

  private retire(force: boolean): void {
    if (!this.retiring) return;
    if (!force && !this.baseLayer?.complete) return;
    window.clearTimeout(this.retireTimer);
    this.retiring.dispose();
    this.retiring = null;
    this.invalidate();
  }

  private updateMarkers(cam: Vec3): void {
    const k = spriteScale(1, this.h, FOV_RAD);
    const showLabels = this.view.D < LABEL_D;
    const taken: { l: number; r: number; t: number; b: number }[] = [];
    const order = [...this.markers].sort(
      (a, b) =>
        Number(b.site.id === this.highlightId || b.site.id === this.hoverId) -
          Number(a.site.id === this.highlightId || a.site.id === this.hoverId) ||
        a.site.lat - b.site.lat,
    );
    let ringed = false;
    for (const m of order) {
      const facing = facesCamera(m.unit, cam);
      const sel = m.site.id === this.selectedId;
      const hot = sel || m.site.id === this.highlightId || m.site.id === this.hoverId;
      m.sprite.visible = facing;
      m.sprite.position.set(...m.unit);
      const px = hot ? MARKER_PX * 1.3 : MARKER_PX;
      m.sprite.scale.set(px * k, px * k, 1);
      if (hot && !sel && facing) {
        this.ring.visible = true;
        this.ring.position.set(...m.unit);
        this.ring.scale.set(MARKER_PX * 1.9 * k, MARKER_PX * 1.9 * k, 1);
        ringed = true;
      }
      const ls = m.label;
      if (!ls) continue;
      const aspect = (ls.userData as { aspect?: number }).aspect ?? 4;
      const hpx = LABEL_PX + 8;
      const wpx = hpx * aspect;
      let show = facing && (showLabels || hot);
      if (show) {
        const s = this.project(m.unit);
        const rect = { l: s.x + 12, r: s.x + 12 + wpx, t: s.y - hpx / 2, b: s.y + hpx / 2 };
        if (
          !hot &&
          taken.some((o) => rect.l < o.r && rect.r > o.l && rect.t < o.b && rect.b > o.t)
        ) {
          show = false;
        } else {
          taken.push(rect);
          ls.center.set(-12 / wpx, 0.5);
        }
      }
      ls.visible = show;
      if (show) {
        ls.position.set(...m.unit);
        ls.scale.set(wpx * k, hpx * k, 1);
      }
    }
    if (!ringed) this.ring.visible = false;
    const pick = this.markers.find((m) => m.site.id === this.selectedId);
    this.selRing.visible = !!pick && facesCamera(pick.unit, cam);
    if (pick) {
      this.selRing.position.set(...pick.unit);
      this.selRing.scale.set(MARKER_PX * 2.3 * k, MARKER_PX * 2.3 * k, 1);
    }
    if (this.poleCross) {
      this.poleCross.visible = facesCamera(surf(0, -90), cam);
      this.poleCross.scale.set(16 * k, 16 * k, 1);
    }
    for (const s of this.poleLabels) {
      const aspect = (s.userData as { aspect: number }).aspect;
      const hpx = 12 + 10;
      s.visible =
        this.gridGroup.visible &&
        this.view.D < 1.6 &&
        facesCamera(s.position.toArray() as Vec3, cam);
      s.scale.set(hpx * aspect * k, hpx * k, 1);
      s.center.set(0.5, 0.5);
    }
  }

  /** The graticule for this view, rebuilt only when what is visible changes (at most every 100 ms). */
  private updateGrid(now: number): void {
    if (!this.gridGroup.visible) return;
    const plan = graticulePlan(this.view, FOV_RAD);
    const cell = (v: number): number => Math.round(v / plan.step);
    const key = `${plan.level}|${plan.parallels[0]}|${plan.parallels.at(-1)}|${plan.parallels.length}|${plan.meridians[0]}|${plan.meridians.at(-1)}|${plan.meridians.length}|${cell(this.view.lat)}|${cell(this.view.lon)}`;
    if (key === this.gridKey) {
      this.placeGridLabelScale();
      return;
    }
    if (now - this.gridAt < 100) {
      window.clearTimeout(this.gridTimer);
      this.gridTimer = window.setTimeout(() => this.invalidate(), 100);
      this.placeGridLabelScale();
      return;
    }
    this.gridKey = key;
    this.gridAt = now;

    const out: number[] = [];
    const seg = (a: Vec3, b: Vec3): void => {
      out.push(...a, ...b);
    };
    const lonSpan = plan.full ? 360 : plan.lonMax - plan.lonMin;
    const lonStart = plan.full ? -180 : plan.lonMin;
    const dl = Math.max(0.05, Math.min(5, lonSpan / 8));
    for (const lat of plan.parallels) {
      const n = Math.max(1, Math.ceil(lonSpan / dl));
      for (let i = 0; i < n; i++) {
        seg(surf(lonStart + (lonSpan * i) / n, lat), surf(lonStart + (lonSpan * (i + 1)) / n, lat));
      }
    }
    const mLo = Math.max(plan.latMin, -80);
    const mHi = Math.min(plan.latMax, 80);
    if (mHi > mLo) {
      const dm = Math.max(0.05, Math.min(5, (mHi - mLo) / 8));
      const n = Math.max(1, Math.ceil((mHi - mLo) / dm));
      for (const lon of plan.meridians) {
        for (let i = 0; i < n; i++) {
          seg(surf(lon, mLo + ((mHi - mLo) * i) / n), surf(lon, mLo + ((mHi - mLo) * (i + 1)) / n));
        }
      }
    }
    this.gridLines.geometry.dispose();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    this.gridLines.geometry = geo;

    // Labels sit toward the left and bottom of the view, not at its centre where they would pile
    // up with the markers: parallels along a meridian left of centre, meridians along a parallel
    // below it.
    const labels: { text: string; at: Vec3 }[] = [];
    const latAt0 = clamp(this.view.lat - ((plan.latMax - plan.latMin) / 2) * 0.6, -79, 79);
    const halfLon = plan.full ? 40 : Math.min(60, (plan.lonMax - plan.lonMin) / 2);
    const lonAt = wrapLon(this.view.lon - halfLon * 0.7);
    // Thin the labels so neighbours stay about 50 px apart on screen (meridians crowd near a pole).
    const pxPerRad = this.h / (2 * Math.tan(FOV_RAD / 2) * Math.max(this.view.D, 0.01));
    const strideOf = (arcRad: number): number =>
      Math.max(1, Math.ceil(50 / Math.max(1, arcRad * pxPerRad)));
    const latStride = strideOf(plan.step * DEG);
    const lonStride = strideOf(plan.step * DEG * Math.cos(latAt0 * DEG));
    for (const lat of plan.parallels) {
      if (Math.round(lat / plan.step) % latStride) continue;
      labels.push({ text: latLabel(lat), at: surf(lonAt, lat) });
    }
    for (const lon of plan.meridians) {
      if (Math.round(lon / plan.step) % lonStride) continue;
      labels.push({ text: lon === 0 ? '0°E: toward Earth' : lonLabel(lon), at: surf(lon, latAt0) });
    }
    const used = labels.slice(0, 48);
    while (this.gridLabels.length < used.length) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          depthTest: false,
          depthWrite: false,
          sizeAttenuation: false,
          transparent: true,
        }),
      );
      s.renderOrder = 2002;
      this.gridGroup.add(s);
      this.gridLabels.push(s);
    }
    this.gridLabels.forEach((s, i) => {
      const l = used[i];
      if (!l) {
        s.visible = false;
        s.userData = {};
        return;
      }
      const t = this.textSprite(l.text, '500 10px ui-monospace, monospace', 2);
      s.material.map = t.tex;
      s.material.needsUpdate = true;
      s.position.set(...l.at);
      s.userData = { aspect: t.aspect, unit: l.at };
      s.visible = true;
    });
    this.placeGridLabelScale();
  }

  private placeGridLabelScale(): void {
    const k = spriteScale(1, this.h, FOV_RAD);
    const cam = this.camera.position.toArray() as Vec3;
    for (const s of this.gridLabels) {
      const d = s.userData as { aspect?: number; unit?: Vec3 };
      if (!d.aspect || !d.unit) continue;
      const hpx = 10 + 8;
      s.scale.set(hpx * d.aspect * k, hpx * k, 1);
      s.visible = facesCamera(d.unit, cam);
    }
  }
}
