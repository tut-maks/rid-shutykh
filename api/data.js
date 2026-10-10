// Дані дерева. GET /api/data — усе для показу; POST /api/data {op, ...} — зміни (з історією).
import { db } from './_db.js';
import { handler, send, fail, readJSON, can, revision, track, cleanPerson, slugId } from './_lib.js';

const S = (v, n) => String(v ?? '').slice(0, n).trim();

async function bootstrap(ctx) {
  const [persons, unions, families, documents, photos, stories, members, revs] = await Promise.all([
    db.list('persons', { eq: { deleted: false } }),
    db.list('unions', { eq: { deleted: false } }),
    db.list('families', { order: 'sort' }),
    db.list('documents', { order: 'sort' }),
    db.list('photos', { eq: { deleted: false }, order: 'created_at' }),
    db.list('stories', { eq: { deleted: false }, order: 'created_at' }),
    db.list('members', { select: 'id,name,role,person_id,active' }),
    db.list('revisions', { eq: { entity: 'person' }, order: 'at', desc: true, limit: 3000 }),
  ]);
  const last = {};
  for (const r of revs) if (!last[r.entity_id]) last[r.entity_id] = { by: r.by, at: r.at, action: r.action };
  return {
    me: { id: ctx.member.id, name: ctx.member.name, role: ctx.member.role, person_id: ctx.member.person_id || null },
    persons: persons.map(p => ({ id: p.id, ...p.data, v: p.version, last: last[p.id] || null })),
    unions: unions.map(u => ({ id: u.id, a: u.a, b: u.b, date: u.date || '' })),
    families: families.map(f => ({ id: f.id, ...f.data })),
    documents: documents.map(d => ({ id: d.id, ...d.data, pages: (d.data.pages || []).length })),
    photos: photos.map(p => ({ id: p.id, person: p.person_id, caption: p.caption, mime: p.mime, by: p.created_by, at: p.created_at })),
    stories: stories.map(s => ({ id: s.id, target: s.target, text: s.text, by: s.created_by, at: s.created_at })),
    names: Object.fromEntries(members.map(m => [m.id, m.name || 'Родич'])),
  };
}

export default handler(async (req, res, ctx) => {
  const me = ctx.member;
  if (req.method === 'GET') return send(res, 200, await bootstrap(ctx));
  if (req.method !== 'POST') return fail(res, 405, 'method');

  const body = await readJSON(req, 200_000);
  const op = body.op;
  const editor = can(me, 'editor'), owner = can(me, 'owner');
  const done = (out, target) => { track(me.id, ctx.sid, 'edit', op, target); return send(res, 200, out); };

  /* ── люди ── */
  if (op === 'person.save') {
    if (!editor) return fail(res, 403, 'forbidden');
    const data = cleanPerson(body.data || {});
    if (!data.n && !data.s) return fail(res, 400, 'name');
    for (const k of ['f', 'mo']) if (data[k] && !(await db.get('persons', { eq: { id: data[k], deleted: false } }))) data[k] = '';
    if (body.id) {
      const cur = await db.get('persons', { eq: { id: S(body.id, 60) } });
      if (!cur || cur.deleted) return fail(res, 404, 'not_found');
      if (body.v && cur.version !== body.v) return fail(res, 409, 'conflict');
      if (data.f === cur.id || data.mo === cur.id) return fail(res, 400, 'self');
      if (cur.data.root) data.root = true;
      if (cur.data.portrait && !body.data.hasOwnProperty('portrait')) data.portrait = cur.data.portrait;
      const [row] = await db.update('persons', { eq: { id: cur.id, version: cur.version } }, { data, version: cur.version + 1, updated_by: me.id, updated_at: new Date().toISOString() });
      if (!row) return fail(res, 409, 'conflict');
      await revision('person', cur.id, 'update', cur.data, data, me.id);
      return done({ person: { id: row.id, ...row.data, v: row.version, last: { by: me.id, at: row.updated_at, action: 'update' } } }, cur.id);
    }
    const id = slugId();
    const [row] = await db.insert('persons', { id, data, created_by: me.id, updated_by: me.id });
    await revision('person', id, 'create', null, data, me.id);
    // одразу пов'язати: дитина / батько / мати / подружжя
    const link = body.link || {};
    if (link.childOf) { /* data.f/mo вже задані клієнтом */ }
    if (link.parentOf) {
      const ch = await db.get('persons', { eq: { id: S(link.parentOf, 60), deleted: false } });
      if (ch) { const key = data.sex === 'f' ? 'mo' : 'f'; if (!ch.data[key]) { const nd = { ...ch.data, [key]: id }; await db.update('persons', { eq: { id: ch.id } }, { data: nd, version: ch.version + 1, updated_by: me.id, updated_at: new Date().toISOString() }); await revision('person', ch.id, 'update', ch.data, nd, me.id); } }
    }
    if (link.spouseOf) {
      const sp = await db.get('persons', { eq: { id: S(link.spouseOf, 60), deleted: false } });
      if (sp) { const u = { id: 'u_' + id, a: sp.id, b: id, date: S(link.date, 40), created_by: me.id }; await db.insert('unions', u); await revision('union', u.id, 'create', null, u, me.id); }
    }
    return done({ person: { id, ...row.data, v: row.version, last: { by: me.id, at: row.created_at, action: 'create' } } }, id);
  }

  if (op === 'person.delete') {
    if (!owner) return fail(res, 403, 'forbidden');
    const cur = await db.get('persons', { eq: { id: S(body.id, 60) } });
    if (!cur) return fail(res, 404, 'not_found');
    if (cur.data.root) return fail(res, 400, 'root');
    await db.update('persons', { eq: { id: cur.id } }, { deleted: true, updated_by: me.id, updated_at: new Date().toISOString() });
    await revision('person', cur.id, 'delete', cur.data, null, me.id);
    return done({ ok: true }, cur.id);
  }

  if (op === 'person.portrait') {
    if (!editor) return fail(res, 403, 'forbidden');
    const cur = await db.get('persons', { eq: { id: S(body.id, 60), deleted: false } });
    const ph = await db.get('photos', { eq: { id: S(body.photo, 60), deleted: false } });
    if (!cur || !ph || ph.person_id !== cur.id) return fail(res, 404, 'not_found');
    const nd = { ...cur.data, portrait: ph.id };
    const [row] = await db.update('persons', { eq: { id: cur.id } }, { data: nd, version: cur.version + 1, updated_by: me.id, updated_at: new Date().toISOString() });
    await revision('person', cur.id, 'update', cur.data, nd, me.id);
    return done({ person: { id: row.id, ...row.data, v: row.version } }, cur.id);
  }

  /* ── подружжя ── */
  if (op === 'union.add') {
    if (!editor) return fail(res, 403, 'forbidden');
    const a = S(body.a, 60), b = S(body.b, 60);
    if (!a || !b || a === b) return fail(res, 400, 'bad');
    const u = { id: 'u_' + slugId().slice(2), a, b, date: S(body.date, 40), created_by: me.id };
    await db.insert('unions', u); await revision('union', u.id, 'create', null, u, me.id);
    return done({ union: { id: u.id, a, b, date: u.date } }, a);
  }
  if (op === 'union.remove') {
    if (!editor) return fail(res, 403, 'forbidden');
    const u = await db.get('unions', { eq: { id: S(body.id, 60) } }); if (!u) return fail(res, 404, 'not_found');
    await db.update('unions', { eq: { id: u.id } }, { deleted: true }); await revision('union', u.id, 'delete', u, null, me.id);
    return done({ ok: true }, u.a);
  }

  /* ── спогади: додавати можуть усі учасники ── */
  if (op === 'story.add') {
    const text = S(body.text, 20000), target = S(body.target, 80);
    if (!text || !target) return fail(res, 400, 'empty');
    const [s] = await db.insert('stories', { target, text, created_by: me.id });
    await revision('story', s.id, 'create', null, { target, text }, me.id);
    return done({ story: { id: s.id, target, text, by: me.id, at: s.created_at } }, target);
  }
  if (op === 'story.delete') {
    const s = await db.get('stories', { eq: { id: S(body.id, 60) } }); if (!s) return fail(res, 404, 'not_found');
    if (!owner && s.created_by !== me.id) return fail(res, 403, 'forbidden');
    await db.update('stories', { eq: { id: s.id } }, { deleted: true }); await revision('story', s.id, 'delete', s, null, me.id);
    return done({ ok: true }, s.target);
  }

  /* ── фото ── */
  if (op === 'photo.caption') {
    const p = await db.get('photos', { eq: { id: S(body.id, 60), deleted: false } }); if (!p) return fail(res, 404, 'not_found');
    if (!editor && p.created_by !== me.id) return fail(res, 403, 'forbidden');
    await db.update('photos', { eq: { id: p.id } }, { caption: S(body.caption, 500) }); await revision('photo', p.id, 'update', { caption: p.caption }, { caption: S(body.caption, 500) }, me.id);
    return done({ ok: true }, p.person_id);
  }
  if (op === 'photo.delete') {
    const p = await db.get('photos', { eq: { id: S(body.id, 60), deleted: false } }); if (!p) return fail(res, 404, 'not_found');
    if (!owner && p.created_by !== me.id) return fail(res, 403, 'forbidden');
    await db.update('photos', { eq: { id: p.id } }, { deleted: true }); await revision('photo', p.id, 'delete', p, null, me.id);
    return done({ ok: true }, p.person_id);
  }

  /* ── родини ── */
  if (op === 'family.story') {
    if (!editor) return fail(res, 403, 'forbidden');
    const f = await db.get('families', { eq: { id: S(body.id, 40) } }); if (!f) return fail(res, 404, 'not_found');
    const nd = { ...f.data, story: S(body.story, 30000) };
    await db.update('families', { eq: { id: f.id } }, { data: nd, updated_by: me.id, updated_at: new Date().toISOString() });
    await revision('family', f.id, 'update', f.data, nd, me.id);
    return done({ ok: true }, 'fam:' + f.id);
  }

  return fail(res, 400, 'unknown_op');
});
