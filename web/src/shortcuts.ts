// Keyboard shortcuts and their help dialog (Ctrl+/ or ?). One list drives both, so the help
// can't drift from what the keys do. Single-key shortcuts are ignored while typing in a field.

export interface Shortcut {
  /** Keys as shown in the help, e.g. ['[', ']']. */
  keys: string[];
  what: string;
  group: 'Planner' | 'Sun-Path Chart' | 'Page';
  /** Returns true if this key event is the shortcut. */
  match: (e: KeyboardEvent) => boolean;
  run: (e: KeyboardEvent) => void;
}

const plain = (e: KeyboardEvent): boolean => !e.ctrlKey && !e.metaKey && !e.altKey;
/** A plain key press (Shift allowed only where the key itself needs it). */
export const key =
  (...keys: string[]) =>
  (e: KeyboardEvent): boolean =>
    plain(e) && keys.includes(e.key);

function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  if (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true;
  if (t.tagName !== 'INPUT') return false;
  // A range slider handles its own arrow keys; every other input is for typing.
  return true;
}

const isHelpKey = (e: KeyboardEvent): boolean =>
  ((e.ctrlKey || e.metaKey) && e.key === '/') || (plain(e) && e.key === '?' && !typing(e));

export function setupShortcuts(shortcuts: Shortcut[], dialog: HTMLDialogElement): void {
  renderHelp(shortcuts, dialog);
  const toggleHelp = (): void => {
    if (dialog.open) dialog.close();
    else dialog.showModal();
  };
  document.addEventListener('keydown', (e) => {
    if (isHelpKey(e)) {
      e.preventDefault();
      toggleHelp();
      return;
    }
    if (dialog.open || typing(e)) return;
    const s = shortcuts.find((x) => x.match(e));
    if (!s) return;
    e.preventDefault();
    s.run(e);
  });
  for (const b of document.querySelectorAll<HTMLElement>('[data-open-shortcuts]')) {
    b.addEventListener('click', toggleHelp);
  }
  // Click on the backdrop closes it.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
}

function renderHelp(shortcuts: Shortcut[], dialog: HTMLDialogElement): void {
  const body = dialog.querySelector('.shortcut-list');
  if (!body) return;
  const all: Pick<Shortcut, 'keys' | 'what' | 'group'>[] = [
    ...shortcuts,
    { keys: ['Ctrl /', '?'], what: 'Show or hide this help', group: 'Page' },
    { keys: ['Esc'], what: 'Close this help', group: 'Page' },
    { keys: ['Tab'], what: 'Move between controls; Enter or Space activates', group: 'Page' },
  ];
  body.replaceChildren();
  for (const group of ['Planner', 'Sun-Path Chart', 'Page'] as const) {
    const h = document.createElement('h3');
    h.textContent = group;
    const dl = document.createElement('dl');
    for (const s of all.filter((x) => x.group === group)) {
      const dt = document.createElement('dt');
      s.keys.forEach((k, i) => {
        if (i) dt.append(' ');
        const kbd = document.createElement('kbd');
        kbd.textContent = k;
        dt.appendChild(kbd);
      });
      const dd = document.createElement('dd');
      dd.textContent = s.what;
      dl.append(dt, dd);
    }
    body.append(h, dl);
  }
}
