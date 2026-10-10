// Файли віддає лише сервер і лише тим, хто увійшов. Прямих посилань на сховище немає.
// GET /api/file?doc=<id>&page=<n>[&thumb=1]  |  GET /api/file?photo=<id>[&thumb=1]
import { db } from './_db.js';
import { handler, fail, track } from './_lib.js';

export default handler(async (req, res, ctx, url) => {
  const thumb = url.searchParams.get('thumb') === '1';
  let path = null, mime = 'image/jpeg', target = null;
  const docId = url.searchParams.get('doc'), photoId = url.searchParams.get('photo');
  if (docId) {
    const d = await db.get('documents', { eq: { id: docId.slice(0, 60) } });
    const pages = d?.data?.pages || []; const i = Math.max(0, Math.min(pages.length - 1, Number(url.searchParams.get('page') || 0)));
    if (!pages.length) return fail(res, 404, 'not_found');
    path = thumb ? pages[i].replace(/([^/]+)$/, 't-$1') : pages[i]; target = 'doc:' + d.id;
  } else if (photoId) {
    const p = await db.get('photos', { eq: { id: photoId.slice(0, 60), deleted: false } });
    if (!p) return fail(res, 404, 'not_found');
    path = thumb && p.thumb ? p.thumb : p.path; mime = thumb && p.thumb ? 'image/jpeg' : (p.mime || 'image/jpeg'); target = 'photo:' + p.id;
  } else return fail(res, 400, 'bad');

  const buf = await (await import('./_db.js')).db.read(path);
  if (!buf) return fail(res, 404, 'not_found');
  if (!thumb) track(ctx.member.id, ctx.sid, 'open', 'file', target);
  res.statusCode = 200;
  res.setHeader('content-type', mime);
  res.setHeader('cache-control', 'private, max-age=86400');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('content-disposition', 'inline');
  res.end(buf);
});
