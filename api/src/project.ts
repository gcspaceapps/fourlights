// One Durable Object per shared project, named by the project's uuid. It holds the project's state
// (project-state.ts) and is the one place everybody's page, and later an AI agent, meets:
//  - a browser opens a WebSocket (/api/projects/<uuid>/ws), gets the whole state, then sends
//    commands and receives everyone else's changes;
//  - anything else (an MCP server, a script) calls `command()` through the Worker's REST route.
// Both go through the same `reduce()`, so there is one set of rules.
// WebSockets use the hibernation API: the object can be evicted between messages and the sockets
// stay open. The project (data and sites) is stored on every change; the view (tab, camera, ...)
// moves too fast for that, so it is stored a moment after the last move, by an alarm.
import { DurableObject } from 'cloudflare:workers';
import {
  COMPUTE_STALE_MS,
  computeRefusal,
  DEFAULT_DATA,
  DEFAULT_VIEW,
  MAX_MESSAGE_BYTES,
  MAX_PEERS,
  newProject,
  reduce,
  type DataState,
  type Event,
  type ProjectSite,
  type ProjectState,
  type SiteStatus,
  type ViewState,
} from './project-state';

export interface ProjectSnapshot {
  id: string;
  name: string;
  created: string;
  sites: ProjectSite[];
  data: DataState;
  view: ViewState;
}

export type CommandResult = { ok: true; changed: boolean } | { ok: false; error: string };

/** A pipeline run for one site: the token its result must carry, and when it was asked for. */
interface Job {
  token: string;
  started: number;
}

export type ComputeStart =
  { ok: true; token: string; site: ProjectSite } | { ok: false; error: string };

type Out =
  | ({ t: 'snapshot'; peers: number } & ProjectSnapshot)
  | { t: 'peers'; n: number }
  | { t: 'error'; error: string }
  | Event;

/** How long after the last view change the view is written to storage. */
const VIEW_SAVE_MS = 3000;

const OPEN = 1;

export class Project extends DurableObject {
  private state: ProjectState | null = null;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    // The browsers' keep-alive ping is answered without waking the object from hibernation.
    if (typeof WebSocketRequestResponsePair === 'function') {
      ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    }
    void ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<Omit<ProjectState, 'view'>>('project');
      if (!stored) return;
      const view = await ctx.storage.get<Partial<ViewState>>('view');
      // A project saved before a field existed still gets a sound value for it.
      this.state = {
        ...stored,
        data: { ...DEFAULT_DATA, ...stored.data },
        view: { ...DEFAULT_VIEW, ...view },
      };
    });
  }

  // ─────────────── called by the Worker (RPC) ───────────────

  /** Make the project. False if this uuid is already taken. */
  async create(id: string, input: unknown): Promise<ProjectSnapshot | null> {
    if (this.state) return null;
    const made = newProject(id, input as Record<string, unknown>, new Date());
    if (!made) return null;
    this.state = made;
    await this.saveProject();
    await this.ctx.storage.put('view', made.view);
    return snapshotOf(made);
  }

  snapshot(): ProjectSnapshot | null {
    return this.state ? snapshotOf(this.state) : null;
  }

  /** A command from outside a browser (an AI agent's tool, a script): everyone connected sees it. */
  async command(cmd: unknown): Promise<CommandResult> {
    return this.run(cmd, null);
  }

  // ─────────────── a site's own data (pipeline.ts) ───────────────

  /**
   * Mark a site as being computed and hand back a one-time token; the run's result is accepted
   * only with it. Everyone connected sees the site's status change.
   */
  async startCompute(siteId: string, token: string): Promise<ComputeStart> {
    if (!this.state) return { ok: false, error: 'No such project.' };
    const refusal = computeRefusal(this.state.sites, siteId);
    if (refusal) return { ok: false, error: refusal };
    const job = await this.ctx.storage.get<Job>(`job:${siteId}`);
    const site = this.state.sites.find((s) => s.id === siteId);
    if (!site) return { ok: false, error: 'No such site in this project.' };
    if (site.status === 'computing' && job && Date.now() - job.started < COMPUTE_STALE_MS) {
      return { ok: false, error: 'This site is already being computed.' };
    }
    await this.ctx.storage.put<Job>(`job:${siteId}`, { token, started: Date.now() });
    await this.setStatus(siteId, 'computing');
    return { ok: true, token, site: { ...site, status: 'computing' } };
  }

  /**
   * The site-wide count of runs per day. It is kept in one object of this class that is no
   * project (the Worker names it `RUN_COUNTER`, which is not a uuid, so no route reaches it).
   * `take` counts a run if the day has room; `give` hands one back when the machine did not start.
   */
  async takeRun(day: string, max: number): Promise<boolean> {
    const used = (await this.ctx.storage.get<number>(`runs:${day}`)) ?? 0;
    if (used >= max) return false;
    await this.ctx.storage.put(`runs:${day}`, used + 1);
    return true;
  }

  async giveRun(day: string): Promise<void> {
    const used = (await this.ctx.storage.get<number>(`runs:${day}`)) ?? 0;
    if (used > 0) await this.ctx.storage.put(`runs:${day}`, used - 1);
  }

  /** True if `token` is the one handed out for this site's current run. */
  async jobValid(siteId: string, token: string): Promise<boolean> {
    const job = await this.ctx.storage.get<Job>(`job:${siteId}`);
    return !!job && !!token && job.token === token;
  }

  /** The run reported back: the site is ready, or it failed. The token is spent either way. */
  async finishCompute(
    siteId: string,
    token: string,
    status: 'ready' | 'failed',
    approx?: boolean,
  ): Promise<boolean> {
    if (!this.state || !(await this.jobValid(siteId, token))) return false;
    await this.ctx.storage.delete(`job:${siteId}`);
    await this.setStatus(siteId, status, approx);
    return true;
  }

  private async setStatus(siteId: string, status: SiteStatus, approx?: boolean): Promise<void> {
    if (!this.state || !this.state.sites.some((s) => s.id === siteId)) return;
    const sites = this.state.sites.map((s) =>
      s.id === siteId
        ? { ...s, status, ...(status === 'ready' && approx !== undefined ? { approx } : {}) }
        : s,
    );
    this.state = { ...this.state, sites };
    await this.saveProject();
    this.broadcast({ t: 'sites', sites }, null);
  }

  // ─────────────── WebSockets ───────────────

  async fetch(request: Request): Promise<Response> {
    if (!this.state) return new Response('No such project', { status: 404 });
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket', { status: 426 });
    }
    if (this.ctx.getWebSockets().length >= MAX_PEERS) {
      return new Response('This project is full', { status: 429 });
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.attach(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Accept a socket: it gets the whole state at once, and everyone learns the head count. */
  attach(server: WebSocket): void {
    if (!this.state) return;
    this.ctx.acceptWebSocket(server);
    const peers = this.peers();
    send(server, { t: 'snapshot', peers, ...snapshotOf(this.state) });
    this.broadcast({ t: 'peers', n: peers }, server);
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string' || message.length > MAX_MESSAGE_BYTES) {
      send(ws, { t: 'error', error: 'Message too large or not text.' });
      return;
    }
    let cmd: unknown;
    try {
      cmd = JSON.parse(message);
    } catch {
      send(ws, { t: 'error', error: 'Not JSON.' });
      return;
    }
    const res = await this.run(cmd, ws);
    if (!res.ok) send(ws, { t: 'error', error: res.error });
  }

  webSocketClose(ws: WebSocket, code: number): void {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code);
    } catch {
      // already closed
    }
    this.broadcast({ t: 'peers', n: this.peers(ws) }, ws);
  }

  webSocketError(ws: WebSocket): void {
    this.broadcast({ t: 'peers', n: this.peers(ws) }, ws);
  }

  /** The view is stored a few seconds after it last moved. */
  async alarm(): Promise<void> {
    if (this.state) await this.ctx.storage.put('view', this.state.view);
  }

  // ─────────────── internals ───────────────

  private async run(cmd: unknown, from: WebSocket | null): Promise<CommandResult> {
    if (!this.state) return { ok: false, error: 'No such project.' };
    const out = reduce(this.state, cmd);
    if (!out.ok) return out;
    if (!out.event) return { ok: true, changed: false };
    this.state = out.next;
    // Persist first, then tell people (storage writes are atomic with the sends that follow).
    if (out.dataChanged) await this.saveProject();
    if (out.viewChanged && (await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + VIEW_SAVE_MS);
    }
    this.broadcast(out.event, out.to === 'others' ? from : null);
    return { ok: true, changed: true };
  }

  private async saveProject(): Promise<void> {
    if (!this.state) return;
    const { id, name, created, sites, data } = this.state;
    await this.ctx.storage.put('project', { id, name, created, sites, data });
  }

  private peers(except?: WebSocket): number {
    return this.ctx.getWebSockets().filter((w) => w !== except && w.readyState === OPEN).length;
  }

  private broadcast(msg: Out, except: WebSocket | null): void {
    const text = JSON.stringify(msg);
    for (const w of this.ctx.getWebSockets()) {
      if (w === except || w.readyState !== OPEN) continue;
      try {
        w.send(text);
      } catch {
        // a socket that just went away; its close handler tidies up
      }
    }
  }
}

function send(ws: WebSocket, msg: Out): void {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    // closed
  }
}

function snapshotOf(s: ProjectState): ProjectSnapshot {
  return { id: s.id, name: s.name, created: s.created, sites: s.sites, data: s.data, view: s.view };
}
