// The pages and the paperwork around them, checked from the files themselves: what a shared link
// shows on social sites, the rule that every dataset and picture is carded and credited, and the
// figures the how-we-built-it page quotes about the code.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(path, 'utf8');

const SITE = 'https://fourlights.gcsa.space';
const PAGES: Record<string, string> = {
  'web/index.html': '/',
  'web/how.html': '/how',
  'web/qgis.html': '/qgis',
  'web/sources.html': '/sources',
};

/** A page's <meta> tags, by their `property` or `name`. */
function metas(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/g) ?? []) {
    const key = /\b(?:property|name)="([^"]+)"/.exec(tag)?.[1];
    const content = /\bcontent="([^"]*)"/.exec(tag)?.[1];
    if (key && content !== undefined) out.set(key, content);
  }
  return out;
}

/** Width and height of a JPEG, from its start-of-frame marker. */
function jpegSize(path: string): { width: number; height: number } {
  const b = readFileSync(path);
  let i = 2;
  while (i < b.length) {
    const marker = b[i + 1] ?? 0;
    const length = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    i += 2 + length;
  }
  throw new Error(`no size found in ${path}`);
}

describe('what a shared link shows', () => {
  it('every page names itself, its address and a picture, all as full addresses', () => {
    expect(readdirSync('web').filter((f) => f.endsWith('.html')).length).toBe(
      Object.keys(PAGES).length,
    );
    for (const [file, path] of Object.entries(PAGES)) {
      const m = metas(read(file));
      expect(m.get('og:type'), file).toBe('website');
      expect(m.get('og:site_name'), file).toBe('Four Lights');
      expect(m.get('og:title'), file).toContain('Four Lights');
      expect(m.get('og:url'), file).toBe(SITE + path);
      expect(m.get('og:description'), file).toBe(m.get('description'));
      expect(m.get('og:image'), file).toBe(`${SITE}/img/social-card.jpg`);
      expect(m.get('og:image:alt')?.length, file).toBeGreaterThan(40);
      expect(m.get('twitter:card'), file).toBe('summary_large_image');
      expect(m.get('twitter:title'), file).toBe(m.get('og:title'));
      expect(m.get('twitter:description'), file).toBe(m.get('og:description'));
      expect(m.get('twitter:image'), file).toBe(m.get('og:image'));
    }
  });

  it('the picture is the size the tags say, and small enough for every site that reads it', () => {
    const m = metas(read('web/index.html'));
    const size = jpegSize('web/public/img/social-card.jpg');
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(String(size.width)).toBe(m.get('og:image:width'));
    expect(String(size.height)).toBe(m.get('og:image:height'));
    expect(readFileSync('web/public/img/social-card.jpg').length).toBeLessThan(1_000_000);
  });
});

describe('every dataset and picture is carded and credited', () => {
  const index = read('_datasets/_index.md');
  const sources = read('web/sources.html');
  const readme = read('README.md');

  it('each card is in the index, and each card in use is on the data sources page', () => {
    // Where each dataset's section is on the page.
    const section: Record<string, string> = {
      'nasa-lola-topography': 'lola',
      'nasa-lro-wac-mosaic': 'moontrek',
      'nasa-lro-lola-colour-shade': 'moontrek',
      'nasa-jpl-horizons': 'horizons',
      'nasa-naif-spice': 'spice',
      'usgs-artemis-regions': 'usgs',
      'nasa-image-library': 'images',
    };
    const cards = readdirSync('_datasets').filter((f) => f.endsWith('.md') && f !== '_index.md');
    for (const file of cards) {
      const id = file.replace(/\.md$/, '');
      expect(index, id).toContain(`](${file})`);
      const status = /^status:\s*(\w+)/m.exec(read(`_datasets/${file}`))?.[1];
      if (status === 'candidate') continue;
      expect(section[id], `${id} has no section on the data sources page`).toBeDefined();
      expect(sources, id).toContain(`id="${section[id]}"`);
    }
  });

  it('each NASA picture has its file, and its NASA ID on the page and in the README', () => {
    const rows = [
      ...read('_datasets/nasa-image-library.md').matchAll(/^\| `([^`]+\.jpg)` \| \[([^\]]+)\]/gm),
    ];
    expect(rows.length).toBe(9);
    for (const [, file, nasaId] of rows) {
      expect(existsSync(`web/public/img/${file}`), file).toBe(true);
      expect(sources, `${nasaId} on the data sources page`).toContain(nasaId);
      expect(readme, `${nasaId} in the README`).toContain(nasaId);
    }
    expect(index).toContain('Nine NASA pictures');
    expect(sources).toContain('Nine pictures');

    // Nothing is published as a picture without a card: the rest are our own screenshots.
    const ours = ['social-card.jpg', 'qgis-after-the-slip.jpg', 'qgis-skyline-shackleton-rim.jpg'];
    const carded = rows.map((r) => r[1]);
    for (const file of readdirSync('web/public/img').filter((f) => f.endsWith('.jpg'))) {
      expect([...carded, ...ours], file).toContain(file);
    }
  });
});

describe('how we built it', () => {
  const how = read('web/how.html').replace(/\s+/g, ' ');

  it('counts the MCP tools and the tests as they are', () => {
    const tools = [...read('api/src/mcp.ts').matchAll(/^ {4}name: '(\w+)',$/gm)].map((m) => m[1]);
    expect(tools.length).toBe(9);
    expect(how).toContain('through nine tools');
    const docs = read('_shared/shared-projects.md');
    for (const tool of tools) expect(docs, tool).toContain(`\`${tool}\``);

    const e2e = readdirSync('e2e')
      .filter((f) => f.endsWith('.spec.ts'))
      .reduce((n, f) => n + (read(`e2e/${f}`).match(/^\s*test\(/gm) ?? []).length, 0);
    expect(how).toContain(`${e2e} Playwright tests`);
    expect(read('README.md')).toContain(`${e2e} end-to-end`);

    const unit = ['web/tests', 'api/tests']
      .flatMap((dir) => readdirSync(dir).map((f) => `${dir}/${f}`))
      .filter((f) => f.endsWith('.test.ts'))
      .reduce((n, f) => n + (read(f).match(/^\s*it\(/gm) ?? []).length, 0);
    expect(how).toContain(`${unit} for the front end and Worker`);
    expect(read('README.md')).toContain(`${unit} unit tests for the app and Worker`);
  });

  it('no longer says the site is behind a password', () => {
    expect(how).not.toMatch(/password gate \(while enabled\)/);
    expect(how).toContain('The site needs no login');
  });
});
