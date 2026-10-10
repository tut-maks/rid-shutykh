// Перше налаштування: створення власника (одноразовим BOOTSTRAP_TOKEN) і імпорт початкових даних.
// GET /api/setup?a=status · POST ?a=init {token,email,name,password} · POST ?a=seed (власник)
import fs from 'node:fs';
import path from 'node:path';
import { db } from './_db.js';
import { handler, send, fail, readJSON, env, safeEq, hashPass, createSession, who, can, tooMany, attempt, clientIp, revision } from './_lib.js';

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

  return fail(res, 404, 'unknown');
}, { auth: false });
