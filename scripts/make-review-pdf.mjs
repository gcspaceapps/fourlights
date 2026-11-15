// Build the review document: screenshots of every page, view, tab and the states a reviewer
// asked for, each captioned with the steps taken to reach it and the viewport, as one PDF.
//
//   npm run review-pdf                      (needs the app running: ./ops/dev)
//   BASE=http://127.0.0.1:8790 npm run review-pdf
//   SITE_PASSWORD=... npm run review-pdf    (when the copy you point at has the password gate on)
//   ONLY=3,4 npm run review-pdf             (just those sections, to a -part.pdf beside the full one)
//
// Output: stages/03_pitch/output/four-lights-review.pdf. Uses the installed Chrome through
// Playwright, the same as the end-to-end tests. Run it against a local copy: the Share Project
// section creates a project, so it is skipped unless BASE is localhost. The plain-English
// question needs the Workers AI binding (wrangler dev without --local); without it those
// screenshots show the "unavailable" message, which is what a user would see too.
//
// To add a state, add an entry to one of the section lists below. An entry is
// { title, text, steps, path, viewport, theme, run(page, note, part), capture }.
// The functions passed to page.evaluate run in the browser, where these exist.
/* global document, innerWidth, innerHeight, scrollTo */
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
const AUTH = CREDENTIALS
  ? {
      authorization: `Basic ${Buffer.from(`${CREDENTIALS.username}:${CREDENTIALS.password}`).toString('base64')}`,
    }
  : {};
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(BASE);

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const TABLET = { width: 768, height: 1024 };
const PROJECTOR = { width: 1280, height: 720 };
/** A page-wide image is this many CSS pixels; narrower captures print proportionally narrower. */
const FULL_WIDTH = DESKTOP.width;
/** Tallest slice, in CSS pixels, that fits a page under its heading, and on a page of its own. */
const FIRST_SLICE = 1300;
const NEXT_SLICE = 1780;
const JPEG = { type: 'jpeg', quality: 62 };
/**
 * How wide a full-window capture prints, as a share of the page: in proportion to a desktop
 * capture, but never under 45%, so a phone capture can still be read.
 */
const printShare = (viewport) => Math.max(0.45, Math.min(1, viewport.width / FULL_WIDTH));

const DEMO = 'the demo scenario (Peak near Shackleton, landing 19 Apr 2028, 7-day window)';
const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------------------------
// Driving the page
// ---------------------------------------------------------------------------------------------

async function newPage(browser, { viewport = DESKTOP, theme = 'light' } = {}) {
  const context = await browser.newContext({
    viewport,
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
  return context.newPage();
}

async function settle(page, ms = 600) {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

/** Open a page of the app and wait until it has drawn. */
async function open(page, path) {
  await page.goto(BASE + path, { waitUntil: 'load' });
  if (path === '/' || path.startsWith('/#')) {
    // The planner has answered (the wording varies: "6 of 12 sites work", "no site works").
    await page.waitForFunction(
      () => (document.getElementById('answer')?.textContent ?? '').trim().length > 20,
      null,
      { timeout: 30_000 },
    );
  }
  await settle(page);
}

/** The 3D Moon has drawn and its tiles have had time to arrive. */
async function moonReady(page, ms = 5000) {
  await page.locator('#globe-view canvas').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(ms);
}

const tab = (page, name) => page.getByRole('tab', { name, exact: true }).click();
const pick = (page, group, name) =>
  page.getByRole('group', { name: group }).getByRole('button', { name, exact: true }).click();

/** Which lights are on at each hour of the window: [{t, sun, earth, power, comms}]. */
function scanLights(page) {
  return page.evaluate(() => {
    const time = document.getElementById('time');
    const keep = time.value;
    const out = [];
    for (let t = 0; t <= Number(time.max); t++) {
      time.value = String(t);
      time.dispatchEvent(new Event('input'));
      const row = { t };
      for (const li of document.querySelectorAll('#lights li')) {
        row[li.dataset.light] = li.classList.contains('on');
      }
      out.push(row);
    }
    time.value = keep;
    time.dispatchEvent(new Event('input'));
    return out;
  });
}

async function setTime(page, t) {
  await page.locator('#time').fill(String(t));
  await page.waitForTimeout(200);
}

const timeLabel = (page) => page.locator('#time-label').innerText();

/** Find a site, landing date and hour matching `want`: the first hit, dates in the order given. */
async function findHour(browser, sites, dates, want, days = 7) {
  const page = await newPage(browser);
  try {
    for (const date of [].concat(dates)) {
      for (const site of sites) {
        await open(page, `/#site=${site}&date=${date}&days=${days}&tab=sun-path-chart`);
        const hit = (await scanLights(page)).find((r) => want(r));
        if (hit) return { site, date, days, t: hit.t };
      }
    }
    return null;
  } finally {
    await page.context().close();
  }
}

// ---------------------------------------------------------------------------------------------
// Capturing
// ---------------------------------------------------------------------------------------------

/** A dashed line across a full-page capture where the bottom of the viewport falls. */
async function markFold(page, y) {
  await page.evaluate((top) => {
    const line = document.createElement('div');
    line.id = 'review-fold';
    line.textContent = `fold: bottom of a ${innerWidth} x ${innerHeight} window`;
    line.style.cssText = `position:absolute;left:0;right:0;top:${top}px;z-index:99999;border-top:2px dashed #d6006e;color:#d6006e;font:600 12px system-ui,sans-serif;text-align:right;padding:1px 8px 0 0;pointer-events:none;height:0;overflow:visible`;
    document.body.appendChild(line);
  }, y);
}

/**
 * Take the pictures for one state. `how` is 'full' (the whole page, in page-sized slices, fold
 * marked), 'view' (what the window shows), a selector (that element), or {around, pad} for the
 * part of the window around one or more elements.
 */
async function shoot(page, how = 'full') {
  const vp = page.viewportSize();
  if (how === 'view') {
    return {
      images: [await page.screenshot(JPEG)],
      width: vp.width,
      mode: 'the window as shown',
    };
  }
  if (typeof how === 'string' && how !== 'full') {
    const el = page.locator(how).first();
    const box = await el.boundingBox();
    return {
      images: [await el.screenshot(JPEG)],
      width: Math.round(box?.width ?? vp.width),
      mode: 'one part of the page',
    };
  }
  if (typeof how === 'object') {
    const boxes = [];
    for (const sel of [].concat(how.around)) {
      const b = await page.locator(sel).first().boundingBox();
      if (b) boxes.push(b);
    }
    const pad = how.pad ?? 24;
    const x0 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
    const y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
    const x1 = Math.min(vp.width, Math.max(...boxes.map((b) => b.x + b.width)) + pad);
    const y1 = Math.min(vp.height, Math.max(...boxes.map((b) => b.y + b.height)) + pad);
    const clip = { x: x0, y: y0, width: Math.max(40, x1 - x0), height: Math.max(40, y1 - y0) };
    return {
      images: [await page.screenshot({ ...JPEG, clip })],
      width: Math.round(clip.width),
      mode: 'one part of the window',
    };
  }
  await page.evaluate(() => scrollTo(0, 0));
  const height = await page.evaluate('document.documentElement.scrollHeight');
  const folds = height > vp.height + 4;
  if (folds) await markFold(page, vp.height);
  const images = [];
  // A capture printed larger than true proportion fits fewer of its pixels on a page.
  const k = vp.width / FULL_WIDTH / printShare(vp);
  for (let y = 0, max = FIRST_SLICE * k; y < height; y += max, max = NEXT_SLICE * k) {
    // A little over one slice is shrunk to fit rather than spilling a sliver onto a new page.
    const left = height - y;
    const h = left <= max * 1.35 ? left : max;
    max = h;
    images.push(
      await page.screenshot({
        ...JPEG,
        fullPage: true,
        clip: { x: 0, y, width: vp.width, height: h },
      }),
    );
  }
  await page.evaluate(() => document.getElementById('review-fold')?.remove());
  return {
    images,
    width: vp.width,
    mode: folds ? 'full page, fold marked' : 'full page (it fits the window, so no fold)',
  };
}

/** Run one entry: open, do its steps, capture. Returns the entry with its pictures. */
async function capture(browser, entry) {
  const viewport = entry.viewport ?? DESKTOP;
  const page = await newPage(browser, { viewport, theme: entry.theme });
  const notes = [];
  const parts = [];
  /** Extra pictures within one entry: part('caption', how). */
  const part = async (caption, how) => parts.push({ caption, ...(await shoot(page, how)) });
  try {
    await open(page, entry.path ?? '/');
    if (entry.run) await entry.run(page, (text) => notes.push(text), part);
    if (!parts.length || entry.capture) {
      parts.push({ caption: '', ...(await shoot(page, entry.capture)) });
    }
  } catch (err) {
    notes.push(`This state could not be captured: ${String(err.message).split('\n')[0]}`);
  } finally {
    await page.context().close();
  }
  return { ...entry, viewport, notes, parts };
}

// ---------------------------------------------------------------------------------------------
// Part A: every view and tab (the sections of the first version of this document)
// ---------------------------------------------------------------------------------------------

const TABS = {
  planner: {
    label: 'Planner',
    text: 'The Slip Planner, the page people land on. Each row is one of the 12 candidate sites and each column is a landing date around the planned one. A cell shows the usable days in the mission window: time with sunlight and a link to Earth. Colour and shape give the verdict (works, marginal, no power). The slip buttons move the planned landing a day at a time, and the question box takes a plain-English question: a language model only turns the words into settings, the planner computes the answer. Choosing a cell opens that site and date in the Sun-Path Chart.',
  },
  map: {
    label: 'Map',
    text: 'A 3D Moon built from NASA Lunar Reconnaissance Orbiter imagery and elevation, with the sites marked and coloured by their verdict for the planned landing. Drag to turn, scroll to zoom. The controls on the map switch the layer (imagery, elevation, polar shading), show the grid lines, fly to the whole Moon or the south pole and zoom. A line under the map explains the layer in use. The list beside it selects a site and turns the Moon to it, or opens its chart. "Add a site on the map" keeps a note of your own position in this browser; no lights are computed for it.',
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
    text: 'For students and newcomers: the same tools, with a guide panel on the right that explains the tab you are on and suggests things to try.',
    tabs: MAIN,
  },
];

const overview = () => [
  ...VIEWS.map((view, v) => ({
    id: `A${v + 1}`,
    title: view.label,
    text: view.text,
    entries: view.tabs.map((t) => ({
      title: TABS[t].label,
      text: TABS[t].text,
      steps: [
        `Open the page in ${view.label} with the ${TABS[t].label} tab showing (link ending #v=${view.id}&tab=${t}); ${DEMO}.`,
      ],
      path: `/#v=${view.id}&tab=${t}`,
      run: t === 'map' ? (page) => moonReady(page) : undefined,
    })),
  })),
  {
    id: 'A4',
    title: 'Dialogs',
    text: 'Parts of the page that open over it.',
    entries: [
      {
        title: 'Share Project',
        text: 'Opened from the header. Naming a project gives it an ID and a link; everyone who opens the link sees the same selected site, date, window and added sites live, and can choose to follow the same tab and view. There are no accounts: a project is found only by its ID. Section 8 shows it in use.',
        steps: [
          'Open the page (Explore view, Planner tab).',
          'Press "Share Project" in the header.',
        ],
        run: async (page) => {
          await page.locator('#share-open').click();
          await page.locator('#share').waitFor({ state: 'visible' });
        },
        capture: 'view',
      },
      {
        title: 'Keyboard shortcuts',
        text: 'Opened with Ctrl + / or the button in the header. Every control on the page has a key.',
        steps: ['Open the page (Explore view, Planner tab).', 'Press Ctrl + /.'],
        run: async (page) => {
          await page.keyboard.press('Control+/');
          await page.locator('#shortcuts').waitFor({ state: 'visible' });
        },
        capture: 'view',
      },
    ],
  },
  {
    id: 'A5',
    title: 'Other pages',
    text: 'Two supporting pages linked from the header and footer.',
    entries: [
      {
        title: 'Data sources',
        text: 'Every dataset the app uses: what it is, what we use it for, how to cite it, what we compare our results against, and which numbers are our own choices.',
        steps: ['Follow "Data sources" in the header (/sources).'],
        path: '/sources',
      },
      {
        title: 'How we built it',
        text: 'The architecture and the reasoning: the pipeline that computes each skyline, how the page is served, the design decisions and their trade-offs, how we know the results are right, testing, the stack and the team.',
        steps: ['Follow "How we built it" in the footer (/how).'],
        path: '/how',
      },
    ],
  },
];

// ---------------------------------------------------------------------------------------------
// The states (sections 1 to 10)
// ---------------------------------------------------------------------------------------------

const ALL_SITES = [
  'shackleton-rim',
  'connecting-ridge',
  'peak-near-shackleton',
  'de-gerlache-rim',
  'de-gerlache-rim-2',
  'slater-plain',
  'haworth',
  'malapert-massif',
  'mons-mouton',
  'nobile-rim-1',
  'nobile-rim-2',
  'peak-near-cabeus-b',
];

function plannerStates() {
  const summary = async (page, note) =>
    note(`Summary text: "${await page.locator('#answer').innerText()}"`);
  return [
    {
      title: 'Slipped three days',
      steps: [`Open the page: ${DEMO}.`, 'Press "Slip + 1 day" three times.'],
      run: async (page, note) => {
        for (let i = 0; i < 3; i++) await page.locator('#slip-on').click();
        await settle(page, 300);
        await summary(page, note);
        note(
          `The Landing field now reads ${await page.locator('#plan').inputValue()}. The planned date's column is the one headed "planned"; the columns around it are labelled with their offset in days.`,
        );
      },
    },
    {
      title: 'One day earlier',
      steps: [`Open the page: ${DEMO}.`, 'Press "− 1 day" once.'],
      run: async (page, note) => {
        await page.locator('#slip-back').click();
        await settle(page, 300);
        await summary(page, note);
      },
    },
    ...['14', '30'].map((d) => ({
      title: `Mission window ${d} days`,
      steps: [
        `Open the page: ${DEMO}.`,
        `Press "${d}" in the Mission window (days) buttons on the selected-site bar.`,
      ],
      run: async (page, note) => {
        await pick(page, 'Mission window (days)', `Mission window (days): ${d}`);
        await settle(page, 300);
        await summary(page, note);
      },
    })),
    {
      title: 'A cell on hover and on keyboard focus',
      steps: [`Open the page: ${DEMO}.`],
      run: async (page, note, part) => {
        const cells = page.locator('#planner tbody tr').nth(1).locator('td button');
        const cell = cells.nth(4);
        await cell.hover();
        await page.waitForTimeout(300);
        const title = await cell.getAttribute('title');
        await part(
          'Step 2: move the mouse over the Connecting Ridge cell in the fifth date column.',
          { around: '#planner', pad: 12 },
        );
        await page.mouse.move(5, 5);
        await cells.nth(3).focus();
        await page.keyboard.press('Tab');
        await page.waitForTimeout(300);
        await part('Step 3: move the mouse away, then reach the same cell with the Tab key.', {
          around: '#planner',
          pad: 12,
        });
        note(
          `The tooltip is the browser's own (the cell's title text), which a screenshot cannot show. For this cell it reads: "${title}". It appears on hover only; a keyboard user sees no tooltip.`,
        );
      },
    },
    {
      title: 'Every (i) information popover',
      text: 'Each (i) button opens a "Where this comes from" note on hover or keyboard focus. One picture per popover, tab by tab, in Explore view.',
      steps: [
        'Open the page in Explore view.',
        'On each tab in turn, move keyboard focus to each (i) button.',
      ],
      run: async (page, note, part) => {
        let total = 0;
        for (const t of MAIN) {
          await tab(page, TABS[t].label);
          if (t === 'map') await moonReady(page, 2500);
          await page.waitForTimeout(300);
          const buttons = page.locator('.info button:visible');
          const n = await buttons.count();
          for (let i = 0; i < n; i++) {
            const b = buttons.nth(i);
            await b.scrollIntoViewIfNeeded();
            await b.focus();
            await page.waitForTimeout(250);
            const beside = await b.evaluate((el, k) => {
              const info = el.closest('.info');
              info.dataset.review = `tip-${k}`;
              const words = info.parentElement.cloneNode(true);
              for (const x of words.querySelectorAll('.info, select, input')) x.remove();
              return (words.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
            }, total);
            await part(`${TABS[t].label} tab: the (i) beside "${beside}".`, {
              around: [`[data-review="tip-${total}"]`, `[data-review="tip-${total}"] .tip`],
              pad: 16,
            });
            total++;
          }
        }
        note(`${total} popovers found across the five tabs.`);
      },
    },
    {
      title: 'A site with approximate terrain selected (Nobile Rim 1)',
      text: 'Three sites (Nobile Rim 1, Nobile Rim 2 and Peak near Cabeus B) have no 5 m terrain model under them, so their skyline starts from coarser data.',
      steps: [`Open the page: ${DEMO}.`, 'Choose "Nobile Rim 1" in the Selected site dropdown.'],
      path: '/#site=nobile-rim-1',
      run: async (page, note, part) => {
        await part('Planner tab with Nobile Rim 1 selected.', 'full');
        const title = await page
          .locator('#planner tbody tr')
          .filter({ has: page.getByRole('button', { name: 'Nobile Rim 1', exact: true }) })
          .locator('.approx')
          .getAttribute('title');
        await tab(page, 'About this site');
        await settle(page, 300);
        await part('Step 3: open the About this site tab.', 'full');
        note(
          `Where "approximate" is flagged: (1) on the Planner, as an "approx. terrain" tag after the site's name in its row (hover text: "${title}"), in the legend above the table, and after the site's name in the summary sentence; (2) on About this site, in the Source line. Nothing marks it on the selected-site bar, the Map or the Sun-Path Chart.`,
        );
      },
    },
  ];
}

function askStates() {
  const box = { around: ['#ask', '#answer'], pad: 16 };
  const ask = async (page, question, slow = 0) => {
    if (slow) {
      await page.route('**/api/ask', async (route) => {
        await sleep(slow);
        await route.continue().catch(() => {});
      });
    }
    await page.locator('#ask-q').fill(question);
    await page.locator('#ask button[type="submit"]').click();
  };
  const done = async (page) => {
    await page.waitForFunction(
      () => !/Working it out/.test(document.getElementById('ask-note').textContent ?? ''),
      null,
      { timeout: 45_000 },
    );
    await settle(page, 400);
  };
  const noteText = async (page) => (await page.locator('#ask-note').innerText()).trim();
  const report = async (page, note) => {
    note(`Note under the box: "${await noteText(page)}"`);
    note(`Summary text: "${await page.locator('#answer').innerText()}"`);
  };
  return [
    {
      title: 'The demo question',
      text: "The reply is the live language model's at the time of capture; the page shows what it understood, and the planner computes the answer.",
      steps: [
        `Open the page: ${DEMO}.`,
        'Type "Launch slips 3 days from 19 April. Which sites still work?" in the question box and press Ask.',
      ],
      run: async (page, note, part) => {
        await ask(page, 'Launch slips 3 days from 19 April. Which sites still work?', 2500);
        await page.waitForTimeout(500);
        await part(
          'While waiting for the reply (the request was held for 2.5 s to catch this).',
          box,
        );
        await done(page);
        await report(page, note);
        await part('The result.', 'full');
      },
    },
    {
      title: '"We are delayed a week"',
      steps: [
        `Open the page: ${DEMO}.`,
        'Type "We are delayed a week" in the question box and press Ask.',
      ],
      run: async (page, note) => {
        await ask(page, 'We are delayed a week');
        await done(page);
        await report(page, note);
      },
    },
    {
      title: 'An unrelated question',
      steps: [
        `Open the page: ${DEMO}.`,
        'Type "what is the capital of France?" in the question box and press Ask.',
      ],
      run: async (page, note) => {
        await ask(page, 'what is the capital of France?');
        await done(page);
        await report(page, note);
      },
      capture: box,
    },
    {
      title: 'A failed request',
      steps: [`Open the page: ${DEMO}.`, 'Type a question and press Ask.'],
      run: async (page, note, part) => {
        await page.route('**/api/ask', (route) => route.abort('failed'));
        await page.locator('#ask-q').fill('Launch slips 3 days from 19 April');
        await page.locator('#ask button[type="submit"]').click();
        await page.waitForTimeout(600);
        await done(page);
        await part(
          `With the network request failing (connection dropped): "${await noteText(page)}"`,
          box,
        );
        await page.unroute('**/api/ask');
        await page.route('**/api/ask', (route) =>
          route.fulfill({ status: 500, body: 'Internal Server Error' }),
        );
        await page.locator('#ask button[type="submit"]').click();
        await page.waitForTimeout(600);
        await done(page);
        await part(`With the server answering 500: "${await noteText(page)}"`, box);
        note(
          'Both failures were simulated in the browser; the planner and its controls keep working.',
        );
      },
    },
  ];
}

async function chartStates(browser) {
  const date = '2028-04-19';
  const chart = (site, extra = '') => `/#site=${site}&date=${date}${extra}&tab=sun-path-chart`;
  const first = ['peak-near-shackleton', 'connecting-ridge', ...ALL_SITES];
  // Earth and the Deep Space Network are rarely out of view, so those two look further afield:
  // 30-day windows, month by month through 2028.
  const months = Array.from({ length: 12 }, (_, m) => `2028-${String(m + 1).padStart(2, '0')}-19`);
  const later = [date, ...months.filter((d) => d > date), ...months.filter((d) => d < date)];
  const off = {
    sun: await findHour(browser, first, date, (r) => !r.sun),
    earth: await findHour(browser, first, later, (r) => !r.earth, 30),
    comms: await findHour(browser, first.slice(0, 2), later, (r) => !r.comms && r.earth, 30),
    power: await findHour(browser, ALL_SITES, date, (r) => !r.power),
    all: await findHour(
      browser,
      ALL_SITES,
      date,
      (r) => !r.sun && !r.earth && !r.power && !r.comms,
      30,
    ),
  };
  const lightOff = (label, hit) => {
    const link = hit
      ? `#site=${hit.site}&date=${hit.date}${hit.days === 7 ? '' : `&days=${hit.days}`}&tab=sun-path-chart`
      : '';
    return {
      title: `${label} OFF`,
      steps: hit
        ? [
            `Open the Sun-Path Chart for ${hit.site}, landing ${hit.date}, ${hit.days}-day window (link ending ${link}).`,
            `Drag the time slider to hour ${hit.t} of the window.`,
          ]
        : ['Looked through the sites and landing dates for such an hour.'],
      path: hit ? `/${link}` : chart('peak-near-shackleton'),
      run: async (page, note) => {
        if (!hit) {
          note('No such hour was found, so this shows the chart as opened.');
          return;
        }
        await setTime(page, hit.t);
        note(`Slider reads: ${await timeLabel(page)}.`);
      },
    };
  };
  const site = 'connecting-ridge';
  const area = { around: ['.chart', '.slider', '#lights'], pad: 12 };
  return [
    lightOff('Sun', off.sun),
    lightOff('Earth', off.earth),
    lightOff('Comms (with Earth in view)', off.comms),
    {
      ...lightOff('Power', off.power),
      text: 'Power is a verdict for the whole mission window, not for one hour, so it is off at every hour of this window.',
    },
    lightOff('All four lights', off.all),
    {
      title: 'A track passing behind the terrain',
      text: 'Where the Sun or Earth is behind the skyline its track fades, and its marker is drawn faint with "(hidden)" in the label.',
      steps: off.sun
        ? [
            `Open the Sun-Path Chart for ${off.sun.site}, landing 19 Apr 2028, 7-day window.`,
            `Drag the time slider to hour ${off.sun.t}, where the Sun is behind the terrain.`,
          ]
        : ['Open the Sun-Path Chart.'],
      path: chart(off.sun?.site ?? site),
      run: async (page) => {
        if (off.sun) await setTime(page, off.sun.t);
      },
      capture: { around: ['.chart', '#lights'], pad: 12 },
    },
    {
      title: 'The slider mid-window and at the last hour',
      steps: [`Open the Sun-Path Chart for ${site}, landing 19 Apr 2028, 7-day window.`],
      path: chart(site),
      run: async (page, note, part) => {
        const max = Number(await page.locator('#time').getAttribute('max'));
        const mid = Math.round(max / 2);
        await setTime(page, mid);
        await part(
          `Step 2: drag the time slider to the middle (hour ${mid}): ${await timeLabel(page)}.`,
          area,
        );
        await setTime(page, max);
        await part(
          `Step 3: drag it to the right-hand end (hour ${max}): ${await timeLabel(page)}.`,
          area,
        );
      },
    },
    {
      title: 'Observer height 1 m and 5 m',
      text: 'The same site, date and hour from 1 m and from 5 m above the ground: a taller mast sees over more of the nearby terrain.',
      steps: [
        `Open the Sun-Path Chart for ${site}, landing 19 Apr 2028, 7-day window (it opens at 2 m).`,
      ],
      path: chart(site),
      run: async (page, note, part) => {
        for (const h of ['1', '5']) {
          await pick(page, 'Observer height (m)', `Observer height (m): ${h}`);
          await settle(page, 500);
          await part(`Press "${h}" in the Observer height (m) buttons.`, {
            around: ['#controls', '.chart', '#lights'],
            pad: 12,
          });
        }
      },
    },
    {
      title: 'Centred on South (pole)',
      steps: [
        `Open the Sun-Path Chart for ${site}, landing 19 Apr 2028, 7-day window (it opens centred on North).`,
        'Press "South (pole)" in the Centre on buttons.',
      ],
      path: chart(site),
      run: async (page) => {
        await pick(page, 'Centre on', 'South (pole)');
        await settle(page, 300);
      },
      capture: { around: ['#controls', '.chart'], pad: 12 },
    },
    {
      title: 'A 30-day window',
      steps: [
        `Open the Sun-Path Chart for ${site}, landing 19 Apr 2028.`,
        'Press "30" in the Mission window (days) buttons on the selected-site bar.',
      ],
      path: chart(site),
      run: async (page) => {
        await pick(page, 'Mission window (days)', 'Mission window (days): 30');
        await settle(page, 500);
      },
    },
    {
      title: 'Site data still loading',
      text: "The chart tab in the moment between opening it and the site's data file arriving.",
      steps: [
        `Open the page directly on the Sun-Path Chart tab for ${site}.`,
        'Captured 0.8 s after opening, with the site data file held back for 4 s to catch the state.',
      ],
      path: '/how',
      run: async (page, note) => {
        await page.route('**/data/sites/*.json', async (route) => {
          await sleep(4000);
          await route.continue().catch(() => {});
        });
        await page.goto(BASE + chart(site), { waitUntil: 'commit' });
        await page.waitForTimeout(800);
        note(
          'There is no spinner or "loading" message: the chart area and the lights stay empty until the data arrives.',
        );
      },
      capture: 'view',
    },
  ];
}

function mapStates() {
  const path = '/#tab=map';
  const layer = (page, name) =>
    page.locator('#globe-controls').getByRole('button', { name, exact: true }).click();
  const toPole = async (page, zooms = 0) => {
    await moonReady(page, 2500);
    await page.locator('#globe-pole').click();
    await page.waitForTimeout(3000);
    if (zooms) await layer(page, 'Polar shading');
    for (let i = 0; i < zooms; i++) {
      await page.locator('#globe-zoom-in').click();
      await page.waitForTimeout(1500);
    }
    if (zooms) await page.waitForTimeout(2500);
  };
  return [
    {
      title: 'South pole, in each layer, grid on and off',
      steps: [`Open the Map tab: ${DEMO}.`, 'Press "South pole" on the map.'],
      path,
      run: async (page, note, part) => {
        await toPole(page);
        for (const name of ['Imagery (WAC)', 'Elevation (LOLA)', 'Polar shading']) {
          await layer(page, name);
          for (const on of [true, false]) {
            await page.locator('#globe-grid').setChecked(on);
            await page.waitForTimeout(3500);
            await part(
              `Press "${name}"; "Grid lines" ${on ? 'ticked' : 'unticked'}.`,
              '.globe-frame',
            );
          }
        }
      },
    },
    {
      title: 'Zoomed in until the markers separate',
      steps: [
        `Open the Map tab: ${DEMO}.`,
        'Press "South pole", then "Polar shading".',
        'Press "+" (zoom in) twice.',
      ],
      path,
      run: async (page, note) => {
        await toPole(page, 2);
        note(
          'Some sites are only a few kilometres apart (the two de Gerlache sites; Mons Mouton and its neighbours), so their markers and labels can still touch at this zoom. Zooming further separates them but pushes the outer sites off the map.',
        );
      },
      capture: '.globe-frame',
    },
    {
      title: 'A marker on hover and after selection',
      steps: [
        `Open the Map tab: ${DEMO}.`,
        'Press "South pole", then "Polar shading", then "+" twice.',
      ],
      path,
      run: async (page, note, part) => {
        await toPole(page, 2);
        const box = await page.locator('#globe-view').boundingBox();
        const selected = await page.locator('#site option:checked').innerText();
        const tip = page.locator('#globe-tip');
        let found = null;
        search: for (let y = box.y + 70; y < box.y + box.height - 60; y += 22) {
          for (let x = box.x + 40; x < box.x + box.width - 40; x += 22) {
            await page.mouse.move(x, y);
            if (await tip.isVisible()) {
              const text = (await tip.innerText()).trim();
              if (text && !text.startsWith(selected)) {
                found = { x, y, text };
                break search;
              }
            }
          }
        }
        if (!found) {
          note('No marker other than the selected one was found under the cursor.');
          return;
        }
        await page.waitForTimeout(400);
        await part(
          `Step 3: move the mouse over a marker. Tooltip: "${found.text}". Readout under the map: "${await page.locator('#globe-readout').innerText()}".`,
          { around: ['.globe-frame', '#globe-readout'], pad: 8 },
        );
        await page.mouse.click(found.x, found.y);
        await page.waitForTimeout(1200);
        await part(
          `Step 4: click it. The Selected site dropdown now reads "${await page.locator('#site option:checked').innerText()}"; the marker gets the ring, and the Moon does not move.`,
          'full',
        );
      },
    },
    {
      title: 'Add a site on the map, start to finish',
      steps: [`Open the Map tab: ${DEMO}.`, 'Press "South pole".'],
      path,
      run: async (page, note, part) => {
        await toPole(page);
        await page.locator('#globe-add').click();
        await page.waitForTimeout(400);
        await part(
          'Step 3: press "Add a site on the map". A form opens in the side column.',
          '.globe-layout',
        );
        const box = await page.locator('#globe-view').boundingBox();
        await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.42);
        await page.waitForTimeout(800);
        await part(
          `Step 4: click a spot on the Moon. Latitude ${await page.locator('#globe-add-lat').inputValue()} and longitude ${await page.locator('#globe-add-lon').inputValue()} are filled in and a pin marks the spot.`,
          '.globe-layout',
        );
        await page.locator('#globe-add-name').fill('Camp Review');
        await part('Step 5: type a name ("Camp Review").', '.globe-layout');
        await page.locator('#globe-add-form button[type=submit]').click();
        await page.waitForTimeout(1500);
        await page.locator('#globe-sites li').last().scrollIntoViewIfNeeded();
        await part(
          'Step 6: press "Save site". The site is on the map and at the end of the Sites list, marked as yours with no result.',
          '.globe-layout',
        );
        await tab(page, 'Planner');
        await settle(page, 300);
        await part('Step 7: open the Planner tab. The site has a row with no data.', {
          around: '#planner',
          pad: 12,
        });
        await tab(page, 'Map');
        await moonReady(page, 2000);
        const x = page.locator('#globe-sites .globe-x').first();
        await x.scrollIntoViewIfNeeded();
        note(
          `To remove it: the "×" button on its row in the Sites list (tooltip and screen-reader name: "${await x.getAttribute('title')}"). It is removed at once, with no confirmation.`,
        );
        await x.click();
        await page.waitForTimeout(1200);
        await part(
          'Step 8: back on the Map tab, press "×" on its row in the Sites list. The site is gone from the list and the map.',
          '.globe-layout',
        );
      },
    },
  ];
}

async function nightStates(browser) {
  // Look for a case where the Power light and the battery verdict disagree.
  let clash = null;
  let tried = 0;
  const page = await newPage(browser);
  try {
    await open(page, '/');
    const presets = await page
      .locator('#preset option')
      .evaluateAll((os) => os.map((o) => ({ id: o.value, name: o.textContent })));
    search: for (const date of ['2028-04-19', '2028-04-22']) {
      for (const site of ALL_SITES) {
        for (const p of presets) {
          await open(page, `/#site=${site}&date=${date}&ps=${p.id}&tab=survive-the-night`);
          tried++;
          const power = await page
            .locator('#lights li[data-light="power"]')
            .evaluate((li) => li.classList.contains('on'));
          const text = (await page.locator('#battery-summary').innerText()).trim();
          const survives = /^Survives/.test(text);
          if (power !== survives) {
            clash = { site, date, preset: p, power, survives, text: text.split('\n')[0] };
            break search;
          }
        }
      }
    }
  } finally {
    await page.context().close();
  }
  const night = (site, date, extra = '') =>
    `/#site=${site}&date=${date}${extra}&tab=survive-the-night`;
  const verdict = async (page, note) =>
    note(
      `Verdict shown: "${(await page.locator('#battery-summary').innerText()).trim().replace(/\n+/g, ' ')}"`,
    );
  return [
    {
      title: '"Adjust the power system" expanded',
      steps: [`Open the Survive the Night tab: ${DEMO}.`, 'Press "Adjust the power system".'],
      path: night('peak-near-shackleton', '2028-04-19'),
      run: async (page, note) => {
        await page.locator('#customise summary').click();
        await settle(page, 300);
        await verdict(page, note);
      },
    },
    ...['Hibernating rover', 'Crewed lander'].map((name) => ({
      title: `${name} preset`,
      steps: [
        `Open the Survive the Night tab: ${DEMO}.`,
        `Press "${name}" in the Power system buttons.`,
      ],
      path: night('peak-near-shackleton', '2028-04-19'),
      run: async (page, note) => {
        await page.getByRole('button', { name, exact: true }).click();
        await settle(page, 500);
        await verdict(page, note);
      },
    })),
    {
      title: 'A vehicle that does not survive',
      steps: [
        'Open the Survive the Night tab for Connecting Ridge, landing 22 Apr 2028, 7-day window, Small lander (link ending #site=connecting-ridge&date=2028-04-22&tab=survive-the-night).',
      ],
      path: night('connecting-ridge', '2028-04-22'),
      run: verdict,
    },
    {
      title: 'Power light and battery verdict disagreeing',
      text: 'The Power light is a rule about sunlight over the window; the battery verdict is a simulation of one power system. They can differ.',
      steps: clash
        ? [
            `Open the Survive the Night tab for ${clash.site}, landing ${clash.date}, 7-day window, with the "${clash.preset.name}" power system.`,
          ]
        : [
            'Looked through all 12 sites, landings on 19 and 22 Apr 2028, 7-day window, with each power system.',
          ],
      path: clash
        ? night(clash.site, clash.date, `&ps=${clash.preset.id}`)
        : night('peak-near-shackleton', '2028-04-19'),
      run: async (page, note, part) => {
        if (!clash) {
          note(
            `No disagreement was found in those ${tried} cases. This picture is the demo scenario.`,
          );
          return;
        }
        await part(`Survive the Night: "${clash.text}"`, 'full');
        await tab(page, 'Sun-Path Chart');
        await settle(page, 300);
        await part(
          `Step 2: open the Sun-Path Chart tab. The Power light is ${clash.power ? 'ON' : 'OFF'} while the battery verdict is "${clash.survives ? 'survives' : 'does not survive'}".`,
          { around: ['#lights'], pad: 12 },
        );
      },
    },
    {
      title: 'A 30-day window',
      steps: [
        `Open the Survive the Night tab: ${DEMO}.`,
        'Press "30" in the Mission window (days) buttons on the selected-site bar.',
      ],
      path: night('peak-near-shackleton', '2028-04-19'),
      run: async (page, note) => {
        await pick(page, 'Mission window (days)', 'Mission window (days): 30');
        await settle(page, 500);
        await verdict(page, note);
      },
    },
  ];
}

async function aboutStates() {
  // "Worst overall": the site whose three ranks in its own review (sunlight, longest night,
  // communications) add up highest. The app itself has no single ranking.
  let worst = null;
  try {
    const res = await fetch(`${BASE}/data/reviews.json`, { headers: AUTH });
    for (const [id, r] of Object.entries((await res.json()).sites)) {
      const ranks = [...String(r.text).matchAll(/(\d+)(?:st|nd|rd|th) /g)]
        .slice(0, 3)
        .map((m) => Number(m[1]));
      const sum = ranks.reduce((a, b) => a + b, 0);
      if (ranks.length === 3 && (!worst || sum > worst.sum)) worst = { id, ranks, sum };
    }
  } catch {
    worst = null;
  }
  const about = (id) => `/#v=explore&site=${id}&tab=about-this-site`;
  const id = worst?.id ?? 'mons-mouton';
  return [
    {
      title: `The site ranked worst overall (${id})`,
      text: worst
        ? `The app has no single overall ranking. This is the site whose three ranks in its own review (sunlight, shortest longest night, communications: ${worst.ranks.join(', ')} of 12) add up highest.`
        : 'The app has no single overall ranking, and the reviews could not be read to work one out, so this is one low-ranked site.',
      steps: [
        `Open the page in Explore view and choose ${id} in the Selected site dropdown.`,
        'Open the About this site tab.',
      ],
      path: about(id),
    },
    {
      title: 'An approximate-terrain site (Peak near Cabeus B)',
      steps: [
        'Open the page in Explore view and choose "Peak near Cabeus B" in the Selected site dropdown.',
        'Open the About this site tab.',
      ],
      path: about('peak-near-cabeus-b'),
      run: async (page, note) =>
        note('"Approximate" appears in the Source line of the facts table.'),
    },
  ];
}

function globalStates() {
  return [
    {
      title: 'The site dropdown and the date picker, open',
      text: "Both are the browser's own controls. Their open lists are drawn by the browser and the operating system outside the page, so a page screenshot cannot include them, and they look different on every device. The picture shows them closed.",
      steps: [`Open the page: ${DEMO}.`],
      run: async (page, note) => {
        const options = await page.locator('#site option').allInnerTexts();
        note(`The site dropdown lists, in this order: ${options.join(', ')}.`);
        note(
          `The date field is limited to ${await page.locator('#plan').getAttribute('min')} to ${await page.locator('#plan').getAttribute('max')}; the browser's calendar greys out days outside that range.`,
        );
      },
      capture: { around: '.selected-bar', pad: 16 },
    },
    {
      title: 'A date outside 2028 to 2029',
      steps: [`Open the page: ${DEMO}.`],
      run: async (page, note, part) => {
        for (const [label, value] of [
          ['before the data starts', '2027-12-31'],
          ['after the data ends', '2030-01-01'],
        ]) {
          await page.locator('#plan').fill(value);
          await page.locator('#plan').blur();
          await settle(page, 500);
          const now = await page.locator('#plan').inputValue();
          const valid = await page.locator('#plan').evaluate((el) => el.checkValidity());
          const answer = (await page.locator('#answer').innerText()).slice(0, 140);
          await part(
            `Type ${value} (${label}) in the Landing field and leave it. The field then reads ${now}${valid ? '' : ' and the browser counts it as invalid'}. Summary text: "${answer}"`,
            { around: ['.selected-bar', '#answer', '.planner'], pad: 12 },
          );
        }
        note(
          'The page shows no message that the date is out of range: the planner answers as if no site had anything to offer.',
        );
      },
    },
    {
      title: 'Keyboard focus rings',
      steps: [`Open the page: ${DEMO}.`, 'Move through the page with the Tab key.'],
      run: async (page, note, part) => {
        const ring = async (caption, locator, around, before) => {
          if (before) await before();
          await locator.focus();
          // A key press puts the page in keyboard mode, so the :focus-visible ring is drawn.
          await page.keyboard.press('Shift');
          await page.waitForTimeout(250);
          await part(caption, { around, pad: 28 });
        };
        await page.keyboard.press('Tab');
        await ring(
          'A view switcher button (Explore).',
          page.locator('.view-switch input[value="explore"]'),
          '.view-switch',
        );
        await ring('A tab (Map).', page.locator('#tab-map'), '#tabs');
        await ring(
          'A planner cell.',
          page.locator('#planner tbody tr').nth(2).locator('td button').nth(3),
          '#planner',
        );
        await ring('The time slider.', page.locator('#time'), '.slider', async () => {
          await tab(page, 'Sun-Path Chart');
          await settle(page, 300);
        });
        await ring(
          'A dialog button (Close, in Keyboard shortcuts).',
          page.locator('#shortcuts button[type=submit]'),
          '#shortcuts',
          async () => {
            await page.keyboard.press('Control+/');
            await page.locator('#shortcuts').waitFor({ state: 'visible' });
          },
        );
      },
    },
    {
      title: 'Hover text on Mission, Explore and Learn',
      steps: [`Open the page: ${DEMO}.`],
      run: async (page, note, part) => {
        for (const v of ['mission', 'explore', 'learn']) {
          await page.locator(`.view-switch label:has(input[value="${v}"])`).hover();
          await page.waitForTimeout(350);
          const text = (await page.locator(`#tip-${v}`).innerText()).replace(/\s+/g, ' ').trim();
          await part(`Move the mouse over "${v[0].toUpperCase()}${v.slice(1)}": "${text}"`, {
            around: ['.view-switch', `#tip-${v}`],
            pad: 16,
          });
        }
      },
    },
  ];
}

/** Share Project needs two browsers at once, so it captures itself. */
async function shareStates(browser) {
  const failed = (why) => [
    { title: 'Share Project in use', steps: [], viewport: DESKTOP, notes: [why], parts: [] },
  ];
  if (!LOCAL) {
    return failed(
      `Skipped: this section creates a project, and the document was built against ${BASE}, which is not a local copy.`,
    );
  }
  const out = [];
  const view = async (page, caption) => ({ caption, ...(await shoot(page, 'view')) });
  const a = await newPage(browser);
  const b = await newPage(browser);
  const c = await newPage(browser);
  try {
    await open(a, '/');
    await a.locator('#share-open').click();
    await a.locator('#share-name').fill('Landing review');
    await a.locator('#share-create-btn').click();
    await a
      .locator('#share-id')
      .filter({ hasText: /^[0-9a-f-]{36}$/ })
      .waitFor({ timeout: 15_000 });
    await a.waitForTimeout(500);
    const id = (await a.locator('#share-id').innerText()).trim();
    const link = await a.locator('#share-link').inputValue();
    out.push({
      title: 'After "Create shared project"',
      steps: [
        `Open the page: ${DEMO}.`,
        'Press "Share Project" in the header, type "Landing review" as the project name and press "Create shared project".',
      ],
      viewport: DESKTOP,
      notes: [
        `ID shown: ${id}. Link shown: ${link}. This project exists only on the local test copy the screenshots were taken from.`,
      ],
      parts: [await view(a, '')],
    });
    await a.locator('#share-close').click();

    await open(b, `/#project=${id}`);
    await b.locator('#share-open-label', { hasText: '2 people' }).waitFor({ timeout: 15_000 });
    const parts = [
      await view(
        b,
        'Step 2: the second browser, as it opens. The header button shows the project name, the number of people and a dot that is green while the session is live.',
      ),
    ];
    await b.locator('#share-open').click();
    await b.locator('#share').waitFor({ state: 'visible' });
    await b.waitForTimeout(400);
    parts.push(
      await view(
        b,
        'Step 3: in the second browser, press the header button. The dialog shows the project, its ID and link, and the "Follow the group\'s view" switch (on by default).',
      ),
    );
    await b.locator('#share-close').click();
    await a.locator('#slip-on').click();
    await tab(a, 'Sun-Path Chart');
    await b.locator('#tab-sun-path-chart[aria-selected="true"]').waitFor({ timeout: 10_000 });
    await settle(b, 600);
    parts.push(
      await view(
        b,
        `Step 4: in the first browser, press "Slip + 1 day" and open the Sun-Path Chart tab. The second browser follows without being touched: its Landing field reads ${await b.locator('#plan').inputValue()} and it is on the same tab.`,
      ),
    );
    out.push({
      title: 'A second browser on the same project',
      steps: [
        'In a second browser (a separate profile, so nothing is shared but the link), open the link from the first.',
      ],
      viewport: DESKTOP,
      notes: [],
      parts,
    });

    await open(c, '/');
    await c.locator('#share-open').click();
    await c.locator('#share-open-id').fill('00000000-0000-4000-8000-000000000000');
    await c.locator('#share-open-form button[type=submit]').click();
    await c.waitForTimeout(1500);
    const error = (
      await c
        .locator('#share-open-error')
        .innerText()
        .catch(() => '')
    ).trim();
    const under = (await c.locator('#ask-note').innerText()).trim();
    const stays = await c.locator('#share').evaluate((d) => d.open);
    const missing = [
      await view(
        c,
        `From the dialog. The dialog ${stays ? 'stays open' : 'closes'}. Message in the dialog: "${error || 'none'}". Message under the question box on the Planner: "${under}"`,
      ),
    ];
    await open(c, '/#project=00000000-0000-4000-8000-000000000001');
    await c.waitForTimeout(800);
    missing.push(
      await view(
        c,
        `Step 2: open a link to a project that does not exist (ending #project=00000000-0000-4000-8000-000000000001). Message under the question box: "${(await c.locator('#ask-note').innerText()).trim()}"`,
      ),
    );
    out.push({
      title: 'Opening an ID that does not exist',
      steps: [
        'Open the page, press "Share Project", type 00000000-0000-4000-8000-000000000000 in "Open a project by its ID" and press Open.',
      ],
      viewport: DESKTOP,
      notes: [],
      parts: missing,
    });
  } catch (err) {
    out.push(...failed(`This state could not be captured: ${String(err.message).split('\n')[0]}`));
  } finally {
    for (const p of [a, b, c]) await p.context().close();
  }
  return out;
}

function darkStates() {
  return [
    ['Planner', 'planner'],
    ['Map', 'map'],
    ['Sun-Path Chart', 'sun-path-chart'],
    ['Survive the Night', 'survive-the-night'],
  ].map(([label, t]) => ({
    title: `${label} in dark mode`,
    steps: [`Open the ${label} tab: ${DEMO}.`, 'Turn on the "Dark mode" switch in the header.'],
    path: `/#v=explore&tab=${t}`,
    theme: 'dark',
    run: t === 'map' ? (page) => moonReady(page) : undefined,
  }));
}

function smallStates() {
  const shareDialog = async (page) => {
    await page.locator('#share-open').click();
    await page.locator('#share').waitFor({ state: 'visible' });
    await page.waitForTimeout(300);
  };
  const device = (name, viewport) => {
    const size = `${viewport.width} x ${viewport.height}`;
    return [
      {
        title: `${name}: header`,
        steps: [`Open the page in a ${size} window: ${DEMO}.`],
        viewport,
        capture: 'view',
      },
      {
        title: `${name}: Planner`,
        steps: [`Open the page in a ${size} window: ${DEMO}.`],
        viewport,
        path: '/#tab=planner',
      },
      {
        title: `${name}: Sun-Path Chart`,
        steps: [`In a ${size} window, open the Sun-Path Chart tab: ${DEMO}.`],
        viewport,
        path: '/#tab=sun-path-chart',
      },
      {
        title: `${name}: Map`,
        steps: [`In a ${size} window, open the Map tab: ${DEMO}.`],
        viewport,
        path: '/#tab=map',
        run: (page) => moonReady(page),
      },
      {
        title: `${name}: Learn view with the guide`,
        steps: [`In a ${size} window, choose Learn in the header.`],
        viewport,
        path: '/#v=learn&tab=planner',
      },
      {
        title: `${name}: Share dialog`,
        steps: [`In a ${size} window, open the page and press "Share Project" in the header.`],
        viewport,
        run: shareDialog,
        capture: 'view',
      },
    ];
  };
  return [
    ...device('Phone', PHONE),
    ...device('Tablet', TABLET),
    {
      title: 'Projector: Learn view with the guide',
      text: 'As a classroom projector at 1280 x 720 would show it.',
      steps: ['In a 1280 x 720 window, choose Learn in the header.'],
      viewport: PROJECTOR,
      path: '/#v=learn&tab=planner',
    },
    {
      title: 'Projector: Sun-Path Chart',
      steps: [`In a 1280 x 720 window, in Learn view, open the Sun-Path Chart tab: ${DEMO}.`],
      viewport: PROJECTOR,
      path: '/#v=learn&tab=sun-path-chart',
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// What changed in the app since the first version of this document
// ---------------------------------------------------------------------------------------------

const CHANGES = [
  [
    'The map\'s layer buttons, grid switch, zoom and "Whole Moon" / "South pole" buttons moved from the side column onto the map itself.',
    'A1 to A3 (Map), 4, 9, 10',
  ],
  [
    'A line under the map now explains the layer in use (hidden in Mission view).',
    'A1 and A3 (Map), 4',
  ],
  [
    'Choosing a site from the dropdown, the planner or with J / K now turns the Moon to that site.',
    '4',
  ],
  [
    'Footer: the "Keyboard shortcuts" and "API: ok" lines are gone; a copyright and licence line was added.',
    'every full-page picture',
  ],
  [
    'Learn view with the guide: a fourth card, "Why the south pole, and not the north".',
    'A3 (Start here), 10',
  ],
  [
    '"Survive the Night" now has the same heading size as the other tabs; bold text uses one weight; two small notes went from 13 to 14 px.',
    'A1 to A3, 2, 5, 6',
  ],
  [
    'The Keyboard shortcuts dialog is laid out in two columns; in Share Project the Open button lines up with its field.',
    'A4, 7, 8',
  ],
  [
    'This document: pictures are now taken at 1440 x 900 (the first version used 1280 x 900), full-page pictures mark the fold, and every picture lists its steps.',
    'all',
  ],
];

// ---------------------------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------------------------

function entryHtml(e, number) {
  const size = `${e.viewport.width} x ${e.viewport.height}`;
  const steps = e.steps?.length
    ? `<p class="how">Steps to reach this state:</p><ol class="steps">${e.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`
    : '';
  const notes = e.notes?.length
    ? `<ul class="notes">${e.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`
    : '';
  const figures = e.parts.flatMap((p) => {
    const pct = Math.min(
      100,
      Math.round((p.width / e.viewport.width) * printShare(e.viewport) * 100),
    );
    return p.images.map((buf, i) => {
      const more = p.images.length > 1 ? `, part ${i + 1} of ${p.images.length}` : '';
      const cap = [p.caption, `Viewport ${size}; ${p.mode}${more}.`].filter(Boolean).join(' ');
      return `<figure><figcaption>${esc(cap)}</figcaption><img style="width:${pct}%" src="data:image/jpeg;base64,${buf.toString('base64')}" alt="${esc(e.title)}${more}" /></figure>`;
    });
  });
  const text = e.text ? `<p>${esc(e.text)}</p>` : '';
  // The heading, steps and first picture stay on one page; later pictures follow.
  const [first = '', ...rest] = figures;
  return `<section class="shot"><div class="keep"><h3>${esc(number)} ${esc(e.title)}</h3>${text}${steps}${notes}${first}</div>${rest.join('')}</section>`;
}

function documentHtml(sections) {
  const today = new Date().toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const contents = sections
    .map(
      (s) =>
        `<li class="sec">${esc(s.id)}. ${esc(s.title)}</li>` +
        s.entries.map((e, i) => `<li>${esc(s.id)}.${i + 1} ${esc(e.title)}</li>`).join(''),
    )
    .join('');
  const body = sections
    .map((s) => {
      const lead = s.text ? `<p class="lead">${esc(s.text)}</p>` : '';
      const entries = s.entries.map((e, i) => entryHtml(e, `${s.id}.${i + 1}`)).join('');
      return `<section class="part"><h2>${esc(s.id)}. ${esc(s.title)}</h2>${lead}${entries}</section>`;
    })
    .join('');
  const changes = CHANGES.map(
    ([what, where]) => `<li>${esc(what)} <span class="where">Sections: ${esc(where)}.</span></li>`,
  ).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Four Lights: review document</title>
<style>
  @page { size: A4; margin: 13mm 12mm 15mm; }
  body { font: 10pt/1.42 system-ui, "Segoe UI", Helvetica, Arial, sans-serif; color: #1a1d24; margin: 0; }
  h1 { font-size: 30pt; margin: 50mm 0 4mm; }
  h2 { font-size: 16pt; margin: 0 0 2mm; border-bottom: 1.5pt solid #1a1d24; padding-bottom: 1.5mm; }
  h3 { font-size: 12pt; margin: 0 0 1.5mm; break-after: avoid; }
  p { margin: 0 0 2.5mm; }
  .lead { color: #444b57; }
  .cover p { max-width: 155mm; font-size: 11pt; }
  .cover .date { color: #444b57; margin-top: 8mm; }
  .ask li, .changes li { margin-bottom: 1.5mm; }
  .changes .where { color: #5a6270; }
  .contents { columns: 3; padding-left: 0; list-style: none; font-size: 8.5pt; }
  .contents li { margin-bottom: 0.6mm; break-inside: avoid; }
  .contents .sec { font-weight: 600; margin-top: 2.5mm; break-after: avoid; }
  .part { break-before: page; }
  .shot { margin-top: 6mm; }
  .how { font-weight: 600; margin-bottom: 0.5mm; break-after: avoid; }
  .steps { margin: 0 0 2mm; padding-left: 6mm; }
  .notes { margin: 0 0 2mm; padding-left: 6mm; color: #2c3440; }
  .notes li { margin-bottom: 0.8mm; }
  figure { margin: 0 0 3.5mm; break-inside: avoid; }
  .keep { break-inside: avoid; }
  .keep img { max-height: 172mm; }
  figcaption { font-size: 8.5pt; color: #444b57; margin-bottom: 1mm; }
  img { display: block; max-width: 100%; max-height: 232mm; object-fit: contain; object-position: left top; border: 0.5pt solid #b9bfca; }
</style></head><body>
<section class="cover">
  <h1>Four Lights</h1>
  <p><strong>Review document, second version.</strong> Which lunar south-pole landing site still works when your launch slips?</p>
  <p>Four Lights is our entry for the NASA Space Apps Challenge 2026 (challenge 11, Lunar Landing Site Navigator). It compares 12 candidate landing sites near the Moon's south pole, and landing dates, by where the Sun and Earth sit against each site's real terrain skyline, for every hour of 2028 and 2029. Team: Steve Dalton and Matt Paine.</p>
  <p>Part A shows every page, view and tab with a note on what each does. Sections 1 to 10 show the app in particular states. Every picture is captioned with the steps that reach it and the size of the browser window; full-page pictures carry a dashed line where the bottom of that window falls.</p>
  <p><strong>What we would like to hear:</strong></p>
  <ul class="ask">
    <li>Is it clear, within a few seconds of the first page, what the app answers?</li>
    <li>Which screen is the hardest to understand, and what would you expect to see there instead?</li>
    <li>Anything that looks wrong, cluttered or unfinished.</li>
    <li>Is there anything you would want to do that you cannot find?</li>
  </ul>
  <p class="date">Screenshots taken ${esc(today)} from a local copy of the app, in Chrome.</p>
</section>
<section class="part">
  <h2>Changes since the last version</h2>
  <p class="lead">What has changed in the app since the first version of this document (screenshots dated 15 November 2026), with the sections affected.</p>
  <ol class="changes">${changes}</ol>
  <p class="lead">Limits of this document: the browser's own tooltips, the open site dropdown and the open date picker are drawn outside the page and cannot be photographed. Where they matter, the caption gives their text.</p>
  <h2 style="margin-top:8mm">Contents</h2>
  <ul class="contents">${contents}</ul>
</section>
${body}
</body></html>`;
}

async function main() {
  try {
    const res = await fetch(`${BASE}/api/health`, { headers: AUTH });
    if (res.status === 401) throw new Error('it wants the password: set SITE_PASSWORD');
    if (!res.ok) throw new Error(`status ${res.status}`);
  } catch (err) {
    console.error(`The app is not answering at ${BASE}: ${err.message}.`);
    console.error('Start it with ./ops/dev, or point BASE at a running copy:');
    console.error('  BASE=http://127.0.0.1:8790 npm run review-pdf');
    process.exit(1);
  }
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const plan = [
      ...overview(),
      { id: '1', title: 'Slip Planner states', entries: plannerStates },
      { id: '2', title: 'Ask in plain English', entries: askStates },
      { id: '3', title: 'Sun-Path Chart states', entries: () => chartStates(browser) },
      { id: '4', title: 'Map states', entries: mapStates },
      { id: '5', title: 'Survive the Night states', entries: () => nightStates(browser) },
      { id: '6', title: 'About this site', entries: aboutStates },
      { id: '7', title: 'Global controls and errors', entries: globalStates },
      { id: '8', title: 'Share Project', entries: () => shareStates(browser), ready: true },
      { id: '9', title: 'Dark mode', entries: darkStates },
      {
        id: '10',
        title: 'Small screens',
        text: 'Phone 390 x 844, tablet 768 x 1024 and a 1280 x 720 projector. Pictures are printed narrower than desktop ones, though a phone capture is enlarged (to 45% of the page width) so it can be read.',
        entries: smallStates,
      },
    ].filter((s) => !only || only.includes(s.id));
    const sections = [];
    for (const s of plan) {
      console.log(`${s.id}. ${s.title}`);
      const list = typeof s.entries === 'function' ? await s.entries() : s.entries;
      const entries = [];
      for (const e of list) {
        process.stdout.write(`   ${e.title} ... `);
        const done = s.ready ? e : await capture(browser, e);
        const images = done.parts.reduce((n, p) => n + p.images.length, 0);
        const failed = done.notes.find((n) => /could not be captured|^Skipped/.test(n));
        console.log(`${images} image(s)${failed ? `  ** ${failed}` : ''}`);
        entries.push(done);
      }
      sections.push({ ...s, entries });
    }
    const page = await browser.newPage();
    await page.setContent(documentHtml(sections), { waitUntil: 'load' });
    await mkdir(dirname(OUT), { recursive: true });
    const out = only ? OUT.replace(/\.pdf$/, '-part.pdf') : OUT;
    await page.pdf({
      path: out,
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="width:100%;font:8pt system-ui,sans-serif;color:#5a6270;padding:0 12mm;display:flex;justify-content:space-between"><span>Four Lights: review document</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
    });
    console.log(`Wrote ${out}`);
  } finally {
    await browser.close();
  }
}

await main();
