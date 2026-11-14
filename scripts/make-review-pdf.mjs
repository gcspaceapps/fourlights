// Build a review document: a screenshot of every page, view and tab of the app, each with a
// short description, as one PDF to send to a reviewer.
//
//   npm run review-pdf                      (needs the app running: ./ops/dev)
//   BASE=http://127.0.0.1:8790 npm run review-pdf
//   SITE_PASSWORD=... npm run review-pdf    (when the copy you point at has the password gate on)
//
// Output: stages/03_pitch/output/four-lights-review.pdf. Uses the installed Chrome through
// Playwright, the same as the end-to-end tests. To add a page, add an entry to SHOTS.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.env.BASE ?? 'http://localhost:8787').replace(/\/$/, '');
const OUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../stages/03_pitch/output/four-lights-review.pdf',
);
/** The password gate is HTTP basic auth with a fixed user name (api/src/index.ts). */
const CREDENTIALS = process.env.SITE_PASSWORD
  ? { username: 'fourlights', password: process.env.SITE_PASSWORD }
  : undefined;
const WIDTH = 1280;
/** Tallest slice of a screenshot that fits a page under its heading, then on a page of its own. */
const FIRST_SLICE = 1250;
const NEXT_SLICE = 1750;

const TABS = {
  planner: {
    label: 'Planner',
    text: 'The Slip Planner, the page people land on. Each row is one of the 12 candidate sites and each column is a landing date around the planned one. A cell shows the usable days in the mission window: time with sunlight and a link to Earth. Colour and shape give the verdict (works, marginal, no power). The slip buttons move the planned landing a day at a time, and the question box takes a plain-English question: a language model only turns the words into settings, the planner computes the answer. Choosing a cell opens that site and date in the Sun-Path Chart.',
  },
  map: {
    label: 'Map',
    text: 'A 3D Moon built from NASA Lunar Reconnaissance Orbiter imagery and elevation, with the sites marked and coloured by their verdict for the planned landing. Drag to turn, scroll to zoom. The buttons switch the layer (imagery, elevation, polar shading), show the latitude and longitude lines and fly to the whole Moon or the south pole. The list beside it selects a site or opens its chart. "Add a site on the map" keeps a note of your own position in this browser; no lights are computed for it.',
  },
  'sun-path-chart': {
    label: 'Sun-Path Chart',
    text: 'The view from one site, as if standing there and turning all the way round. The grey shape is the real skyline from NASA laser-altimeter terrain; the gold line is the path of the Sun over the mission window and the blue line is the path of Earth. The time slider moves through the window hour by hour and the four lights (Sun, Earth, Power, Comms) say what the site has at that hour. Below are the raw pointing numbers and an hourly CSV download. Observer height and the centre direction are set above the chart.',
  },
  'survive-the-night': {
    label: 'Survive the Night',
    text: 'A simple battery model for the selected site and window. Pick a power system (round illustrative numbers, each with a credited NASA photograph) or adjust the solar array, loads and battery, and the chart shows the state of charge hour by hour, with the dark hours shaded, and whether the vehicle survives.',
  },
  'about-this-site': {
    label: 'About this site',
    text: 'Facts about the selected site: where it is, which elevation models its skyline was computed from, and a short written review of the site drawn from our own numbers.',
  },
  'start-here': {
    label: 'Start here',
    text: 'Learn view only. A plain-language introduction: why the Sun never climbs at the south pole, why Earth sits on the horizon too, and why anyone wants to land there, with NASA photographs and two small charts drawn from the site data.',
  },
  'where-ai-is-used': {
    label: 'Where AI is used',
    text: 'Learn view only. Says exactly where a language model is used on the page (understanding a typed question, writing the site reviews) and where it is not (every number and verdict), including a case where it got something wrong, and questions for a class to discuss.',
  },
  'try-and-glossary': {
    label: 'Try and glossary',
    text: 'Learn view only. A list of things to try on the page and a glossary of the words used.',
  },
};

const MAIN = ['planner', 'map', 'sun-path-chart', 'survive-the-night', 'about-this-site'];
const VIEWS = [
  {
    id: 'explore',
    label: 'Explore view',
    text: 'The default view: the tools with a short explanation beside each one.',
    tabs: MAIN,
  },
  {
    id: 'mission',
    label: 'Mission view',
    text: 'For someone who already knows the tool: the explanations are hidden and a strip of keyboard shortcuts takes their place.',
    tabs: MAIN,
  },
  {
    id: 'learn',
    label: 'Learn view',
    text: 'For students and newcomers: the same tools with longer explanations, plus three teaching tabs.',
    tabs: ['start-here', ...MAIN, 'where-ai-is-used', 'try-and-glossary'],
  },
];

/** Every screenshot in the document, in order. */
const SHOTS = [
  ...VIEWS.flatMap((view) =>
    view.tabs.map((tab, i) => ({
      section: i === 0 ? { title: view.label, text: view.text } : undefined,
      title: `${view.label}: ${TABS[tab].label}`,
      text: TABS[tab].text,
      path: `/#v=${view.id}&tab=${tab}`,
      map: tab === 'map',
    })),
  ),
  {
    section: {
      title: 'Dialogs and dark mode',
      text: 'Parts of the page that open over it, and the dark theme.',
    },
    title: 'Share Project',
    text: 'Opened from the header. Naming a project gives it an ID and a link; everyone who opens the link sees the same selected site, date, window and added sites live, and can choose to follow the same tab and view. There are no accounts: a project is found only by its ID.',
    path: '/#v=explore&tab=planner',
    open: '#share-open',
    dialog: '#share',
  },
  {
    title: 'Keyboard shortcuts',
    text: 'Opened with Ctrl + / or from the header. Every control on the page has a key.',
    path: '/#v=explore&tab=planner',
    open: 'button[aria-label^="Keyboard shortcuts"]',
    dialog: '#shortcuts',
  },
  {
    title: 'Dark mode',
    text: 'The switch in the header forces light or dark; otherwise the page follows the device. Shown here on the Sun-Path Chart.',
    path: '/#v=explore&tab=sun-path-chart',
    theme: 'dark',
  },
  {
    section: {
      title: 'Other pages',
      text: 'Two supporting pages linked from the header and footer.',
    },
    title: 'Data sources',
    text: 'Every dataset the app uses: what it is, what we use it for, how to cite it, what we compare our results against, and which numbers are our own choices.',
    path: '/sources',
  },
  {
    title: 'How we built it',
    text: 'The architecture and the reasoning: the pipeline that computes each skyline, how the page is served, the design decisions and their trade-offs, how we know the results are right, testing, the stack and the team.',
    path: '/how',
  },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function capture(browser, shot) {
  const theme = shot.theme ?? 'light';
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: 900 },
    colorScheme: theme,
    reducedMotion: 'reduce',
    httpCredentials: CREDENTIALS,
  });
  await context.addInitScript((t) => {
    try {
      localStorage.setItem('theme', t);
    } catch {
      // Storage is not available: the colour scheme alone decides.
    }
  }, theme);
  const page = await context.newPage();
  await page.goto(BASE + shot.path, { waitUntil: 'load' });
  if (shot.path.startsWith('/#')) {
    await page
      .locator('#answer', { hasText: 'sites work' })
      .waitFor({ state: 'attached', timeout: 30_000 });
  }
  if (shot.map) {
    // The Moon's tiles arrive over the network after the tab opens.
    await page.locator('#globe-view canvas').waitFor({ timeout: 30_000 });
    await page.waitForTimeout(6000);
  }
  if (shot.open) {
    await page.locator(shot.open).first().click();
    await page.locator(shot.dialog).waitFor({ state: 'visible' });
  }
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(700);

  const jpeg = { type: 'jpeg', quality: 82 };
  const slices = [];
  if (shot.dialog) {
    slices.push(await page.screenshot(jpeg));
  } else {
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0, max = FIRST_SLICE; y < height; y += max, max = NEXT_SLICE) {
      // A little over one slice is shrunk to fit rather than spilling a sliver onto a new page.
      const left = height - y;
      const h = left <= max * 1.4 ? left : max;
      max = h;
      slices.push(
        await page.screenshot({
          ...jpeg,
          fullPage: true,
          clip: { x: 0, y, width: WIDTH, height: h },
        }),
      );
    }
  }
  await context.close();
  return slices;
}

function documentHtml(entries) {
  const today = new Date().toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const contents = entries
    .map(
      (e, n) =>
        (e.section ? `<li class="sec">${esc(e.section.title)}</li>` : '') +
        `<li>${n + 1}. ${esc(e.title)}</li>`,
    )
    .join('');
  const body = entries
    .map((e, n) => {
      const section = e.section
        ? `<h2>${esc(e.section.title)}</h2><p class="lead">${esc(e.section.text)}</p>`
        : '';
      const images = e.slices
        .map((buf, i) => {
          const part = e.slices.length > 1 ? ` (part ${i + 1} of ${e.slices.length})` : '';
          return `<figure${i ? ' class="cont"' : ''}><img src="data:image/jpeg;base64,${buf.toString('base64')}" alt="${esc(e.title)}${part}" />${part ? `<figcaption>${esc(e.title)}${part}</figcaption>` : ''}</figure>`;
        })
        .join('');
      return `<section class="shot">${section}<h3>${n + 1}. ${esc(e.title)}</h3><p>${esc(e.text)}</p>${images}</section>`;
    })
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Four Lights: review document</title>
<style>
  @page { size: A4; margin: 14mm 13mm 16mm; }
  body { font: 10.5pt/1.45 system-ui, "Segoe UI", Helvetica, Arial, sans-serif; color: #1a1d24; margin: 0; }
  h1 { font-size: 30pt; margin: 60mm 0 4mm; }
  h2 { font-size: 17pt; margin: 0 0 2mm; border-bottom: 1.5pt solid #1a1d24; padding-bottom: 1.5mm; }
  h3 { font-size: 12.5pt; margin: 0 0 1.5mm; }
  p { margin: 0 0 3mm; }
  .lead { color: #444b57; }
  .cover p { max-width: 150mm; font-size: 11.5pt; }
  .cover .date { color: #444b57; margin-top: 10mm; }
  .ask li { margin-bottom: 1.5mm; }
  .contents { columns: 2; padding-left: 5mm; list-style: none; }
  .contents li { margin-bottom: 1mm; }
  .contents .sec { list-style: none; font-weight: 600; margin: 3mm 0 1mm -5mm; break-after: avoid; }
  .shot { break-before: page; }
  figure { margin: 0 0 3mm; }
  figure.cont { break-before: page; }
  img { display: block; max-width: 100%; max-height: 196mm; border: 0.5pt solid #b9bfca; }
  figure.cont img { max-height: 255mm; }
  figcaption { font-size: 8.5pt; color: #5a6270; margin-top: 1mm; }
</style></head><body>
<section class="cover">
  <h1>Four Lights</h1>
  <p><strong>Review document.</strong> Which lunar south-pole landing site still works when your launch slips?</p>
  <p>Four Lights is our entry for the NASA Space Apps Challenge 2026 (challenge 11, Lunar Landing Site Navigator). It compares 12 candidate landing sites near the Moon's south pole, and landing dates, by where the Sun and Earth sit against each site's real terrain skyline, for every hour of 2028 and 2029. Team: Steve Dalton and Matt Paine.</p>
  <p>This document shows every page, view and tab of the app with a short note on what each one does, so you can review it without the app in front of you.</p>
  <p><strong>What we would like to hear:</strong></p>
  <ul class="ask">
    <li>Is it clear, within a few seconds of the first page, what the app answers?</li>
    <li>Which screen is the hardest to understand, and what would you expect to see there instead?</li>
    <li>Anything that looks wrong, cluttered or unfinished.</li>
    <li>Is there anything you would want to do that you cannot find?</li>
  </ul>
  <p class="date">Screenshots taken ${esc(today)}.</p>
</section>
<h2 style="break-before: page">Contents</h2>
<ul class="contents">${contents}</ul>
${body}
</body></html>`;
}

async function main() {
  try {
    const basic = CREDENTIALS
      ? Buffer.from(`${CREDENTIALS.username}:${CREDENTIALS.password}`).toString('base64')
      : '';
    const res = await fetch(`${BASE}/api/health`, {
      headers: basic ? { authorization: `Basic ${basic}` } : {},
    });
    if (res.status === 401) throw new Error('it wants the password: set SITE_PASSWORD');
    if (!res.ok) throw new Error(`status ${res.status}`);
  } catch (err) {
    console.error(`The app is not answering at ${BASE}: ${err.message}.`);
    console.error('Start it with ./ops/dev, or point BASE at a running copy:');
    console.error('  BASE=http://127.0.0.1:8790 npm run review-pdf');
    process.exit(1);
  }
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const entries = [];
    for (const shot of SHOTS) {
      process.stdout.write(`  ${shot.title} ... `);
      const slices = await capture(browser, shot);
      console.log(`${slices.length} image${slices.length === 1 ? '' : 's'}`);
      entries.push({ ...shot, slices });
    }
    const page = await browser.newPage();
    await page.setContent(documentHtml(entries), { waitUntil: 'load' });
    await mkdir(dirname(OUT), { recursive: true });
    await page.pdf({
      path: OUT,
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="width:100%;font:8pt system-ui,sans-serif;color:#5a6270;padding:0 13mm;display:flex;justify-content:space-between"><span>Four Lights: review document</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
    });
    console.log(`Wrote ${OUT}`);
  } finally {
    await browser.close();
  }
}

await main();
