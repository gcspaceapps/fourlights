// One imagery layer on the globe: a quadtree of Moon Trek tiles loaded through our own /etiles
// route, drawn as lon/lat patches of the sphere. A tile that has not arrived draws its nearest
// loaded ancestor, so there are never holes; ancestors are always requested first.
import * as THREE from 'three';
import {
  angleBetween,
  MAX_ZOOM,
  parentOf,
  selectTiles,
  tileGeometry,
  tileId,
  tileSphere,
  type LodView,
  type TileKey,
  type TileLayerId,
  type Vec3,
} from './math';

const MAX_INFLIGHT = 8;
const MAX_TEXTURES = 512;
const RETRY_MS = 4000;
/** Tiles at or below this zoom are cheap and always wanted, so they are never evicted. */
const KEEP_Z = 2;

interface Entry {
  key: TileKey;
  id: string;
  state: 'idle' | 'loading' | 'ready' | 'error';
  errAt: number;
  used: number;
  img: HTMLImageElement | null;
  mesh: THREE.Mesh | null;
}

export class TileLayer {
  readonly group = new THREE.Group();
  private entries = new Map<string, Entry>();
  private inflight = 0;
  private frame = 0;
  private dead = false;
  private retry = 0;
  /** True when every tile the last view needed is its own, finished texture. */
  complete = false;

  constructor(
    readonly layer: TileLayerId,
    private readonly orderBase: number,
    private readonly changed: () => void,
  ) {}

  /** Choose and draw tiles for this view, and start loading what is missing. */
  update(view: LodView, look: Vec3): void {
    if (this.dead) return;
    this.frame++;
    const leaves = selectTiles(view, MAX_ZOOM[this.layer]);
    const drawn = new Set<string>();
    const wanted = new Map<string, { key: TileKey; ang: number }>();
    let complete = true;
    for (const leaf of leaves) {
      const chain: TileKey[] = [];
      for (let t: TileKey | null = leaf; t; t = parentOf(t)) chain.push(t);
      let shown = false;
      for (const t of chain) {
        const e = this.entries.get(tileId(t));
        if (e?.state === 'ready') {
          e.used = this.frame;
          if (!shown) {
            drawn.add(e.id);
            shown = true;
          }
        } else if (!e || e.state === 'idle' || this.retryable(e)) {
          wanted.set(tileId(t), { key: t, ang: angleBetween(tileSphere(t).center, look) });
        }
      }
      const own = this.entries.get(tileId(leaf));
      if (own?.state !== 'ready' && own?.state !== 'error') complete = false;
    }
    this.complete = complete;
    for (const e of this.entries.values()) if (e.mesh) e.mesh.visible = drawn.has(e.id);
    this.pump(wanted);
    this.evict();
  }

  private retryable(e: Entry): boolean {
    return e.state === 'error' && performance.now() - e.errAt > RETRY_MS;
  }

  /** Start loads, lowest zoom first, then nearest the centre of the view. */
  private pump(wanted: Map<string, { key: TileKey; ang: number }>): void {
    const order = [...wanted.values()].sort((a, b) => a.key.z - b.key.z || a.ang - b.ang);
    for (const { key } of order) {
      if (this.inflight >= MAX_INFLIGHT) return;
      const id = tileId(key);
      const e = this.entries.get(id) ?? {
        key,
        id,
        state: 'idle' as const,
        errAt: 0,
        used: this.frame,
        img: null,
        mesh: null,
      };
      this.entries.set(id, e);
      if (e.state === 'loading' || e.state === 'ready') continue;
      this.load(e);
    }
  }

  private load(e: Entry): void {
    e.state = 'loading';
    this.inflight++;
    const img = new Image();
    e.img = img;
    img.decoding = 'async';
    img.onload = () => {
      this.inflight--;
      e.img = null;
      if (this.dead) return;
      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      tex.needsUpdate = true;
      const g = tileGeometry(e.key);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.position, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
      geo.setIndex(g.index);
      // Depth test and write are off and renderOrder = zoom, so a child draws over its parent
      // with no z-fighting. That is only valid because a sphere is convex.
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        side: THREE.FrontSide,
        depthTest: false,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = this.orderBase + e.key.z;
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      e.mesh = mesh;
      e.state = 'ready';
      e.used = this.frame;
      this.changed();
    };
    img.onerror = () => {
      this.inflight--;
      e.img = null;
      if (this.dead) return;
      e.state = 'error';
      e.errAt = performance.now();
      window.clearTimeout(this.retry);
      this.retry = window.setTimeout(this.changed, RETRY_MS + 100);
      this.changed();
    };
    img.src = `/etiles/${this.layer}/${e.key.z}/${e.key.row}/${e.key.col}`;
  }

  /** Least recently used textures go first, but never ones the current view is drawing. */
  private evict(): void {
    const ready = [...this.entries.values()].filter((e) => e.state === 'ready');
    let over = ready.length - MAX_TEXTURES;
    if (over <= 0) return;
    ready.sort((a, b) => a.used - b.used);
    for (const e of ready) {
      if (over <= 0) break;
      if (e.used === this.frame || e.key.z <= KEEP_Z) continue;
      this.free(e);
      this.entries.delete(e.id);
      over--;
    }
  }

  private free(e: Entry): void {
    if (e.mesh) {
      this.group.remove(e.mesh);
      e.mesh.geometry.dispose();
      const mat = e.mesh.material as THREE.MeshBasicMaterial;
      mat.map?.dispose();
      mat.dispose();
      e.mesh = null;
    }
    if (e.img) {
      e.img.onload = e.img.onerror = null;
      e.img.src = '';
      e.img = null;
    }
  }

  get textureCount(): number {
    return [...this.entries.values()].filter((e) => e.state === 'ready').length;
  }

  dispose(): void {
    this.dead = true;
    window.clearTimeout(this.retry);
    for (const e of this.entries.values()) this.free(e);
    this.entries.clear();
    this.group.removeFromParent();
  }
}
