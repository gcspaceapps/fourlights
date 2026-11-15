// The guide: a panel beside the tabs, in the Explore view, whose content follows the tab that is
// open. Each `[data-guide="<tab slug>"]` section in the panel shows only for that tab; the rest
// (why the south pole, where AI is used, the glossary) is there on every tab. It is switched on
// and off with the Guide button at the end of the tab bar, and the choice is kept in this browser.
// Explore with the guide open is what a shared project and the URL call the "learn" mode.

const KEY = 'guide';

function stored(): boolean | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'open' ? true : v === 'closed' ? false : null;
  } catch {
    return null; // storage blocked: decide from the screen
  }
}

export function guideOpen(): boolean {
  return document.documentElement.dataset.guideState === 'open';
}

/** Open or close the guide. `remember` keeps the choice for the next visit. */
export function setGuide(open: boolean, remember = true): void {
  document.documentElement.dataset.guideState = open ? 'open' : 'closed';
  document.getElementById('guide-toggle')?.setAttribute('aria-expanded', String(open));
  if (!remember) return;
  try {
    localStorage.setItem(KEY, open ? 'open' : 'closed');
  } catch {
    // storage blocked: the choice lasts until the page is reloaded
  }
}

/**
 * Wire the Guide button. Unless something has already set it (a link, a shared project), the
 * guide starts as it was left; on a first visit it is open where there is room beside the page
 * and closed on a narrow screen.
 */
export function setupGuide(onChange: () => void): void {
  if (document.documentElement.dataset.guideState === undefined) {
    setGuide(stored() ?? window.matchMedia('(min-width: 64rem)').matches, false);
  }
  document.getElementById('guide-toggle')?.addEventListener('click', () => {
    setGuide(!guideOpen());
    onChange();
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
