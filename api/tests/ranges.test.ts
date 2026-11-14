// Range requests for the QGIS pack: the header parser on known answers, static assets cut to the
// bytes asked for, and the R2 route with a fake bucket. No network, no workerd.
import { describe, expect, it } from 'vitest';
import app from '../src/index';
import { parseRange } from '../src/ranges';

describe('parseRange', () => {
  it('reads the three forms of a single range', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual([0, 99]);
    expect(parseRange('bytes=900-', 1000)).toEqual([900, 999]);
    expect(parseRange('bytes=-100', 1000)).toEqual([900, 999]);
    expect(parseRange(' bytes=5-5 ', 1000)).toEqual([5, 5]);
  });

  it('stops at the end of the file', () => {
    expect(parseRange('bytes=990-2000', 1000)).toEqual([990, 999]);
    expect(parseRange('bytes=-5000', 1000)).toEqual([0, 999]);
  });

  it('says a range cannot be satisfied', () => {
    expect(parseRange('bytes=1000-', 1000)).toBe(false);
    expect(parseRange('bytes=10-5', 1000)).toBe(false);
    expect(parseRange('bytes=-0', 1000)).toBe(false);
    expect(parseRange('bytes=0-', 0)).toBe(false);
  });

  it('leaves alone what it does not slice', () => {
    for (const h of ['bytes=-', 'bytes=0-1,5-6', 'items=0-1', 'bytes=a-b', '']) {
      expect(parseRange(h, 1000), h).toBeNull();
    }
  });
});

const FILE = new Uint8Array(1000).map((_, i) => i % 251);

function env(bucket?: unknown, password?: string) {
  return {
    SITE_PASSWORD: password,
    QGIS_BUCKET: bucket,
    ASSETS: {
      fetch: (req: Request) => {
        const path = new URL(req.url).pathname;
        if (path === '/qgis/sites.fgb') {
          return Promise.resolve(new Response(FILE, { headers: { ETag: '"whole"' } }));
        }
        if (path === '/data/sites.json') return Promise.resolve(new Response('whole json'));
        return Promise.resolve(new Response('Not found', { status: 404 }));
      },
    },
  };
}
const get = (path: string, headers: Record<string, string> = {}, e = env(), method = 'GET') =>
  app.request(path, { method, headers }, e);

describe('/qgis static files', () => {
  it('sends the bytes asked for, as GDAL needs', async () => {
    const res = await get('/qgis/sites.fgb', { Range: 'bytes=100-199' });
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 100-199/1000');
    expect(res.headers.get('Content-Length')).toBe('100');
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect(res.headers.get('ETag')).toBeNull();
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(FILE.slice(100, 200));
  });

  it('sends the whole file with no Range, and says it takes ranges', async () => {
    const res = await get('/qgis/sites.fgb');
    expect(res.status).toBe(200);
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect((await res.arrayBuffer()).byteLength).toBe(1000);
  });

  it('answers HEAD with the range and no body, and 416 past the end', async () => {
    const head = await get('/qgis/sites.fgb', { Range: 'bytes=-10' }, env(), 'HEAD');
    expect(head.status).toBe(206);
    expect(head.headers.get('Content-Range')).toBe('bytes 990-999/1000');
    expect((await head.arrayBuffer()).byteLength).toBe(0);
    const past = await get('/qgis/sites.fgb', { Range: 'bytes=5000-' });
    expect(past.status).toBe(416);
    expect(past.headers.get('Content-Range')).toBe('bytes */1000');
  });

  it('passes a missing file through, and does not slice the rest of the site', async () => {
    expect((await get('/qgis/nope.fgb', { Range: 'bytes=0-9' })).status).toBe(404);
    const json = await get('/data/sites.json', { Range: 'bytes=0-4' });
    expect(json.status).toBe(200);
    expect(await json.text()).toBe('whole json');
  });

  it('is behind the password gate like everything else', async () => {
    const gated = env(undefined, 'pw');
    expect((await get('/qgis/sites.fgb', {}, gated)).status).toBe(401);
    expect((await get('/qgis/r2/dem-20m.cog.tif', {}, gated)).status).toBe(401);
  });
});

/** A stand-in for an R2 bucket holding one object. */
function bucket(size = 5000) {
  const seen: { key: string; range?: string }[] = [];
  const object = (range?: { offset: number; length: number }) => ({
    size,
    httpEtag: '"r2"',
    range,
    body: 'bytes',
    writeHttpMetadata: (h: Headers) => h.set('Content-Type', 'image/tiff'),
  });
  return {
    seen,
    head: (key: string) => Promise.resolve(key === 'dem-20m.cog.tif' ? object() : null),
    get: (key: string, opts: { range: Headers }) => {
      const header = opts.range.get('Range') ?? undefined;
      seen.push({ key, range: header });
      if (key !== 'dem-20m.cog.tif') return Promise.resolve(null);
      if (header === 'bytes=9999-') return Promise.reject(new Error('range'));
      const m = header ? /^bytes=(\d+)-(\d+)$/.exec(header) : null;
      return Promise.resolve(
        object(m ? { offset: Number(m[1]), length: Number(m[2]) - Number(m[1]) + 1 } : undefined),
      );
    },
  };
}

describe('/qgis/r2 (the big rasters)', () => {
  it('hands the range to R2 and reports what came back', async () => {
    const b = bucket();
    const res = await get('/qgis/r2/dem-20m.cog.tif', { Range: 'bytes=100-299' }, env(b));
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 100-299/5000');
    expect(res.headers.get('Content-Length')).toBe('200');
    expect(res.headers.get('Content-Type')).toBe('image/tiff');
    expect(b.seen).toEqual([{ key: 'dem-20m.cog.tif', range: 'bytes=100-299' }]);
  });

  it('sends the whole object with no Range, and its size on HEAD', async () => {
    const whole = await get('/qgis/r2/dem-20m.cog.tif', {}, env(bucket()));
    expect(whole.status).toBe(200);
    expect(whole.headers.get('Content-Length')).toBe('5000');
    const head = await get('/qgis/r2/dem-20m.cog.tif', {}, env(bucket()), 'HEAD');
    expect(head.status).toBe(200);
    expect(head.headers.get('Content-Length')).toBe('5000');
    expect(head.headers.get('Accept-Ranges')).toBe('bytes');
  });

  it('404s an unknown key, 416s a range R2 refuses, and 404s with no bucket bound', async () => {
    expect((await get('/qgis/r2/nope.tif', {}, env(bucket()))).status).toBe(404);
    expect(
      (await get('/qgis/r2/dem-20m.cog.tif', { Range: 'bytes=9999-' }, env(bucket()))).status,
    ).toBe(416);
    expect((await get('/qgis/r2/dem-20m.cog.tif')).status).toBe(404);
  });
});
