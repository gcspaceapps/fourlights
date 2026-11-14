// Tabs: each `[data-tab="Label"]` element in the page is a panel; one shows at a time.
// Panels marked `v-learn` only exist in the Learn view. Left and right arrow keys step through
// the tabs (wired in main.ts); the active tab lives in the URL hash as `tab=<slug>`.

interface Tab {
  slug: string;
  label: string;
  panel: HTMLElement;
  button: HTMLButtonElement;
}

let tabs: Tab[] = [];
let active = '';
let changed: (slug: string) => void = () => {};

const slugOf = (label: string): string =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** A Learn-only panel is not available in the other views. */
function available(t: Tab): boolean {
  const view = document.documentElement.dataset.view;
  return !(t.panel.classList.contains('v-learn') && view !== 'learn');
}

const visibleTabs = (): Tab[] => tabs.filter(available);

export function activeTab(): string {
  return active;
}

export function setupTabs(
  nav: HTMLElement,
  initial: string | null,
  onChange: (slug: string) => void,
): void {
  changed = onChange;
  tabs = [...document.querySelectorAll<HTMLElement>('[data-tab]')].map((panel, i) => {
    const label = panel.dataset.tab ?? `Tab ${i + 1}`;
    const slug = slugOf(label);
    const button = document.createElement('button');
    button.type = 'button';
    button.role = 'tab';
    button.id = `tab-${slug}`;
    button.textContent = label;
    button.setAttribute('aria-controls', `panel-${slug}`);
    panel.id ||= `panel-${slug}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', button.id);
    button.addEventListener('click', () => showTab(slug));
    if (panel.classList.contains('v-learn')) button.classList.add('v-learn');
    nav.appendChild(button);
    return { slug, label, panel, button };
  });
  // Tab buttons for Learn-only panels follow the same view rules as the panels.
  nav.addEventListener('keydown', (e) => {
    // Arrow keys are handled globally; stop the page handler double-stepping from the tab bar.
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.stopPropagation();
    if (e.key === 'ArrowLeft') stepTab(-1, true);
    if (e.key === 'ArrowRight') stepTab(1, true);
  });
  showTab(initial ?? '', false);
}

/** Show a tab by slug. An unknown or unavailable slug falls back to the first available tab. */
export function showTab(slug: string, notify = true, focus = false): void {
  const list = visibleTabs();
  const target = list.find((t) => t.slug === slug) ?? list[0];
  if (!target) return;
  active = target.slug;
  for (const t of tabs) {
    const on = t === target;
    t.panel.classList.toggle('tab-off', !on);
    t.button.setAttribute('aria-selected', String(on));
    t.button.tabIndex = on ? 0 : -1;
  }
  if (focus) target.button.focus();
  if (notify) changed(active);
}

/** Step to the next or previous available tab, wrapping round. */
export function stepTab(by: number, focus = false): void {
  const list = visibleTabs();
  if (!list.length) return;
  const i = list.findIndex((t) => t.slug === active);
  const next = list[(i + by + list.length) % list.length];
  if (next) showTab(next.slug, true, focus);
}

/** Call after the view changes: a Learn-only tab may have gone, or come back. */
export function refreshTabs(): void {
  if (tabs.length) showTab(active, false);
}
