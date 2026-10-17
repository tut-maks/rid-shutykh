// Файли віддає лише сервер і лише тим, хто увійшов. Прямих посилань на сховище немає.
// GET /api/file?doc=<id>&page=<n>[&thumb=1]  |  GET /api/file?photo=<id>[&thumb=1][&v=orig]  (v=orig — початковий файл до обробки, якщо фото замінювали)
import { db } from './_db.js';
import { handler, fail, track, who, can, pendGet, verGet } from './_lib.js';

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
    if (url.searchParams.get('v') === 'orig') { const v = (await verGet())[p.id]; if (v?.orig) { path = thumb && v.origThumb ? v.origThumb : v.orig; mime = thumb && v.origThumb ? 'image/jpeg' : (v.origMime || 'image/jpeg'); target = 'photo:' + p.id + '-original'; } }
  }

  const buf = await (await import('./_db.js')).db.read(path);
  if (!buf) return fail(res, 404, 'not_found');
  if (!thumb) track(ctx.member.id, ctx.sid, 'open', 'file', target);
  res.statusCode = 200;
  res.setHeader('content-type', mime);
  res.setHeader('cache-control', immutable ? 'private, max-age=2592000, immutable' : 'private, max-age=86400, stale-while-revalidate=604800');
  res.setHeader('x-content-type-options', 'nosniff');
  const ext = { 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[mime] || 'jpg';
  res.setHeader('content-disposition', url.searchParams.get('dl') === '1' && !thumb ? `attachment; filename="${(target || 'file').replace(/[^a-z0-9_-]/gi, '-')}.${ext}"` : 'inline');
  // великі файли (довгі аудіозаписи) — частинами по 4 МБ: ?chunk=<k>; у відповіді x-chunks — скільки всього частин
  const CH = 4_000_000, nch = Math.ceil(buf.length / CH), ck = url.searchParams.get('chunk');
  res.setHeader('x-chunks', String(nch));
  if (ck != null || nch > 1) { const k = Math.max(0, Math.min(nch - 1, Number(ck) || 0)); res.setHeader('cache-control', 'private, max-age=86400'); return res.end(buf.subarray(k * CH, (k + 1) * CH)); }
  res.end(buf);
}, { auth: false });
