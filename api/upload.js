// Завантаження фото й документів — лише через сервер.
// POST /api/upload?person=<id>&kind=full|thumb&caption=...  тіло — сам файл (до 4 МБ; браузер зменшує фото перед відправкою).
// Спершу надсилається повний файл (відповідь: {id}), потім мініатюра з &photo=<id>&kind=thumb.
import crypto from 'node:crypto';
import { db } from './_db.js';
import { handler, send, fail, readRaw, revision, track } from './_lib.js';

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
  const id = crypto.randomUUID();
  const path = `photos/${personId}/${id}.${OK[mime]}`;
  await db.put(path, buf, mime);
  const caption = String(url.searchParams.get('caption') || '').slice(0, 500);
  await db.insert('photos', { id, person_id: personId, path, caption, mime, size: buf.length, created_by: me.id });
  await revision('photo', id, 'create', null, { person_id: personId, caption, path }, me.id);
  // перше фото стає головним
  if (!person.data.portrait && mime !== 'application/pdf') {
    await db.update('persons', { eq: { id: personId } }, { data: { ...person.data, portrait: id }, version: person.version + 1, updated_by: me.id, updated_at: new Date().toISOString() });
  }
  track(me.id, ctx.sid, 'edit', 'upload', personId);
  return send(res, 200, { id, mime });
});

export const config = { api: { bodyParser: false } };
