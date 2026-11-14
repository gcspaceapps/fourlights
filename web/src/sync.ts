// The browser's end of a shared project: one WebSocket to the project's Durable Object
// (api/src/project.ts). It reconnects by itself, keeps the socket alive, and queues a site
// being added or removed while the socket is down. It knows nothing about the page: main.ts says
// what to do with what arrives. The message shapes are the Worker's own (api/src/project-state.ts).
import type {
  DataState,
  Event as ProjectEvent,
  ProjectSite,
  ViewState,
} from '../../api/src/project-state';

export interface Snapshot {
  id: string;
  name: string;
  created: string;
  sites: ProjectSite[];
  data: DataState;
  view: ViewState;
}

export type SyncStatus = 'connecting' | 'live' | 'offline';

export interface SyncHandlers {
  /** The whole state, on every (re)connection. */
  snapshot: (s: Snapshot, peers: number) => void;
  /** Somebody else changed something. */
  event: (e: ProjectEvent) => void;
  peers: (n: number) => void;
  status: (s: SyncStatus) => void;
  /** The project no longer exists (or the id is wrong): stop trying. */
  gone: () => void;
}

type Outgoing =
  { t: 'set'; data?: Partial<DataState>; view?: Partial<ViewState> } | Record<string, unknown>;

const PING_MS = 30_000;
const MAX_QUEUE = 20;

export class SyncClient {
  private ws: WebSocket | null = null;
  private status: SyncStatus = 'connecting';
  private retry = 0;
  private timer = 0;
  private ping = 0;
  private closed = false;
  /** Sites added or removed while the socket was down: they matter, so they wait. */
  private queue: Outgoing[] = [];

  constructor(
    private readonly id: string,
    private readonly on: SyncHandlers,
  ) {
    this.open();
  }

  get live(): boolean {
    return this.status === 'live';
  }

  /** A state change (`set`) is sent only while live: a stale one is worse than none. */
  send(msg: Outgoing): void {
    const t = (msg as { t?: unknown }).t;
    if (this.live && this.ws) {
      this.ws.send(JSON.stringify(msg));
    } else if (t === 'addSite' || t === 'removeSite') {
      if (this.queue.length < MAX_QUEUE) this.queue.push(msg);
    }
  }

  close(): void {
    this.closed = true;
    window.clearTimeout(this.timer);
    window.clearInterval(this.ping);
    this.ws?.close();
  }

  private set(s: SyncStatus): void {
    if (s === this.status) return;
    this.status = s;
    this.on.status(s);
  }

  private open(): void {
    if (this.closed) return;
    this.set(this.retry ? 'offline' : 'connecting');
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${scheme}://${location.host}/api/projects/${this.id}/ws`);
    this.ws = ws;
    let opened = false;
    ws.addEventListener('open', () => {
      opened = true;
      this.retry = 0;
      window.clearInterval(this.ping);
      this.ping = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('ping');
      }, PING_MS);
    });
    ws.addEventListener('message', (e: MessageEvent<unknown>) => {
      if (typeof e.data !== 'string' || e.data === 'pong') return;
      let m: { t?: string } & Record<string, unknown>;
      try {
        m = JSON.parse(e.data) as typeof m;
      } catch {
        return;
      }
      if (m.t === 'snapshot') {
        this.set('live');
        this.on.snapshot(m as unknown as Snapshot, Number(m.peers) || 1);
        for (const q of this.queue.splice(0)) ws.send(JSON.stringify(q));
      } else if (m.t === 'set' || m.t === 'sites') {
        this.on.event(m as unknown as ProjectEvent);
      } else if (m.t === 'peers') {
        this.on.peers(Number(m.n) || 1);
      }
    });
    ws.addEventListener('close', () => {
      window.clearInterval(this.ping);
      if (this.closed) return;
      // Never opened on the first try: the project is probably gone, or the id wrong.
      if (!opened && this.retry === 0) {
        void fetch(`/api/projects/${this.id}`).then((r) => {
          if (r.status === 404) {
            this.closed = true;
            this.on.gone();
          }
        });
      }
      this.set('offline');
      this.retry++;
      this.timer = window.setTimeout(() => this.open(), Math.min(15_000, 1000 * 2 ** this.retry));
    });
  }
}

// ── the REST side: create a project, read one ──

export async function createProject(body: {
  name: string;
  sites: { id: string; name: string; lat: number; lon_e: number }[];
  data: Partial<DataState>;
  view: Partial<ViewState>;
}): Promise<Snapshot> {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const out = (await res.json().catch(() => null)) as {
    ok?: boolean;
    project?: Snapshot;
    error?: string;
  } | null;
  if (!res.ok || !out?.project) throw new Error(out?.error ?? 'Could not create the project.');
  return out.project;
}

/** A project's current state, or null if there is no such project. */
export async function fetchProject(id: string): Promise<Snapshot | null> {
  const res = await fetch(`/api/projects/${id}`).catch(() => null);
  if (!res?.ok) return null;
  return ((await res.json()) as { project: Snapshot }).project;
}

// ── projects remembered in this browser, so a person can come back to them ──

const STORE = 'fourlights.projects';
export interface Remembered {
  id: string;
  name: string;
}

export function rememberedProjects(): Remembered[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORE) ?? '[]');
    return Array.isArray(raw)
      ? raw.filter(
          (x): x is Remembered => !!x && typeof x.id === 'string' && typeof x.name === 'string',
        )
      : [];
  } catch {
    return [];
  }
}

export function remember(p: Remembered): void {
  try {
    const rest = rememberedProjects().filter((x) => x.id !== p.id);
    localStorage.setItem(STORE, JSON.stringify([p, ...rest].slice(0, 30)));
  } catch {
    // private window: the id is on screen to copy
  }
}

export function forget(id: string): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(rememberedProjects().filter((x) => x.id !== id)));
  } catch {
    // nothing to forget
  }
}

export const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
