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

/**
 * Single-character shortcuts (letters, digits, punctuation) can be switched off in the help
 * dialog: they can clash with a screen reader's own keys, with speech input, or with a browser's
 * find-as-you-type. Arrows, Home and Ctrl+/ are not affected. The choice is kept in this browser.
 */
const KEYS_OFF = 'shortcut-keys-off';
let charKeys = true;
const isCharKey = (e: KeyboardEvent): boolean => e.key.length === 1;

/**
 * Left and Right belong to a sideways-scrolling region while it has the focus (the planner's
 * table, the chart on a narrow screen): otherwise a keyboard user could not scroll it.
 */
function scrollsSideways(e: KeyboardEvent): boolean {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return false;
  const t = e.target instanceof HTMLElement ? e.target : null;
  if (!t || t.scrollWidth <= t.clientWidth) return false;
  const overflow = getComputedStyle(t).overflowX;
  return overflow === 'auto' || overflow === 'scroll';
}

const isHelpKey = (e: KeyboardEvent): boolean =>
  ((e.ctrlKey || e.metaKey) && e.key === '/') ||
  (charKeys && plain(e) && e.key === '?' && !typing(e));

export function setupShortcuts(shortcuts: Shortcut[], dialog: HTMLDialogElement): void {
  renderHelp(shortcuts, dialog);
  try {
    charKeys = localStorage.getItem(KEYS_OFF) !== '1';
  } catch {
    charKeys = true; // storage blocked: on, as shipped
  }
  const toggle = dialog.querySelector<HTMLInputElement>('#shortcut-keys');
  if (toggle) {
    toggle.checked = charKeys;
    toggle.addEventListener('change', () => {
      charKeys = toggle.checked;
      try {
        if (charKeys) localStorage.removeItem(KEYS_OFF);
        else localStorage.setItem(KEYS_OFF, '1');
      } catch {
        // storage blocked: lasts until the page is reloaded
      }
    });
  }
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
    if (dialog.open || typing(e) || scrollsSideways(e)) return;
    if (!charKeys && isCharKey(e)) return;
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
    // Each group stays whole, so the dialog can lay the groups out in two columns.
    const box = document.createElement('div');
    box.className = 'shortcut-group';
    box.append(h, dl);
    body.append(box);
  }
}
