// Tabs: each `[data-tab="Label"]` element in the page is a panel; one shows at a time.
// `data-tab-group` on a panel puts its tab under a small heading in the tab bar ("All sites",
// "Selected site", "Learn"), so it is clear which tabs follow the selected site.
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
  let lastGroup = '';
  /** Where the next tab goes: the bar itself, or the run of tabs that share a group. */
  let run: HTMLElement = nav;
  let heading: HTMLElement | null = null;
  tabs = [...document.querySelectorAll<HTMLElement>('[data-tab]')].map((panel, i) => {
    const label = panel.dataset.tab ?? `Tab ${i + 1}`;
    const slug = slugOf(label);
    const group = panel.dataset.tabGroup ?? '';
    const groupSlug = slugOf(group);
    if (group !== lastGroup) {
      run = nav;
      heading = null;
      if (group) {
        // A group's heading and its tabs stay together when the bar wraps. Neither the run nor
        // the heading is a tab: each tab names its group to assistive technology through
        // aria-describedby instead.
        run = document.createElement('div');
        run.className = `tab-run${panel.classList.contains('v-learn') ? ' v-learn' : ''}`;
        run.dataset.group = groupSlug;
        run.setAttribute('role', 'presentation');
        heading = document.createElement('span');
        heading.className = 'tab-group';
        heading.dataset.group = groupSlug;
        heading.id = `tab-group-${groupSlug}-${i}`;
        heading.textContent = group;
        heading.setAttribute('aria-hidden', 'true');
        run.appendChild(heading);
        nav.appendChild(run);
      }
    }
    lastGroup = group;
    const describedBy = heading;
    const button = document.createElement('button');
    button.type = 'button';
    button.role = 'tab';
    button.id = `tab-${slug}`;
    button.textContent = label;
    button.setAttribute('aria-controls', `panel-${slug}`);
    if (group) {
      button.dataset.group = groupSlug;
      if (describedBy) button.setAttribute('aria-describedby', describedBy.id);
    }
    panel.id ||= `panel-${slug}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', button.id);
    button.addEventListener('click', () => showTab(slug));
    if (panel.classList.contains('v-learn')) button.classList.add('v-learn');
    run.appendChild(button);
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

/** Change the words of a group's heading in the tab bar (the selected site's name, say). */
export function nameTabGroup(group: string, text: string): void {
  for (const el of document.querySelectorAll<HTMLElement>(
    `.tab-group[data-group="${slugOf(group)}"]`,
  )) {
    el.textContent = text;
  }
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
