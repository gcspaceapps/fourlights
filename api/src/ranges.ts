// HTTP range requests for the QGIS pack (/qgis/...).
//
// QGIS reads our layers through GDAL's /vsicurl/, which asks for a few thousand bytes at a time
// with a Range header and refuses a server that sends the whole file instead. Workers static
// assets ignore Range and always send everything, so the files under /qgis/ are cut here. The
// whole asset is read each time, which is fine for files of a few MB (a static asset cannot be
// over 25 MiB). The three bigger rasters live in an R2 bucket (/qgis/r2/<key>): R2 reads just
// the requested bytes itself, so the Worker passes the range through and never holds the file.

/**
 * One range only: "bytes=a-b", "bytes=a-" or "bytes=-n".
 * Returns [start, end] inclusive, false if it cannot be satisfied, null if it is not a form we
 * slice (the caller then sends the whole file, which HTTP allows).
 */
export function parseRange(header: string, size: number): [number, number] | false | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  if (m[1] === '') {
    const n = Number(m[2]);
    return n === 0 || size === 0 ? false : [Math.max(0, size - n), size - 1];
  }
  const start = Number(m[1]);
  const end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  return start >= size || start > end ? false : [start, end];
}

const readOnly = (method: string): boolean => method === 'GET' || method === 'HEAD';

/** A static asset's response, cut down to the range the request asked for. */
export async function sliceAsset(request: Request, asset: Response): Promise<Response> {
  if (asset.status !== 200 || !readOnly(request.method)) return asset;
  const headers = new Headers(asset.headers);
  headers.set('Accept-Ranges', 'bytes');
  const range = request.headers.get('Range');
  if (!range) return new Response(asset.body, { status: 200, headers });

  const bytes = await asset.arrayBuffer();
  const size = bytes.byteLength;
  const span = parseRange(range, size);
  if (span === null) return new Response(bytes, { status: 200, headers });
  if (span === false) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  const [start, end] = span;
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  // The whole file's validators and encoding do not describe a slice of it.
  headers.delete('ETag');
  headers.delete('Content-Encoding');
  const body = request.method === 'HEAD' ? null : bytes.slice(start, end + 1);
  return new Response(body, { status: 206, headers });
}

/** A file from the R2 bucket, whole or the range asked for. */
export async function fromBucket(
  request: Request,
  bucket: R2Bucket | undefined,
  key: string,
): Promise<Response> {
  if (!readOnly(request.method)) return new Response(null, { status: 405 });
  if (!bucket) return new Response('Not found.\n', { status: 404 });
  let object: R2Object | R2ObjectBody | null;
  try {
    object =
      request.method === 'HEAD'
        ? await bucket.head(key)
        : await bucket.get(key, { range: request.headers });
  } catch {
    // R2 throws on a range it cannot satisfy.
    return new Response(null, { status: 416 });
  }
  if (!object) return new Response('Not found.\n', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('ETag', object.httpEtag);
  headers.set('Accept-Ranges', 'bytes');
  if (request.method === 'HEAD' || !('body' in object)) {
    headers.set('Content-Length', String(object.size));
    return new Response(null, { status: 200, headers });
  }
  const body = (object as R2ObjectBody).body;
  const range = object.range as { offset?: number; length?: number; suffix?: number } | undefined;
  if (!request.headers.has('Range') || !range) {
    headers.set('Content-Length', String(object.size));
    return new Response(body, { status: 200, headers });
  }
  const start = range.offset ?? object.size - (range.suffix ?? 0);
  const length = range.length ?? object.size - start;
  if (start >= object.size || length <= 0) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${object.size}` },
    });
  }
  headers.set('Content-Range', `bytes ${start}-${start + length - 1}/${object.size}`);
  headers.set('Content-Length', String(length));
  return new Response(body, { status: 206, headers });
}
