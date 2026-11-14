// The Share Project button and its dialog: make a shared project, copy its ID and link, turn the
// "follow the group's view" switch on or off, open or leave a project. The dialog only gathers
// intent; main.ts owns the page state and the connection (see sync.ts).
import { PROJECT_ID, forget, rememberedProjects, type SyncStatus } from './sync';

export interface ShareDeps {
  /** Sites added in this browser, which creating the project uploads. */
  uploadCount: () => number;
  /** Make the project and start sharing; resolves when it is live. Rejects with a readable message. */
  create: (name: string) => Promise<{ id: string; name: string }>;
  follow: () => boolean;
  setFollow: (on: boolean) => void;
  leave: () => void;
}

export interface ShareUi {
  /** The project this page is in, or null. */
  setProject: (p: { id: string; name: string } | null) => void;
  setStatus: (s: SyncStatus, peers: number) => void;
}

const el = <T extends HTMLElement>(id: string): T => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e as T;
};

export function projectLink(id: string): string {
  return `${location.origin}${location.pathname}#project=${id}`;
}

export function setupShare(deps: ShareDeps): ShareUi {
  const dialog = el<HTMLDialogElement>('share');
  const btn = el<HTMLButtonElement>('share-open');
  const label = el('share-open-label');
  const createForm = el<HTMLFormElement>('share-create');
  const live = el('share-live');
  let project: { id: string; name: string } | null = null;
  let status: SyncStatus = 'connecting';
  let peers = 1;

  const fillMine = (): void => {
    const mine = rememberedProjects().filter((p) => p.id !== project?.id);
    el('share-mine-box').hidden = mine.length === 0;
    el('share-mine').replaceChildren(
      ...mine.map((p) => {
        const li = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = p.name;
        const open = document.createElement('button');
        open.type = 'button';
        open.textContent = 'Open';
        open.setAttribute('aria-label', `Open ${p.name}`);
        open.addEventListener('click', () => openProject(p.id));
        const drop = document.createElement('button');
        drop.type = 'button';
        drop.textContent = 'Forget';
        drop.title = 'Remove it from this list. The project itself stays, and so does its ID.';
        drop.addEventListener('click', () => {
          forget(p.id);
          fillMine();
        });
        const row = document.createElement('span');
        row.className = 'share-row';
        row.append(open, drop);
        li.append(name, row);
        return li;
      }),
    );
  };

  const paint = (): void => {
    createForm.hidden = !!project;
    live.hidden = !project;
    el('share-title').textContent = project ? 'Shared project' : 'Share this project';
    btn.dataset.state = project ? (status === 'live' ? 'live' : 'offline') : 'off';
    if (!project) {
      label.textContent = 'Share Project';
      return;
    }
    const people = peers === 1 ? 'just you' : `${peers} people`;
    label.textContent =
      status === 'live' ? `${project.name} · ${people}` : `${project.name} · reconnecting`;
    el('share-live-name').textContent = project.name;
    el('share-status').textContent =
      status === 'live'
        ? `· live, ${people} here`
        : '· reconnecting… your changes will sync when it is back';
    el('share-id').textContent = project.id;
    el<HTMLInputElement>('share-link').value = projectLink(project.id);
  };

  /** Open a project if it exists; if not, say so here instead of reloading into nothing. */
  const openProject = (id: string): void => {
    void fetch(`/api/projects/${id}`).then(
      (res) => {
        if (res.status === 404) {
          errorIn('share-open-error', 'No project has that ID. Check it and try again.');
          return;
        }
        location.hash = `project=${id}`;
        location.reload();
      },
      () => errorIn('share-open-error', 'Could not reach the server. Try again in a moment.'),
    );
  };

  const errorIn = (id: string, msg: string): void => {
    const e = el(id);
    e.textContent = msg;
    e.hidden = !msg;
  };

  btn.addEventListener('click', () => {
    const n = deps.uploadCount();
    el('share-upload').textContent = n
      ? `${n} site${n === 1 ? '' : 's'} you added in this browser will be uploaded with it.`
      : 'You have not added any sites yet; anything you add later is shared as you go.';
    errorIn('share-error', '');
    errorIn('share-open-error', '');
    fillMine();
    dialog.showModal();
    (project ? el('share-copy-id') : el('share-name')).focus();
  });
  el('share-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  createForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = el<HTMLInputElement>('share-name').value.trim();
    if (!name) return;
    const go = el<HTMLButtonElement>('share-create-btn');
    go.disabled = true;
    errorIn('share-error', '');
    deps
      .create(name)
      .catch((err: unknown) =>
        errorIn('share-error', err instanceof Error ? err.message : String(err)),
      )
      .finally(() => (go.disabled = false));
  });

  const copy = (text: string, button: HTMLElement): void => {
    const was = button.textContent;
    void navigator.clipboard
      .writeText(text)
      .then(() => (button.textContent = 'Copied'))
      .catch(() => (button.textContent = 'Select and copy'))
      .finally(() => window.setTimeout(() => (button.textContent = was), 1500));
  };
  el('share-copy-id').addEventListener(
    'click',
    (e) => project && copy(project.id, e.currentTarget as HTMLElement),
  );
  el('share-copy-link').addEventListener(
    'click',
    (e) => project && copy(projectLink(project.id), e.currentTarget as HTMLElement),
  );

  const follow = el<HTMLInputElement>('share-follow');
  follow.checked = deps.follow();
  follow.addEventListener('change', () => deps.setFollow(follow.checked));
  el('share-leave').addEventListener('click', () => deps.leave());

  el<HTMLFormElement>('share-open-form').addEventListener('submit', (e) => {
    e.preventDefault();
    // Accept the bare ID or a whole link.
    const raw = el<HTMLInputElement>('share-open-id').value.trim().toLowerCase();
    const id = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)?.[0] ?? '';
    if (!PROJECT_ID.test(id)) return errorIn('share-open-error', 'That is not a project ID.');
    openProject(id);
  });

  paint();
  return {
    setProject(p) {
      project = p;
      follow.checked = deps.follow();
      paint();
    },
    setStatus(s, n) {
      status = s;
      peers = n;
      paint();
    },
  };
}
