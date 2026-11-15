// The Learn view's guide: a panel beside the tabs whose content follows the tab that is open.
// Each `[data-guide="<tab slug>"]` section in the panel shows only for that tab; the rest of the
// panel (the introduction, where AI is used, the glossary) is there on every tab. Whether the
// panel is open is each person's own choice, kept in this browser and never shared.

const KEY = 'guide';

function stored(): 'open' | 'closed' | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'open' || v === 'closed' ? v : null;
  } catch {
    return null; // storage blocked: decide from the screen
  }
}

/** Open by default where there is room beside the page; folded away on a narrow screen. */
function initial(): 'open' | 'closed' {
  return stored() ?? (window.matchMedia('(min-width: 64rem)').matches ? 'open' : 'closed');
}

function apply(state: 'open' | 'closed', toggle: HTMLElement): void {
  document.documentElement.dataset.guideState = state;
  toggle.setAttribute('aria-expanded', String(state === 'open'));
  toggle.textContent = state === 'open' ? 'Hide' : 'Show the guide';
}

export function setupGuide(): void {
  const toggle = document.getElementById('guide-toggle');
  if (!toggle) return;
  apply(initial(), toggle);
  toggle.addEventListener('click', () => {
    const next = document.documentElement.dataset.guideState === 'open' ? 'closed' : 'open';
    apply(next, toggle);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // storage blocked: the choice lasts until the page is reloaded
    }
  });
}

/** Show the guide for one tab: its own section, and its name in the panel's heading. */
export function showGuide(slug: string, label: string): void {
  for (const el of document.querySelectorAll<HTMLElement>('#guide [data-guide]')) {
    el.hidden = el.dataset.guide !== slug;
  }
  const where = document.getElementById('guide-where');
  if (where) where.textContent = label ? `: ${label}` : '';
}
