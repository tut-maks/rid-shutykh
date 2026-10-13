// Перше налаштування: створення власника (одноразовим BOOTSTRAP_TOKEN) і імпорт початкових даних.
// GET /api/setup?a=status · POST ?a=init {token,email,name,password} · POST ?a=seed (власник)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db } from './_db.js';
import { handler, send, fail, readJSON, env, safeEq, hashPass, createSession, who, can, tooMany, attempt, clientIp, revision, cleanPerson } from './_lib.js';

const ROOT = process.cwd();

export default handler(async (req, res, _c, url) => {
  const a = url.searchParams.get('a');
  const t0 = Date.now(); const members = await db.list('members', { limit: 1 });
  if (a === 'status') { const t1 = Date.now(); await db.list('members', { limit: 1 }); res.setHeader('server-timing', `db1;dur=${t1 - t0}, db2;dur=${Date.now() - t1}`); return send(res, 200, { initialized: members.length > 0 }); } // час до бази — щоб бачити, чи сервер близько до бази

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
  // a=sync — те саме, але сам сайт: будь-хто з родини, хто відкрив сайт, запускає (лише вміст із репозиторію, не з браузера).
  // Якщо manifest не змінився з минулого разу — одразу «нічого нового».
  if ((a === 'import' || a === 'sync') && req.method === 'POST') {
    const ctx = await who(req);
    if (!ctx || (a === 'import' && !can(ctx.member, 'owner'))) return fail(res, 403, 'forbidden');
    const mf = path.join(ROOT, 'seed/import/manifest.json');
    if (!fs.existsSync(mf)) return send(res, 200, { ok: true, added: 0 });
    const raw = fs.readFileSync(mf, 'utf8'), ver = crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16);
    const verRow = await db.get('settings', { eq: { key: 'import_ver' } }).catch(() => null);
    if (verRow?.value?.v === ver) return send(res, 200, { ok: true, result: [], more: false, fresh: true });
    let by = ctx.member.id;
    if (a === 'sync') { const ow = (await db.list('members', { eq: { role: 'owner', active: true }, limit: 1 }).catch(() => []))[0]; if (ow) by = ow.id; } // автор змін — власник сайту
    const items = JSON.parse(raw); const out = [];
    const read = f => { const fp = path.join(ROOT, 'seed/import', path.basename(String(f || ''))); return fs.existsSync(fp) ? fs.readFileSync(fp) : null; };
    // Уже оброблені пункти (за хешем змісту) пропускаємо без звернень до бази; час обмежено, решта — наступним запуском
    let doneRow = null; try { doneRow = await db.get('settings', { eq: { key: 'import_done' } }); } catch {}
    const done = { ...(doneRow?.value || {}) }, t0 = Date.now(); let more = false, prev = null;
    const H = x => crypto.createHash('sha1').update(JSON.stringify(x)).digest('hex').slice(0, 16);
    const fin = () => { if (prev && /: (ok|вже є|без змін)/.test(out[out.length - 1] || '')) done[prev.key] = prev.h; prev = null; };
    for (const it of items) {
      fin();
      const key = String(it.key || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 60); if (!key) continue;
      const h = H(it); if (done[key] === h) continue;
      if (Date.now() - t0 > 40000) { more = true; break; }
      prev = { key, h };
      try {
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
      } else if (it.kind === 'photodel') { // прибрати фото, яке колись додав імпорт (напр. замінили обрізаним)
        const p = `photos/${String(it.person)}/imp-${String(it.of).replace(/[^a-z0-9_-]/gi, '')}.jpg`;
        const [ph] = await db.list('photos', { eq: { path: p, deleted: false }, limit: 1 }); if (!ph) { out.push(key + ': вже є'); continue; }
        await db.update('photos', { eq: { id: ph.id } }, { deleted: true }); await revision('photo', ph.id, 'delete', { path: p }, null, by);
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
        if (it.append && !String(nd.note || '').includes(it.append)) { nd.note = (nd.note ? nd.note.trim() + ' ' : '') + it.append; ch = true; } // дописати в кінець опису (один раз)
        for (const s of it.srcadd || []) if (!(nd.src || []).some(x => x.u === s.u)) { nd.src = [...(nd.src || []), s]; ch = true; } // додати джерело, не чіпаючи наявні
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
      } else if (it.kind === 'text') { // великий текст сторінки (історія роду / історія сіл) у settings 'text:<k>'
        const k = String(it.id || ''); if (!['history', 'villages'].includes(k)) { out.push(key + ': bad'); continue; }
        const cur = await db.get('settings', { eq: { key: 'text:' + k } }).catch(() => null);
        if (JSON.stringify(cur?.value) === JSON.stringify(it.value)) { out.push(key + ': вже є'); continue; }
        await db.upsert('settings', { key: 'text:' + k, value: it.value, updated_by: by, updated_at: new Date().toISOString() });
        await revision('text', k, cur ? 'update' : 'create', null, { len: JSON.stringify(it.value).length }, by);
        out.push(key + ': ok');
      } else if (it.kind === 'docpatch') { // уточнити існуючий документ (рамки, точніший опис рядка); не чіпає, якщо вже так
        const d = await db.get('documents', { eq: { id: String(it.id) } }); if (!d) { out.push(key + ': no doc'); continue; }
        const patch = it.data || {}; if (Object.keys(patch).every(k => JSON.stringify(d.data[k]) === JSON.stringify(patch[k]))) { out.push(key + ': вже є'); continue; }
        const data = { ...d.data, ...patch }; await db.update('documents', { eq: { id: d.id } }, { data, updated_by: by, updated_at: new Date().toISOString() });
        await revision('document', d.id, 'update', Object.fromEntries(Object.keys(patch).map(k => [k, d.data[k] ?? null])), patch, by);
        out.push(key + ': ok');
      } else if (it.kind === 'unionpatch') { // підпис зв'язку двох людей (напр. «шлюб не підтверджено»)
        const us = await db.list('unions', { eq: { deleted: false } }); const u = us.find(x => (x.a === it.a && x.b === it.b) || (x.a === it.b && x.b === it.a)); if (!u) { out.push(key + ': no union'); continue; }
        const date = String(it.date ?? u.date ?? '').slice(0, 60); if (u.date === date) { out.push(key + ': вже є'); continue; }
        await db.update('unions', { eq: { id: u.id } }, { date }); await revision('union', u.id, 'update', { date: u.date }, { date }, by); out.push(key + ': ok');
      } else if (it.kind === 'familypatch') {
        const f = await db.get('families', { eq: { id: String(it.family) } }); if (!f) { out.push(key + ': no family'); continue; }
        let story = f.data.story || '', title = f.data.title || ''; const before = story + '\n' + title;
        for (const [from, to] of it.replace || []) { story = story.split(from).join(to); title = title.split(from).join(to); }
        if (story + '\n' + title === before) { out.push(key + ': без змін'); continue; }
        const data = { ...f.data, story, ...(title ? { title } : {}) }; await db.update('families', { eq: { id: f.id } }, { data, updated_by: by, updated_at: new Date().toISOString() }); await revision('family', f.id, 'update', f.data, data, by);
        out.push(key + ': ok');
      } else if (it.kind === 'map' || it.kind === 'doc') { // стара карта (type='map', geo) або архівний документ зі сканами
        const id = String(it.id || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 60); if (!id) continue;
        const cur = await db.get('documents', { eq: { id } });
        const pages = cur?.data?.pages ? [...cur.data.pages] : [];
        let added = 0;
        for (const [n, f] of (it.files || []).entries()) {
          const p = `docs/imp-${key}-${n}.jpg`; if (pages.includes(p)) continue;
          const buf = read(f.file); if (!buf) { out.push(key + ': no file ' + f.file); continue; }
          await db.put(p, buf, 'image/jpeg'); const tb = read(f.thumb); if (tb) await db.put(`docs/t-imp-${key}-${n}.jpg`, tb, 'image/jpeg');
          pages.push(p); added++;
        }
        const data = it.kind === 'map' ? { ...(cur?.data || {}), ...(it.data || {}), type: 'map', people: [], pages } : { ...(cur?.data || {}), ...(it.data || {}), pages };
        if (JSON.stringify(data) === JSON.stringify(cur?.data)) { out.push(key + ': вже є'); continue; }
        if (cur) await db.update('documents', { eq: { id } }, { data, updated_by: by, updated_at: new Date().toISOString() });
        else await db.insert('documents', { id, data, sort: it.kind === 'map' ? 2000 : 1000, updated_by: by });
        await revision('document', id, cur ? 'update' : 'create', cur?.data || null, data, by);
        out.push(key + ': ok' + (added ? '' : ' (опис)'));
      } else if (it.kind === 'docpage') {
        const d = await db.get('documents', { eq: { id: String(it.doc) } }); if (!d) { out.push(key + ': no doc'); continue; }
        const p = `docs/imp-${key}.jpg`; if ((d.data.pages || []).includes(p)) { out.push(key + ': вже є'); continue; }
        const buf = read(it.file); if (!buf) { out.push(key + ': no file'); continue; }
        await db.put(p, buf, 'image/jpeg'); const tb = read(it.thumb); if (tb) await db.put('docs/t-imp-' + key + '.jpg', tb, 'image/jpeg');
        const data = { ...d.data, pages: [...(d.data.pages || []), p] };
        await db.update('documents', { eq: { id: d.id } }, { data, updated_by: by, updated_at: new Date().toISOString() }); await revision('document', d.id, 'update', d.data, data, by);
        out.push(key + ': ok');
      }
      } catch (e) { out.push(key + ': error ' + String(e?.message || e).slice(0, 160)); console.error('[import]', key, e); } // один збій не зупиняє решту
    }
    fin(); try { await db.upsert('settings', { key: 'import_done', value: done, updated_by: by, updated_at: new Date().toISOString() }); } catch {}
    if (!more && !out.some(x => / error /.test(x))) try { await db.upsert('settings', { key: 'import_ver', value: { v: ver, at: new Date().toISOString(), errors: out.filter(x => / error /.test(x)).slice(0, 20) }, updated_by: by, updated_at: new Date().toISOString() }); } catch {}
    return send(res, 200, { ok: true, result: out, more });
  }

  return fail(res, 404, 'unknown');
}, { auth: false });
