// Turns a short <select> into a row of buttons. The <select> stays in the page, hidden, as the
// single source of truth: clicking a button sets it and fires its `change` event, so everything
// that reads or sets the select (the URL, keyboard shortcuts, tests) keeps working unchanged.

export function segmented(select: HTMLSelectElement): void {
  const label = select.closest('label');
  if (!label) return;
  // The label's own words, without the select's option texts or an info tip's text.
  const words = label.cloneNode(true) as HTMLElement;
  for (const extra of words.querySelectorAll('select, .info')) extra.remove();
  const name = (words.textContent ?? '').replace(/\s+/g, ' ').trim();

  const field = document.createElement('div');
  field.className = 'field';
  const caption = document.createElement('span');
  caption.className = 'field-label';
  // Keep the label's own content (text and any info tip), minus the select.
  for (const node of [...label.childNodes]) if (node !== select) caption.appendChild(node);
  const group = document.createElement('div');
  group.className = 'segmented';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', name);

  select.hidden = true;
  select.setAttribute('aria-hidden', 'true');
  select.tabIndex = -1;
  field.append(caption, group, select);
  label.replaceWith(field);

  const sync = (): void => {
    const options = [...select.options];
    const same =
      group.children.length === options.length &&
      options.every((o, i) => (group.children[i] as HTMLElement).dataset.value === o.value);
    if (!same) {
      group.replaceChildren(
        ...options.map((o) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.dataset.value = o.value;
          b.textContent = o.text;
          // An option's title becomes the button's tooltip (what a map layer is, say).
          if (o.title) b.title = o.title;
          // Bare numbers get the field's name read out with them ("Observer height (m): 5").
          if (/^[\d.]+$/.test(o.text)) b.setAttribute('aria-label', `${name}: ${o.text}`);
          b.addEventListener('click', () => {
            if (select.value === o.value) return;
            select.value = o.value;
            select.dispatchEvent(new Event('change'));
          });
          return b;
        }),
      );
    }
    for (const b of group.children) {
      b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.value === select.value));
    }
  };
  sync();
  select.addEventListener('change', sync);
  // Options can be replaced (observer heights differ per site) and values set from code.
  new MutationObserver(sync).observe(select, { childList: true });
  field.addEventListener('segmented:sync', sync);
}

/** Re-read every segmented control's select (after setting `.value` from code without an event). */
export function syncSegmented(): void {
  for (const f of document.querySelectorAll('.field')) f.dispatchEvent(new Event('segmented:sync'));
}
