// Перше налаштування: створення власника (одноразовим BOOTSTRAP_TOKEN) і імпорт початкових даних.
// GET /api/setup?a=status · POST ?a=init {token,email,name,password} · POST ?a=seed (власник)
import fs from 'node:fs';
import path from 'node:path';
import { db } from './_db.js';
import { handler, send, fail, readJSON, env, safeEq, hashPass, createSession, who, can, tooMany, attempt, clientIp, revision, cleanPerson } from './_lib.js';

const ROOT = process.cwd();

export default handler(async (req, res, _c, url) => {
  const a = url.searchParams.get('a');
  const members = await db.list('members', { limit: 1 });

  if (a === 'status') return send(res, 200, { initialized: members.length > 0 });

  if (a === 'init' && req.method === 'POST') {
    if (members.length) return fail(res, 409, 'done');
    if (await tooMany('setup:' + clientIp(req), 5, 60)) return fail(res, 429, 'too_many');
    const { token, email, name, password } = await readJSON(req, 10_000);
    if (!env('BOOTSTRAP_TOKEN') || !safeEq(token, env('BOOTSTRAP_TOKEN'))) { await attempt('setup:' + clientIp(req)); return fail(res, 401, 'token'); }
    if (!password || String(password).length < 10) return fail(res, 400, 'weak');
    const e = String(email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return fail(res, 400, 'email');
    const [m] = await db.insert('members', { email: e, name: String(name || '').slice(0, 80), role: 'owner', person_id: 'maksym', pass_hash: hashPass(password) });
    await createSession(res, req, m);
    return send(res, 200, { ok: true });
  }

  if (a === 'seed' && req.method === 'POST') {
    const ctx = await who(req);
    if (!ctx || !can(ctx.member, 'owner')) return fail(res, 403, 'forbidden');
    const existing = await db.list('persons', { limit: 1 });
    if (existing.length) return fail(res, 409, 'already');
    const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed/seed.json'), 'utf8'));
    const by = ctx.member.id;
    // файли документів → закрите сховище
    let files = 0;
    for (const d of seed.documents) for (const p of d.pages) for (const name of [p, 't-' + p]) {
      const fp = path.join(ROOT, 'seed/scans', name);
      if (fs.existsSync(fp)) { await db.put('docs/' + name, fs.readFileSync(fp), 'image/jpeg'); files++; }
    }
    await db.insert('persons', seed.persons.map(p => { const { id, ...data } = p; return { id, data, created_by: by, updated_by: by }; }));
    await db.insert('unions', seed.unions.map((u, i) => ({ id: 'u_seed' + i, a: u.a, b: u.b, date: u.date || null, created_by: by })));
    await db.insert('families', seed.families.map((f, i) => { const { id, ...data } = f; return { id, data, sort: i, updated_by: by }; }));
    await db.insert('documents', seed.documents.map((d, i) => { const { id, ...data } = d; return { id, data: { ...data, pages: d.pages.map(p => 'docs/' + p) }, sort: i, updated_by: by }; }));
    await revision('seed', 'initial', 'create', null, { persons: seed.persons.length, documents: seed.documents.length, files }, by);
    return send(res, 200, { ok: true, persons: seed.persons.length, documents: seed.documents.length, files });
  }

  // Нові файли, які Claude додав у репозиторій (seed/import/manifest.json): фото людей і сторінки документів. Лише власник; повторно не імпортує.
  if (a === 'import' && req.method === 'POST') {
    const ctx = await who(req);
    if (!ctx || !can(ctx.member, 'owner')) return fail(res, 403, 'forbidden');
    const mf = path.join(ROOT, 'seed/import/manifest.json');
    if (!fs.existsSync(mf)) return send(res, 200, { ok: true, added: 0 });
    const items = JSON.parse(fs.readFileSync(mf, 'utf8')); const by = ctx.member.id; const out = [];
    const read = f => { const fp = path.join(ROOT, 'seed/import', path.basename(String(f || ''))); return fs.existsSync(fp) ? fs.readFileSync(fp) : null; };
    for (const it of items) {
      const key = String(it.key || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 60); if (!key) continue;
      if (it.kind === 'photo') {
        const person = await db.get('persons', { eq: { id: String(it.person), deleted: false } }); if (!person) { out.push(key + ': no person'); continue; }
        const p = `photos/${person.id}/imp-${key}.jpg`;
        if ((await db.list('photos', { eq: { path: p }, limit: 1 })).length) { out.push(key + ': вже є'); continue; }
        const buf = read(it.file); if (!buf) { out.push(key + ': no file'); continue; }
        await db.put(p, buf, 'image/jpeg'); let thumb = null; const tb = read(it.thumb); if (tb) { thumb = p.replace(/\.jpg$/, '-t.jpg'); await db.put(thumb, tb, 'image/jpeg'); }
        const [ph] = await db.insert('photos', { person_id: person.id, path: p, thumb, caption: String(it.caption || '').slice(0, 500), mime: 'image/jpeg', size: buf.length, created_by: by });
        await revision('photo', ph.id, 'create', null, { person_id: person.id, caption: it.caption, path: p }, by);
        if (it.portrait) { const nd = { ...person.data, portrait: ph.id }; await db.update('persons', { eq: { id: person.id } }, { data: nd, version: person.version + 1, updated_by: by, updated_at: new Date().toISOString() }); await revision('person', person.id, 'update', person.data, nd, by); }
        out.push(key + ': ok');
      } else if (it.kind === 'person') { // нова картка з фіксованим id (повторно не створюється)
        const id = String(it.id || '').replace(/[^a-z0-9_]/gi, '').slice(0, 60);
        if (!id || await db.get('persons', { eq: { id } })) { out.push(key + ': вже є'); continue; }
        const data = cleanPerson(it.data || {}); await db.insert('persons', { id, data, created_by: by, updated_by: by }); await revision('person', id, 'create', null, data, by);
        if (it.spouseOf && await db.get('persons', { eq: { id: String(it.spouseOf) } })) { const u = { id: 'u_' + id, a: String(it.spouseOf), b: id, date: String(it.date || ''), created_by: by }; await db.insert('unions', u); await revision('union', u.id, 'create', null, u, by); }
        out.push(key + ': ok');
      } else if (it.kind === 'personpatch') { // точкові виправлення тексту/полів картки
        const p = await db.get('persons', { eq: { id: String(it.person), deleted: false } }); if (!p) { out.push(key + ': no person'); continue; }
        const nd = { ...p.data }; let ch = false;
        for (const [k, v] of Object.entries(it.set || {})) if (nd[k] !== v) { nd[k] = v; ch = true; }
        for (const k of it.unset || []) if (nd[k]) { delete nd[k]; ch = true; }
        for (const [from, to] of it.replace || []) {
          if (typeof nd.note !== 'string') continue;
          // доповнення «новий текст + старий» не повторювати; прибрати повтори, якщо вже задвоїлось
          const pre = to && to.endsWith(from) ? to.slice(0, to.length - from.length) : '';
          if (pre) { let n = nd.note; while (n.includes(pre + pre)) n = n.split(pre + pre).join(pre); if (n !== nd.note) { nd.note = n; ch = true; } }
          if (to && nd.note.includes(to)) continue;
          if (nd.note.includes(from)) { nd.note = nd.note.split(from).join(to); ch = true; }
        }
        if (!ch) { out.push(key + ': без змін'); continue; }
        const data = cleanPerson(nd); await db.update('persons', { eq: { id: p.id } }, { data, version: p.version + 1, updated_by: by, updated_at: new Date().toISOString() }); await revision('person', p.id, 'update', p.data, data, by);
        out.push(key + ': ok');
      } else if (it.kind === 'familypatch') {
        const f = await db.get('families', { eq: { id: String(it.family) } }); if (!f) { out.push(key + ': no family'); continue; }
        let story = f.data.story || ''; const before = story; for (const [from, to] of it.replace || []) story = story.split(from).join(to);
        if (story === before) { out.push(key + ': без змін'); continue; }
        const data = { ...f.data, story }; await db.update('families', { eq: { id: f.id } }, { data, updated_by: by, updated_at: new Date().toISOString() }); await revision('family', f.id, 'update', f.data, data, by);
        out.push(key + ': ok');
      } else if (it.kind === 'docpage') {
        const d = await db.get('documents', { eq: { id: String(it.doc) } }); if (!d) { out.push(key + ': no doc'); continue; }
        const p = `docs/imp-${key}.jpg`; if ((d.data.pages || []).includes(p)) { out.push(key + ': вже є'); continue; }
        const buf = read(it.file); if (!buf) { out.push(key + ': no file'); continue; }
        await db.put(p, buf, 'image/jpeg'); const tb = read(it.thumb); if (tb) await db.put('docs/t-imp-' + key + '.jpg', tb, 'image/jpeg');
        const data = { ...d.data, pages: [...(d.data.pages || []), p] };
        await db.update('documents', { eq: { id: d.id } }, { data, updated_by: by, updated_at: new Date().toISOString() }); await revision('document', d.id, 'update', d.data, data, by);
        out.push(key + ': ok');
      }
    }
    return send(res, 200, { ok: true, result: out });
  }

  return fail(res, 404, 'unknown');
}, { auth: false });
