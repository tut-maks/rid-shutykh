// Дані дерева. GET /api/data — усе для показу; POST /api/data {op, ...} — зміни (з історією).
import fs from 'node:fs';
import path from 'node:path';
import { db } from './_db.js';
import { handler, send, fail, readJSON, can, revision, track, cleanPerson, cleanLinks, slugId, canAddTo, pendGet, pendSet, joinCfg } from './_lib.js';

const S = (v, n) => String(v ?? '').slice(0, n).trim();

const QK = ['fix', 'ask', 'find'], QS = ['new', 'work', 'found', 'closed'];
const qOut = q => ({ id: q.id, kind: q.kind, person: q.person_id || '', about: q.about || '', text: q.text, status: q.status, answer: q.answer || '', by: q.created_by, at: q.created_at, upd: q.updated_at, updBy: q.updated_by || null });

/* Спільні налаштування родини (settings): група Telegram, «Хто на фото?», «Допоможіть знайти», ДНК-збіги, місця на карті */
const CFG = { tg_group: {}, photo_ask: {}, wanted: [], dna_matches: [], places: {}, photo_people: {} };
async function cfgAll() {
  const out = {}; for (const k in CFG) out[k] = structuredClone(CFG[k]);
  try { for (const r of await db.list('settings', { in: { key: Object.keys(CFG) } })) out[r.key] = r.value ?? out[r.key]; } catch {}
  return out;
}
async function cfgGet(k) { try { const r = await db.get('settings', { eq: { key: k } }); return r?.value ?? structuredClone(CFG[k]); } catch { return structuredClone(CFG[k]); } }
async function cfgSet(k, v, by, before) { await db.upsert('settings', { key: k, value: v, updated_by: by, updated_at: new Date().toISOString() }); await revision('setting', k, 'update', before ?? null, v, by); }
const rid = () => Math.random().toString(36).slice(2, 10);
const DNA_CO = ['MyHeritage', 'FamilyTreeDNA', 'Ancestry', '23andMe', 'GEDmatch', 'інше'];

async function bootstrap(ctx) {
  const [persons, unions, families, documents, photos, stories, members, revs] = await Promise.all([
    db.list('persons', { eq: { deleted: false } }),
    db.list('unions', { eq: { deleted: false } }),
    db.list('families', { order: 'sort' }),
    db.list('documents', { order: 'sort' }),
    db.list('photos', { eq: { deleted: false }, order: 'created_at' }),
    db.list('stories', { eq: { deleted: false }, order: 'created_at' }),
    db.list('members', { select: 'id,name,role,person_id,active' }),
    db.list('revisions', { eq: { entity: 'person' }, select: 'entity_id,by,at,action', order: 'at', desc: true, limit: 3000 }), // лише 4 поля, без «було/стало» — у рази менше даних
  ]);
  // Запитання: свої — кожному, усі — редакторам і власнику. Якщо таблиці ще немає (міграція 002 не виконана) — порожньо.
  let questions = [], qReady = true;
  try {
    const f = { eq: { deleted: false }, order: 'created_at', desc: true, limit: 2000 };
    if (!can(ctx.member, 'editor')) f.eq.created_by = ctx.member.id;
    questions = (await db.list('questions', f)).map(qOut);
  } catch { qReady = false; }
  const [pend, cfg, jc] = await Promise.all([pendGet(), cfgAll(), joinCfg(false).catch(() => null)]); const isOwn = can(ctx.member, 'owner');
  const photosV = photos.filter(p => !pend[p.id] || isOwn || p.created_by === ctx.member.id); // чужі непідтверджені фото не показуємо
  let joinPending = 0;
  if (can(ctx.member, 'owner')) { try { joinPending = (await db.list('join_requests', { eq: { status: 'pending' }, select: 'id' })).length; } catch {} }
  const last = {};
  for (const r of revs) if (!last[r.entity_id]) last[r.entity_id] = { by: r.by, at: r.at, action: r.action };
  return {
    me: { id: ctx.member.id, name: ctx.member.name, role: ctx.member.role, person_id: ctx.member.person_id || null },
    persons: persons.map(p => ({ id: p.id, ...p.data, v: p.version, last: last[p.id] || null })),
    unions: unions.map(u => ({ id: u.id, a: u.a, b: u.b, date: u.date || '' })),
    families: families.map(f => ({ id: f.id, ...f.data })),
    documents: documents.map(d => ({ id: d.id, ...d.data, pages: (d.data.pages || []).length })),
    photos: photosV.map(p => ({ id: p.id, person: p.person_id, caption: p.caption, mime: p.mime, by: p.created_by, at: p.created_at, ...(pend[p.id] ? { pending: true } : {}) })),
    photoPending: isOwn ? photosV.filter(p => pend[p.id]).length : 0,
    stories: stories.map(s => ({ id: s.id, target: s.target, text: s.text, by: s.created_by, at: s.created_at })),
    names: Object.fromEntries(members.map(m => [m.id, m.name || 'Родич'])),
    accounts: [...new Set(members.filter(m => m.active && m.person_id).map(m => m.person_id))], // у кого вже є доступ — щоб не пропонувати «Запросити»
    questions, qReady, joinPending,
    cfg: { tg: cfg.tg_group?.url || '', photoAsk: cfg.photo_ask || {}, wanted: cfg.wanted || [], dna: cfg.dna_matches || [], places: cfg.places || {}, photoPeople: cfg.photo_people || {}, join: jc?.on && jc?.code ? jc.code : '' },
  };
}

export default handler(async (req, res, ctx, url) => {
  const me = ctx.member;
  if (req.method === 'GET') {
    const tk = url?.searchParams?.get('text'); // великі тексти (історія роду, історія сіл) — окремо, щоб не важчало завантаження
    if (tk) { if (!['history', 'villages', 'hyps'].includes(tk)) return fail(res, 400, 'bad'); const row = await db.get('settings', { eq: { key: 'text:' + tk } }).catch(() => null);
      let text = row?.value || null;
      if (!text) try { // ще не імпортовано — віддаємо одразу з репозиторію
        const it = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'seed/import/manifest.json'), 'utf8')).find(x => x.kind === 'text' && x.id === tk); text = it?.value || null;
      } catch {}
      return send(res, 200, { text }); }
    return send(res, 200, await bootstrap(ctx));
  }
  if (req.method !== 'POST') return fail(res, 405, 'method');

  const body = await readJSON(req, 200_000);
  const op = body.op;
  const editor = can(me, 'editor'), owner = can(me, 'owner');
  const done = (out, target) => { track(me.id, ctx.sid, 'edit', op, target); return send(res, 200, out); };

  /* ── люди ── */
  /* ── спільні налаштування родини ── */
  if (op === 'cfg.tg') { // посилання на групу Telegram — лише власник
    if (!owner) return fail(res, 403, 'forbidden');
    const u = S(body.url, 200);
    if (u && !/^https:\/\/t\.me\/(\+[\w-]{6,}|joinchat\/[\w-]{6,}|[a-zA-Z][\w]{3,})$/.test(u)) return fail(res, 400, 'bad_url');
    const before = await cfgGet('tg_group'); await cfgSet('tg_group', { url: u }, me.id, before);
    return done({ tg: u }, 'cfg:tg');
  }
  if (op === 'photo.ask') { // «Хто на фото?» — редактор позначає фото, на якому треба впізнати людей
    const id = S(body.id, 60); const ph = await db.get('photos', { eq: { id, deleted: false } }); if (!ph) return fail(res, 404, 'not_found');
    if (!editor && !(body.on && ph.created_by === me.id && ph.person_id === '_ask')) return fail(res, 403, 'forbidden'); // родич може попросити впізнати своє щойно завантажене фото
    const before = await cfgGet('photo_ask'), v = { ...before };
    if (body.on) v[id] = { at: new Date().toISOString(), by: me.id, note: S(body.note, 300) }; else delete v[id];
    await cfgSet('photo_ask', v, me.id, before); return done({ photoAsk: v }, 'photo:' + id);
  }
  if (op === 'want.save' || op === 'want.del') { // «Допоможіть знайти»
    if (!editor) return fail(res, 403, 'forbidden');
    const before = await cfgGet('wanted'); let v = Array.isArray(before) ? before.slice() : [];
    const id = S(body.id, 20);
    if (op === 'want.del') v = v.filter(x => x.id !== id);
    else {
      const it = { id: id || rid(), text: S(body.text, 600), person: S(body.person, 60), done: !!body.done, answer: S(body.answer, 600), at: new Date().toISOString(), by: me.id };
      if (!it.text) return fail(res, 400, 'empty');
      const i = v.findIndex(x => x.id === it.id); if (i >= 0) v[i] = { ...v[i], ...it, at: v[i].at, by: v[i].by }; else v.unshift(it);
      v = v.slice(0, 200);
    }
    await cfgSet('wanted', v, me.id, before); return done({ wanted: v }, 'want:' + id);
  }
  if (op === 'dna.save' || op === 'dna.del') { // ДНК-збіги (без самих ДНК-даних)
    if (!editor) return fail(res, 403, 'forbidden');
    const before = await cfgGet('dna_matches'); let v = Array.isArray(before) ? before.slice() : [];
    const id = S(body.id, 20);
    if (op === 'dna.del') v = v.filter(x => x.id !== id);
    else {
      const cm = Number(body.cm);
      const it = { id: id || rid(), name: S(body.name, 120), co: DNA_CO.includes(body.co) ? body.co : 'інше', cm: Number.isFinite(cm) && cm > 0 && cm < 4000 ? Math.round(cm) : null, rel: S(body.rel, 120), tester: S(body.tester, 60), via: S(body.via, 60), where: S(body.where, 120), note: S(body.note, 1000), at: new Date().toISOString() };
      if (!it.name) return fail(res, 400, 'empty');
      const i = v.findIndex(x => x.id === it.id); if (i >= 0) v[i] = { ...v[i], ...it, at: v[i].at }; else v.unshift(it);
      v = v.slice(0, 500);
    }
    await cfgSet('dna_matches', v, me.id, before); return done({ dna: v }, 'dna:' + id);
  }
  if (op === 'place.set') { // координати місця для «Карти роду» — ставить редактор, клацнувши на карті
    if (!editor) return fail(res, 403, 'forbidden');
    const name = S(body.name, 120); if (!name) return fail(res, 400, 'empty');
    const lat = Number(body.lat), lon = Number(body.lon);
    const before = await cfgGet('places'), v = { ...before };
    if (body.clear) delete v[name];
    else { if (!(lat > 30 && lat < 72 && lon > -30 && lon < 180)) return fail(res, 400, 'bad'); v[name] = [Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5]; }
    await cfgSet('places', v, me.id, before); return done({ places: v }, 'place:' + name);
  }

  /* соцмережі: редактор — будь-кому, кожен родич — на своїй картці */
  if (op === 'person.links') {
    const cur = await db.get('persons', { eq: { id: S(body.id, 60) } });
    if (!cur || cur.deleted) return fail(res, 404, 'not_found');
    if (!editor && me.person_id !== cur.id) return fail(res, 403, 'forbidden');
    const links = cleanLinks(body.links);
    const data = { ...cur.data }; if (links.length) data.links = links; else delete data.links;
    if (body.hasOwnProperty('lp')) { const lp = S(body.lp, 160); if (lp) data.lp = lp; else delete data.lp; }
    if (body.hasOwnProperty('dna')) { if (DNA_CO.includes(body.dna)) data.dna = body.dna; else delete data.dna; }
    const [row] = await db.update('persons', { eq: { id: cur.id, version: cur.version } }, { data, version: cur.version + 1, updated_by: me.id, updated_at: new Date().toISOString() });
    if (!row) return fail(res, 409, 'conflict');
    await revision('person', cur.id, 'update', { links: cur.data.links || [], dna: cur.data.dna || '', lp: cur.data.lp || '' }, { links, dna: data.dna || '', lp: data.lp || '' }, me.id);
    return done({ person: { id: row.id, ...row.data, v: row.version, last: { by: me.id, at: row.updated_at, action: 'update' } } }, cur.id);
  }
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
      // поля, яких немає у формі редагування, не губити (джерела, соцмережі)
      for (const k of ['src', 'links', 'dna']) if (cur.data[k] && !body.data.hasOwnProperty(k)) data[k] = cur.data[k];
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

  if (op === 'person.merge') { // дві картки однієї людини → одна: усі зв'язки, фото, спогади, документи, акаунт переходять на «keep»
    if (!owner) return fail(res, 403, 'forbidden');
    const keepId = S(body.keep, 60), dropId = S(body.drop, 60); if (!keepId || !dropId || keepId === dropId) return fail(res, 400, 'bad');
    const keep = await db.get('persons', { eq: { id: keepId, deleted: false } }), drop = await db.get('persons', { eq: { id: dropId, deleted: false } });
    if (!keep || !drop) return fail(res, 404, 'not_found');
    if (drop.data.root) return fail(res, 400, 'root');
    const now = () => new Date().toISOString();
    const up = async (row, nd) => { await db.update('persons', { eq: { id: row.id } }, { data: nd, version: (row.version || 1) + 1, updated_by: me.id, updated_at: now() }); await revision('person', row.id, 'update', row.data, nd, me.id); };
    // 1) порожні поля keep доповнюємо з drop; нотатки зводимо
    const kd = { ...keep.data };
    for (const [k, v] of Object.entries(drop.data)) { if (['root', 'portrait'].includes(k)) continue; if (k === 'note' && v && kd.note && !kd.note.includes(v)) kd.note = kd.note + '\n\n' + v; else if (k === 'fam' && Array.isArray(v)) kd.fam = [...new Set([...(kd.fam || []), ...v])]; else if (v && (kd[k] === undefined || kd[k] === '' || kd[k] === null)) kd[k] = v; }
    if (!kd.portrait && drop.data.portrait) kd.portrait = drop.data.portrait;
    if (kd.f === keepId || kd.f === dropId) kd.f = ''; if (kd.mo === keepId || kd.mo === dropId) kd.mo = '';
    await up(keep, cleanPerson(kd));
    // 2) діти drop → діти keep
    for (const p of await db.list('persons', { eq: { deleted: false } })) {
      if (p.id === keepId || p.id === dropId) continue;
      if (p.data.f === dropId || p.data.mo === dropId) { const nd = { ...p.data }; if (nd.f === dropId) nd.f = keepId; if (nd.mo === dropId) nd.mo = keepId; await up(p, nd); }
    }
    // 3) шлюби (без дублів з тим самим партнером)
    const us = await db.list('unions', { eq: { deleted: false } });
    const partners = new Set(us.filter(u => u.a === keepId || u.b === keepId).map(u => u.a === keepId ? u.b : u.a));
    for (const u of us.filter(u => u.a === dropId || u.b === dropId)) {
      const other = u.a === dropId ? u.b : u.a;
      if (other === keepId || partners.has(other)) { await db.update('unions', { eq: { id: u.id } }, { deleted: true }); await revision('union', u.id, 'delete', u, null, me.id); continue; }
      const nu = { a: u.a === dropId ? keepId : u.a, b: u.b === dropId ? keepId : u.b }; await db.update('unions', { eq: { id: u.id } }, nu); await revision('union', u.id, 'update', u, { ...u, ...nu }, me.id); partners.add(other);
    }
    // 4) фото, спогади, акаунти, заявки, запитання, документи, гілки
    for (const ph of await db.list('photos', { eq: { person_id: dropId } })) { await db.update('photos', { eq: { id: ph.id } }, { person_id: keepId }); await revision('photo', ph.id, 'update', { person_id: dropId }, { person_id: keepId }, me.id); }
    for (const st of await db.list('stories', { eq: { target: dropId } })) { await db.update('stories', { eq: { id: st.id } }, { target: keepId }); await revision('story', st.id, 'update', { target: dropId }, { target: keepId }, me.id); }
    for (const t of ['members', 'join_requests', 'questions', 'invites']) { try { for (const r of await db.list(t, { eq: { person_id: dropId } })) { await db.update(t, { eq: { id: r.id } }, { person_id: keepId }); await revision(t === 'members' ? 'member' : t, r.id, 'update', { person_id: dropId }, { person_id: keepId }, me.id); } } catch {} }
    for (const d of await db.list('documents', {})) { const pp = d.data?.people || []; if (pp.includes(dropId)) { const data = { ...d.data, people: [...new Set(pp.map(x => x === dropId ? keepId : x))] }; await db.update('documents', { eq: { id: d.id } }, { data }); await revision('document', d.id, 'update', d.data, data, me.id); } }
    for (const f of await db.list('families', {})) { const mm = f.data?.members || []; if (mm.includes(dropId)) { const data = { ...f.data, members: [...new Set(mm.map(x => x === dropId ? keepId : x))] }; await db.update('families', { eq: { id: f.id } }, { data }); await revision('family', f.id, 'update', f.data, data, me.id); } }
    // 5) дубль прибираємо
    await db.update('persons', { eq: { id: dropId } }, { deleted: true, updated_by: me.id, updated_at: now() });
    await revision('person', dropId, 'delete', drop.data, { mergedInto: keepId }, me.id);
    return done({ ok: true, keep: keepId }, keepId);
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
  if (op === 'doc.create') { // опис архівного документа без скану; скани додаються потім через /api/upload?doc=<id>
    if (!editor) return fail(res, 403, 'forbidden');
    const id = S(body.id, 60); if (!/^[a-z0-9_-]{2,60}$/.test(id)) return fail(res, 400, 'bad_id');
    if (await db.get('documents', { eq: { id } })) return fail(res, 409, 'exists');
    const people = (Array.isArray(body.people) ? body.people : []).map(x => S(x, 60)).filter(Boolean).slice(0, 40);
    const data = { title: S(body.title, 200) || 'Документ', date: S(body.date, 40), place: S(body.place, 120), src: S(body.src, 400), line: S(body.line, 400), text: S(body.text, 4000), maybe: !!body.maybe, people, pages: [] };
    if (/^https:\/\//.test(S(body.url, 300))) data.url = S(body.url, 300);
    await db.insert('documents', { id, data, sort: 500, updated_by: me.id });
    await revision('document', id, 'create', null, data, me.id);
    return send(res, 200, { ok: true, id });
  }
  if (op === 'doc.delete') { // лише власник; скани у сховищі лишаються, повернути можна з «Історії змін»
    if (!owner) return fail(res, 403, 'forbidden');
    const doc = await db.get('documents', { eq: { id: S(body.id, 60) } }); if (!doc) return fail(res, 404, 'not_found');
    await db.remove('documents', { eq: { id: doc.id } }); await revision('document', doc.id, 'delete', doc.data, null, me.id);
    return done({ ok: true }, doc.id);
  }
  if (op === 'doc.marks') { // рамки «наш запис» на сканах: частки ширини/висоти зображення
    if (!editor) return fail(res, 403, 'forbidden');
    const doc = await db.get('documents', { eq: { id: S(body.id, 60) } }); if (!doc) return fail(res, 404, 'not_found');
    const n = Number(doc.data.pages) || (doc.data.pages?.length) || 0, f = v => Math.round(Math.min(1, Math.max(0, Number(v) || 0)) * 10000) / 10000;
    const marks = (Array.isArray(body.marks) ? body.marks : []).slice(0, 8).map(m => ({ p: Math.max(0, Math.min(n - 1, parseInt(m.p) || 0)), x: f(m.x), y: f(m.y), w: f(m.w), h: f(m.h) })).filter(m => m.w > 0.005 && m.h > 0.003);
    const data = { ...doc.data, marks };
    await db.update('documents', { eq: { id: doc.id } }, { data, updated_by: me.id, updated_at: new Date().toISOString() });
    await revision('document', doc.id, 'update', { marks: doc.data.marks || [] }, { marks }, me.id);
    return done({ ok: true, marks }, 'doc:' + doc.id);
  }
  if (op === 'doc.geoshift') { // підігнати стару карту на сучасній: зсув у «світових» пікселях (зум 0)
    if (!editor) return fail(res, 403, 'forbidden');
    const doc = await db.get('documents', { eq: { id: S(body.id, 60) } }); if (!doc || doc.data.type !== 'map') return fail(res, 404, 'not_found');
    const dx = Number(body.dx), dy = Number(body.dy);
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) return fail(res, 400, 'bad');
    const data = { ...doc.data, shift: [dx, dy] };
    await db.update('documents', { eq: { id: doc.id } }, { data, updated_by: me.id, updated_at: new Date().toISOString() });
    await revision('document', doc.id, 'update', { shift: doc.data.shift || null }, { shift: data.shift }, me.id);
    return done({ ok: true, shift: data.shift }, 'map:' + doc.id);
  }
  if (op === 'doc.page.delete') { // прибрати зайву сторінку зі скану документа (файл лишається в сховищі)
    if (!editor) return fail(res, 403, 'forbidden');
    const doc = await db.get('documents', { eq: { id: S(body.id, 60) } }); if (!doc) return fail(res, 404, 'not_found');
    const pages = [...(doc.data.pages || [])]; const i = Number(body.page);
    if (!Number.isInteger(i) || !pages[i]) return fail(res, 400, 'bad');
    pages.splice(i, 1); const data = { ...doc.data, pages };
    await db.update('documents', { eq: { id: doc.id } }, { data, updated_by: me.id, updated_at: new Date().toISOString() });
    await revision('document', doc.id, 'update', doc.data, data, me.id);
    return send(res, 200, { ok: true, pages: pages.length });
  }
  if (op === 'story.add') {
    const text = S(body.text, 20000), target = S(body.target, 80);
    if (!text || !target) return fail(res, 400, 'empty');
    // підказки «Хто на фото?» і відповіді на «Допоможіть знайти» — може писати кожен родич
    let open = false;
    if (/^photo:/.test(target)) open = !!(await cfgGet('photo_ask'))[target.slice(6)];
    else if (/^want:/.test(target)) open = (await cfgGet('wanted')).some(x => x.id === target.slice(5));
    else if (/^hyp:[\w:.-]{1,70}$/.test(target)) open = true; // «Припущення»: підтвердити, спростувати чи доповнити може кожен родич
    if (!open && !(await canAddTo(me, target))) return fail(res, 403, 'branch');
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
  if (op === 'photo.people') { // хто на фото: позначені люди з дерева (фото з'являється і в їхніх картках)
    const p = await db.get('photos', { eq: { id: S(body.id, 60), deleted: false } }); if (!p) return fail(res, 404, 'not_found');
    if (!editor && p.created_by !== me.id) return fail(res, 403, 'forbidden');
    const ids = [...new Set((Array.isArray(body.people) ? body.people : []).map(x => S(x, 60)).filter(Boolean))].slice(0, 40);
    const ok = new Set((await db.list('persons', { eq: { deleted: false }, select: 'id' })).map(x => x.id));
    const keep = ids.filter(x => ok.has(x) && x !== p.person_id);
    const before = await cfgGet('photo_people'), v = { ...before };
    if (keep.length) v[p.id] = keep; else delete v[p.id];
    await cfgSet('photo_people', v, me.id, before); return done({ photoPeople: v }, 'photo:' + p.id);
  }
  if (op === 'photo.caption') {
    const p = await db.get('photos', { eq: { id: S(body.id, 60), deleted: false } }); if (!p) return fail(res, 404, 'not_found');
    if (!editor && p.created_by !== me.id) return fail(res, 403, 'forbidden');
    await db.update('photos', { eq: { id: p.id } }, { caption: S(body.caption, 500) }); await revision('photo', p.id, 'update', { caption: p.caption }, { caption: S(body.caption, 500) }, me.id);
    return done({ ok: true }, p.person_id);
  }
  if (op === 'photo.delete') {
    const p = await db.get('photos', { eq: { id: S(body.id, 60), deleted: false } }); if (!p) return fail(res, 404, 'not_found');
    if (!owner && p.created_by !== me.id) return fail(res, 403, 'forbidden');
    await db.update('photos', { eq: { id: p.id } }, { deleted: true }); await revision('photo', p.id, 'delete', p, null, me.id); { const pd = await pendGet(); if (pd[p.id]) { delete pd[p.id]; await pendSet(pd, me.id); } }
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

  /* ── запитання й уточнення ── */
  if (op === 'q.add') {
    const kind = QK.includes(body.kind) ? body.kind : 'ask';
    const text = S(body.text, 5000), about = S(body.about, 300);
    let person = S(body.person, 60);
    if (!text) return fail(res, 400, 'empty');
    if (person && !(await db.get('persons', { eq: { id: person, deleted: false } }))) person = '';
    if (kind === 'find' && !about && !person) return fail(res, 400, 'about');
    const open = await db.list('questions', { eq: { created_by: me.id, status: 'new', deleted: false }, limit: 60 });
    if (open.length >= 50) return fail(res, 429, 'too_many_q');
    const now = new Date().toISOString();
    const [q] = await db.insert('questions', { kind, person_id: person || null, about, text, status: 'new', answer: '', deleted: false, created_by: me.id, created_at: now, updated_at: now });
    await revision('question', q.id, 'create', null, { kind, person, about, text }, me.id);
    return done({ question: qOut(q) }, person || 'q:' + q.id);
  }
  if (op === 'q.update') {
    const q = await db.get('questions', { eq: { id: S(body.id, 60), deleted: false } }); if (!q) return fail(res, 404, 'not_found');
    const patch = {};
    if (editor) {
      if (body.status !== undefined) { if (!QS.includes(body.status)) return fail(res, 400, 'bad'); patch.status = body.status; }
      if (body.answer !== undefined) patch.answer = S(body.answer, 8000);
    }
    if (q.created_by === me.id && q.status === 'new' && body.text !== undefined) { const t = S(body.text, 5000); if (!t) return fail(res, 400, 'empty'); patch.text = t; }
    if (!Object.keys(patch).length) return fail(res, 403, 'forbidden');
    Object.assign(patch, { updated_by: me.id, updated_at: new Date().toISOString() });
    const [row] = await db.update('questions', { eq: { id: q.id } }, patch);
    const pick = x => ({ status: x.status, answer: x.answer, text: x.text });
    await revision('question', q.id, 'update', pick(q), pick(row), me.id);
    return done({ question: qOut(row) }, 'q:' + q.id);
  }
  if (op === 'q.delete') {
    const q = await db.get('questions', { eq: { id: S(body.id, 60), deleted: false } }); if (!q) return fail(res, 404, 'not_found');
    if (!owner && !(q.created_by === me.id && q.status === 'new')) return fail(res, 403, 'forbidden');
    await db.update('questions', { eq: { id: q.id } }, { deleted: true, updated_by: me.id, updated_at: new Date().toISOString() });
    await revision('question', q.id, 'delete', { kind: q.kind, text: q.text, about: q.about }, null, me.id);
    return done({ ok: true }, 'q:' + q.id);
  }

  return fail(res, 400, 'unknown_op');
});
