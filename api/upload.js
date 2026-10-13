// Завантаження фото й документів — лише через сервер.
// POST /api/upload?person=<id>&kind=full|thumb&caption=...  тіло — сам файл (до 4 МБ; браузер зменшує фото перед відправкою).
// Спершу надсилається повний файл (відповідь: {id}), потім мініатюра з &photo=<id>&kind=thumb.
import crypto from 'node:crypto';
import { db } from './_db.js';
import { handler, send, fail, readRaw, revision, track, can, canAddTo, pendGet, pendSet } from './_lib.js';

const OK = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
function sniff(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  if (b.slice(0, 5).toString() === '%PDF-') return 'application/pdf';
  return null;
}

export default handler(async (req, res, ctx, url) => {
  if (req.method !== 'POST') return fail(res, 405, 'method');
  const me = ctx.member;
  const buf = await readRaw(req, 4_200_000);
  const mime = sniff(buf);
  if (!mime) return fail(res, 415, 'type');
  const kind = url.searchParams.get('kind') === 'thumb' ? 'thumb' : 'full';

  // Архівні документи (скани метрик тощо): ?doc=<id>[&meta=<json>] — сторінка додається до документа; лише редактор і вище
  const docId = url.searchParams.get('doc');
  if (docId != null) {
    if (!can(me, 'editor')) return fail(res, 403, 'forbidden');
    if (!/^[a-z0-9_-]{2,60}$/.test(docId)) return fail(res, 400, 'bad_id');
    if (mime === 'application/pdf') return fail(res, 415, 'type');
    const d = await db.get('documents', { eq: { id: docId } });
    if (kind === 'thumb') {
      const pages = d?.data?.pages || []; const n = Number(url.searchParams.get('page'));
      if (!d || !Number.isInteger(n) || !pages[n] || mime !== 'image/jpeg' || buf.length > 400_000) return fail(res, 400, 'bad');
      await db.put(pages[n].replace(/([^/]+)$/, 't-$1'), buf, mime);
      return send(res, 200, { ok: true });
    }
    let data;
    if (d) data = { ...d.data };
    else {
      let m = {}; try { m = JSON.parse(url.searchParams.get('meta') || '{}'); } catch { return fail(res, 400, 'bad_meta'); }
      const S = (v, n) => String(v ?? '').slice(0, n).trim();
      data = { title: S(m.title, 200) || 'Документ', date: S(m.date, 40), place: S(m.place, 120), src: S(m.src, 400), line: S(m.line, 400), text: S(m.text, 4000),
        maybe: !!m.maybe, people: (Array.isArray(m.people) ? m.people : []).map(x => S(x, 60)).filter(Boolean).slice(0, 40), pages: [] };
      if (/^https:\/\//.test(S(m.url, 300))) data.url = S(m.url, 300);
      if (m.type === 'map') { data.type = 'map'; data.people = []; data.villages = (Array.isArray(m.villages) ? m.villages : []).map(x => S(x, 60)).filter(Boolean).slice(0, 20); const y = Number(m.year); if (Number.isInteger(y) && y > 1500 && y < 2100) data.year = y; }
    }
    const n = (data.pages || []).length;
    const path = `docs/${docId}-${n}-${crypto.randomBytes(3).toString('hex')}.${OK[mime]}`;
    await db.put(path, buf, mime);
    data.pages = [...(data.pages || []), path];
    if (d) await db.update('documents', { eq: { id: docId } }, { data, updated_by: me.id, updated_at: new Date().toISOString() });
    else await db.insert('documents', { id: docId, data, sort: 1000, updated_by: me.id });
    await revision('document', docId, d ? 'update' : 'create', d ? d.data : null, data, me.id);
    track(me.id, ctx.sid, 'edit', 'upload', 'doc:' + docId);
    return send(res, 200, { id: docId, page: n });
  }

  if (kind === 'thumb') {
    const p = await db.get('photos', { eq: { id: String(url.searchParams.get('photo') || '').slice(0, 60), deleted: false } });
    if (!p || p.created_by !== me.id || p.thumb || mime !== 'image/jpeg' || buf.length > 400_000) return fail(res, 400, 'bad');
    const path = p.path.replace(/\.[a-z]+$/, '') + '-t.jpg';
    await db.put(path, buf, mime);
    await db.update('photos', { eq: { id: p.id } }, { thumb: path });
    return send(res, 200, { ok: true });
  }

  const personId = String(url.searchParams.get('person') || '').slice(0, 60);
  const person = await db.get('persons', { eq: { id: personId, deleted: false } });
  if (!person) return fail(res, 404, 'not_found');
  const pending = !(await canAddTo(me, personId)); // не своя гілка — фото чекає підтвердження власника
  const id = crypto.randomUUID();
  const path = `photos/${personId}/${id}.${OK[mime]}`;
  await db.put(path, buf, mime);
  const caption = String(url.searchParams.get('caption') || '').slice(0, 500);
  await db.insert('photos', { id, person_id: personId, path, caption, mime, size: buf.length, created_by: me.id });
  await revision('photo', id, 'create', null, { person_id: personId, caption, path }, me.id);
  if (pending) { const pd = await pendGet(); pd[id] = { by: me.id, at: new Date().toISOString(), person: personId }; await pendSet(pd, me.id); }
  // перше фото стає головним (крім тих, що чекають підтвердження)
  if (!pending && !person.data.portrait && mime !== 'application/pdf') {
    await db.update('persons', { eq: { id: personId } }, { data: { ...person.data, portrait: id }, version: person.version + 1, updated_by: me.id, updated_at: new Date().toISOString() });
  }
  track(me.id, ctx.sid, 'edit', 'upload', personId);
  return send(res, 200, { id, mime, pending });
});

export const config = { api: { bodyParser: false } };
