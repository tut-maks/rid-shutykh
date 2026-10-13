// Файли віддає лише сервер і лише тим, хто увійшов. Прямих посилань на сховище немає.
// GET /api/file?doc=<id>&page=<n>[&thumb=1]  |  GET /api/file?photo=<id>[&thumb=1]
import { db } from './_db.js';
import { handler, fail, track, who, can, pendGet } from './_lib.js';

export default handler(async (req, res, _c, url) => {
  // перевірка входу і пошук файлу — одночасно (на одну затримку менше); без входу файл не віддається
  const thumb = url.searchParams.get('thumb') === '1';
  let path = null, mime = 'image/jpeg', target = null, immutable = false;
  const docId = url.searchParams.get('doc'), photoId = url.searchParams.get('photo');
  if (!docId && !photoId) return fail(res, 400, 'bad');
  const [ctx, row] = await Promise.all([who(req),
    docId ? db.get('documents', { eq: { id: docId.slice(0, 60) } }) : db.get('photos', { eq: { id: photoId.slice(0, 60), deleted: false } })]);
  if (!ctx) return fail(res, 401, 'auth');
  if (docId) {
    const d = row; const pages = d?.data?.pages || []; const i = Math.max(0, Math.min(pages.length - 1, Number(url.searchParams.get('page') || 0)));
    if (!pages.length) return fail(res, 404, 'not_found');
    path = thumb ? pages[i].replace(/([^/]+)$/, 't-$1') : pages[i]; target = 'doc:' + d.id;
  } else {
    const p = row; if (!p) return fail(res, 404, 'not_found');
    if (!can(ctx.member, 'owner') && p.created_by !== ctx.member.id) { const pd = await pendGet(); if (pd[p.id]) return fail(res, 404, 'not_found'); } // ще не підтверджене
    path = thumb && p.thumb ? p.thumb : p.path; mime = thumb && p.thumb ? 'image/jpeg' : (p.mime || 'image/jpeg'); target = 'photo:' + p.id; immutable = false; // фото може чекати підтвердження — без «immutable»
  }

  const buf = await (await import('./_db.js')).db.read(path);
  if (!buf) return fail(res, 404, 'not_found');
  if (!thumb) track(ctx.member.id, ctx.sid, 'open', 'file', target);
  res.statusCode = 200;
  res.setHeader('content-type', mime);
  res.setHeader('cache-control', immutable ? 'private, max-age=2592000, immutable' : 'private, max-age=86400, stale-while-revalidate=604800');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('content-disposition', 'inline');
  res.end(buf);
}, { auth: false });
