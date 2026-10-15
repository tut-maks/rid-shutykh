// Панель власника: доступи, аналітика, історія змін і відкат. Лише роль owner.
// /api/admin?a=members|invite|reset|member|revoke|stats|log|revisions|revert
import { db } from './_db.js';
import { findDupes } from './_merge.js';
import { handler, send, fail, readJSON, sha, token, revision, joinCfg, cleanPerson, slugId, hashPass, pendGet, pendSet } from './_lib.js';

const day = 864e5;
const iso = d => new Date(d).toISOString();
const S = (v, n) => String(v ?? '').slice(0, n).trim();

function period(url) {
  const to = url.searchParams.get('to') ? new Date(url.searchParams.get('to')) : new Date();
  const from = url.searchParams.get('from') ? new Date(url.searchParams.get('from')) : new Date(to.getTime() - 30 * day);
  return { from, to };
}
function aggregate(events, revs) {
  const per = {};
  const P = id => (per[id] ||= { time: 0, opens: 0, views: 0, logins: 0, edits: 0, sessions: new Set(), days: new Set(), last: null });
  for (const e of events) {
    const x = P(e.member_id);
    if (e.type === 'beat') x.time += e.ms || 0;
    if (e.type === 'open') x.opens++;
    if (e.type === 'view') x.views++;
    if (e.type === 'login') x.logins++;
    if (e.session) x.sessions.add(e.session);
    x.days.add(String(e.at).slice(0, 10));
    if (!x.last || e.at > x.last) x.last = e.at;
  }
  for (const r of revs) if (r.by) P(r.by).edits++;
  return Object.fromEntries(Object.entries(per).map(([k, v]) => [k, { ...v, sessions: v.sessions.size, days: v.days.size }]));
}


/* Діти з анкети → картки під людиною (після підтвердження власника). Повтори (те саме ім'я в тієї ж людини) пропускаються. */
async function addKids(pid, kids, by) {
  const par = await db.get('persons', { eq: { id: pid, deleted: false } }); if (!par) return [];
  const all = await db.list('persons', { eq: { deleted: false } });
  const us = await db.list('unions', { eq: { deleted: false } });
  const sps = us.filter(u => u.a === pid || u.b === pid).map(u => u.a === pid ? u.b : u.a);
  const other = sps.length === 1 ? sps[0] : '';
  const isF = par.data.sex === 'f';
  const low = t => String(t || '').toLowerCase().replace(/\s*\(.*\)/, '').trim().split(/\s+/)[0] || ''; // лише ім'я: «Василина Леонідівна» = «Василина»
  const made = [];
  for (const k of (Array.isArray(kids) ? kids : []).slice(0, 12)) {
    let n = S(k.n, 60), pt = S(k.pt, 60); if (!n) continue;
    let ks = S(k.s, 60);
    if (!pt && /\s/.test(n)) { const w = n.split(/\s+/), isPt = x => /(вич|ич|вна|івна|ївна)$/i.test(x || '');
      if (w.length >= 3 && isPt(w[2])) { ks = ks || w[0]; n = w[1]; pt = w.slice(2).join(' '); } // «Прізвище Ім'я По батькові»
      else if (isPt(w[1])) { n = w[0]; pt = w.slice(1).join(' '); } // «Ім'я По батькові»
      else if (w.length === 2) { ks = ks || w[0]; n = w[1]; } } // «Прізвище Ім'я»
    // така дитина вже є в дереві (у цього з батьків або в його чоловіка/дружини) — не дублюємо
    if (all.some(p => [pid, other].filter(Boolean).some(x => p.data.f === x || p.data.mo === x) && low(p.data.n) === low(n))) continue;
    const sex = k.sex === 'f' ? 'f' : k.sex === 'm' ? 'm' : /[ая]$/i.test(n.split(' ')[0]) ? 'f' : 'm';
    const data = cleanPerson({ n, s: ks || par.data.s || '', pt, b: S(k.b, 40), sex, f: isF ? other : pid, mo: isF ? pid : other, fam: par.data.fam || [], note: 'Додано з анкети реєстрації (підтвердив власник).' });
    const id = slugId(); await db.insert('persons', { id, data, created_by: by, updated_by: by }); await revision('person', id, 'create', null, data, by);
    made.push(id); all.push({ id, data });
  }
  return made;
}

/* Рідні з анкети: rel = {F, MO, FF, FM, MF, MM} — кожне {id} (уже є в дереві) або {make:{s,n,pt,m,b}} (нова картка).
   Спершу діди, потім батьки (прив'язані до дідів), подружні пари з'єднуються. Наявним карткам лише доповнюємо порожніх батьків. */
async function relMake(rel, by) {
  const made = [], R = {};
  const get = async id => id ? await db.get('persons', { eq: { id: S(id, 60), deleted: false } }) : null;
  const one = async (k, sex, f, mo) => {
    const x = rel && typeof rel === 'object' ? rel[k] : null; if (!x) return '';
    if (x.id) {
      const p = await get(x.id); if (!p) return '';
      const set = {}; if (f && !p.data.f) set.f = f; if (mo && !p.data.mo) set.mo = mo;
      if (Object.keys(set).length) { const data = { ...p.data, ...set }; await db.update('persons', { eq: { id: p.id } }, { data, updated_by: by }); await revision('person', p.id, 'update', p.data, data, by); }
      return p.id;
    }
    if (!x.make) return '';
    const m = x.make, rp = await get(f || mo);
    const data = cleanPerson({ s: S(m.s, 60), n: S(m.n, 60), pt: S(m.pt, 60), m: S(m.m, 60), b: S(m.b, 40), sex, f, mo, fam: rp?.data?.fam || [], note: 'Додано з анкети реєстрації (підтвердив власник).' });
    if (!data.n) return '';
    const dd = await findDupes(data); if (dd.length === 1) return dd[0].id;
    const id = slugId(); await db.insert('persons', { id, data, created_by: by, updated_by: by }); await revision('person', id, 'create', null, data, by); made.push(id); return id;
  };
  R.FF = await one('FF', 'm'); R.FM = await one('FM', 'f'); R.MF = await one('MF', 'm'); R.MM = await one('MM', 'f');
  R.F = await one('F', 'm', R.FF, R.FM); R.MO = await one('MO', 'f', R.MF, R.MM);
  const us = await db.list('unions', { eq: { deleted: false } });
  for (const [a, b] of [[R.FF, R.FM], [R.MF, R.MM], [R.F, R.MO]]) {
    if (!a || !b || us.some(u => (u.a === a && u.b === b) || (u.a === b && u.b === a))) continue;
    const u = { id: 'u_' + slugId().replace(/^p_/, ''), a, b, date: '', created_by: by }; await db.insert('unions', u); await revision('union', u.id, 'create', null, u, by); us.push(u);
  }
  return { f: R.F, mo: R.MO, made };
}
async function linkParents(pid, rel, by) { // прив'язати картку до батьків з rel (лише порожні поля)
  const rr = await relMake(rel, by); const p = await db.get('persons', { eq: { id: pid, deleted: false } }); if (!p) return rr;
  const set = {}; if (rr.f && !p.data.f && rr.f !== pid) set.f = rr.f; if (rr.mo && !p.data.mo && rr.mo !== pid) set.mo = rr.mo;
  if (Object.keys(set).length) { const data = { ...p.data, ...set }; if (!(data.fam || []).length) { const pp = await db.get('persons', { eq: { id: set.f || set.mo } }); if (pp?.data?.fam?.length) data.fam = pp.data.fam; } await db.update('persons', { eq: { id: pid } }, { data, updated_by: by }); await revision('person', pid, 'update', p.data, data, by); }
  return rr;
}

export default handler(async (req, res, ctx, url) => {
  const a = url.searchParams.get('a');
  const me = ctx.member;

  /* ── Посилання для реєстрації й заявки ── */
  // Фото від родичів, що чекають підтвердження: GET ?a=photos_pending · POST ?a=photo_ok {id, ok}
  if (a === 'photos_pending') {
    const pd = await pendGet(); const ids = Object.keys(pd); if (!ids.length) return send(res, 200, { photos: [] });
    const rows = await db.list('photos', { in: { id: ids }, eq: { deleted: false } });
    const mem = await db.list('members', { select: 'id,name' }); const nm = Object.fromEntries(mem.map(m => [m.id, m.name || 'Родич']));
    return send(res, 200, { photos: rows.map(p => ({ id: p.id, person: p.person_id, caption: p.caption, mime: p.mime, by: nm[p.created_by] || 'Родич', at: p.created_at })) });
  }
  if (a === 'photo_ok') {
    const body = await readJSON(req, 2000); const id = String(body.id || '').slice(0, 60);
    const pd = await pendGet(); if (!pd[id]) return fail(res, 404, 'not_found');
    const p = await db.get('photos', { eq: { id } }); delete pd[id]; await pendSet(pd, ctx.member.id);
    if (!p) return send(res, 200, { ok: true });
    if (body.ok) {
      await revision('photo', id, 'approve', null, { person_id: p.person_id }, ctx.member.id);
      const person = await db.get('persons', { eq: { id: p.person_id, deleted: false } });
      if (person && !person.data.portrait && p.mime !== 'application/pdf') await db.update('persons', { eq: { id: person.id } }, { data: { ...person.data, portrait: id }, version: person.version + 1, updated_by: ctx.member.id, updated_at: new Date().toISOString() });
    } else { await db.update('photos', { eq: { id } }, { deleted: true }); await revision('photo', id, 'delete', p, null, ctx.member.id); }
    return send(res, 200, { ok: true });
  }
  if (a === 'join_link') {
    if (req.method === 'POST') {
      const b = await readJSON(req, 2_000); const cur = (await joinCfg(true, me.id));
      const value = b.do === 'rotate' ? { code: token(9), on: true } : { ...cur, on: b.do === 'on' };
      await db.upsert('settings', { key: 'join', value, updated_by: me.id, updated_at: iso(Date.now()) });
      await revision('setting', 'join', 'update', { on: cur.on }, { on: value.on, rotated: b.do === 'rotate' }, me.id);
      return send(res, 200, value);
    }
    return send(res, 200, await joinCfg(true, me.id));
  }
  if (a === 'requests') {
    const rows = await db.list('join_requests', { order: 'created_at', desc: true, limit: 300 });
    return send(res, 200, { requests: rows.map(r => ({ id: r.id, email: r.email, name: r.name, data: r.data, status: r.status, at: r.created_at, decided_at: r.decided_at, decided_by: r.decided_by, person_id: r.person_id, member_id: r.member_id })) });
  }
  if ((a === 'approve' || a === 'reject') && req.method === 'POST') {
    const b = await readJSON(req, 20_000);
    const r = await db.get('join_requests', { eq: { id: S(b.id, 60) } });
    if (!r || r.status !== 'pending') return fail(res, 404, 'not_found');
    const now = iso(Date.now());
    if (a === 'reject') {
      await db.update('join_requests', { eq: { id: r.id } }, { status: 'rejected', decided_by: me.id, decided_at: now });
      await revision('join', r.id, 'update', { status: 'pending' }, { status: 'rejected', email: r.email, name: r.name }, me.id);
      return send(res, 200, { ok: true });
    }
    if (await db.get('members', { eq: { email: r.email } })) return fail(res, 409, 'exists');
    const role = b.role === 'editor' ? 'editor' : 'viewer';
    let pid = S(b.person_id, 60);
    if (pid && !(await db.get('persons', { eq: { id: pid, deleted: false } }))) return fail(res, 400, 'bad_person');
    if (!pid && b.create) {
      // нова картка з даних заявки, одразу прив'язана до батьків (і подружжя), яких обрав власник
      const d = r.data || {}, c = b.create || {};
      const ok = async id => id && (await db.get('persons', { eq: { id: S(id, 60), deleted: false } })) ? S(id, 60) : '';
      const rr = b.rel ? await relMake(b.rel, me.id) : {};
      const f = await ok(c.f) || rr.f || '', mo = await ok(c.mo) || rr.mo || '', sp = await ok(c.spouse);
      const par = f ? await db.get('persons', { eq: { id: f } }) : mo ? await db.get('persons', { eq: { id: mo } }) : null;
      const data = cleanPerson({ n: d.n, pt: d.pt, s: d.s, m: d.m, sex: d.sex, b: d.b, bp: d.bp, f, mo, fam: par?.data?.fam || [], note: '' });
      const dd = await findDupes(data); // ця людина вже є в дереві — прив'язуємо до наявної картки, нову не створюємо
      if (dd.length === 1) pid = dd[0].id;
      else { pid = slugId();
      await db.insert('persons', { id: pid, data, created_by: me.id, updated_by: me.id });
      await revision('person', pid, 'create', null, data, me.id); }
      if (sp && !dd.length) { const u = { id: 'u_' + pid, a: sp, b: pid, date: '', created_by: me.id }; await db.insert('unions', u); await revision('union', u.id, 'create', null, u, me.id); }
    }
    const [m] = await db.insert('members', { email: r.email, name: r.name, role, person_id: pid || null, pass_hash: r.pass_hash, created_by: me.id });
    await revision('member', m.id, 'create', null, { email: m.email, role: m.role, name: m.name, from: 'join' }, me.id);
    await db.update('join_requests', { eq: { id: r.id } }, { status: 'approved', decided_by: me.id, decided_at: now, member_id: m.id, person_id: pid || null });
    if (pid && b.person_id && b.rel) await linkParents(pid, b.rel, me.id);
    const kids = pid ? await addKids(pid, b.kids, me.id) : [];
    return send(res, 200, { ok: true, person_id: pid || null, kids: kids.length });
  }
  if (a === 'parents' && req.method === 'POST') { // батьки й діди з уже прийнятої заявки
    const b = await readJSON(req, 20_000);
    const r = await db.get('join_requests', { eq: { id: S(b.id, 60) } });
    if (!r || r.status !== 'approved' || !r.person_id) return fail(res, 404, 'not_found');
    const rr = await linkParents(r.person_id, b.rel, me.id);
    return send(res, 200, { ok: true, made: rr.made.length });
  }
  if (a === 'kids' && req.method === 'POST') { // діти з уже прийнятої заявки
    const b = await readJSON(req, 20_000);
    const r = await db.get('join_requests', { eq: { id: S(b.id, 60) } });
    if (!r || r.status !== 'approved' || !r.person_id) return fail(res, 404, 'not_found');
    const kids = await addKids(r.person_id, b.kids, me.id);
    return send(res, 200, { ok: true, kids: kids.length });
  }

  if (a === 'members') {
    const [members, invites, sessions] = await Promise.all([
      db.list('members', { order: 'created_at' }),
      db.list('invites', { order: 'created_at', desc: true, limit: 200 }),
      db.list('sessions', { eq: { revoked: false }, gte: { expires_at: iso(Date.now()) } }),
    ]);
    const act = {}; for (const s of sessions) { const x = (act[s.member_id] ||= { n: 0, last: null, devices: [] }); x.n++; if (!x.last || s.last_seen > x.last) x.last = s.last_seen; x.devices.push({ k: String(s.token_hash).slice(0, 16), cur: s.token_hash === ctx.sid, ua: s.ua, ip: s.ip, last: s.last_seen, created: s.created_at }); }
    for (const x of Object.values(act)) x.devices.sort((a, b) => String(b.last).localeCompare(String(a.last)));
    return send(res, 200, {
      members: members.filter(m => !String(m.email).endsWith('@deleted.local')).map(m => ({ id: m.id, email: m.email, name: m.name, role: m.role, person_id: m.person_id, active: m.active, created_at: m.created_at, hasPass: !!m.pass_hash, sessions: act[m.id] || { n: 0, last: null, devices: [] } })),
      deleted: members.filter(m => String(m.email).endsWith('@deleted.local')).length,
      invites: invites.filter(i => !i.used_at && new Date(i.expires_at) > new Date()).map(i => ({ email: i.email, name: i.name, role: i.role, purpose: i.purpose, expires_at: i.expires_at, created_at: i.created_at })),
    });
  }

  if ((a === 'invite' || a === 'reset') && req.method === 'POST') {
    const b = await readJSON(req, 10_000);
    let email, name, role, person_id = null, purpose = a;
    if (a === 'reset') {
      const m = await db.get('members', { eq: { id: S(b.member_id, 60) } }); if (!m) return fail(res, 404, 'not_found');
      email = m.email; name = m.name; role = m.role === 'owner' ? 'editor' : m.role;
    } else {
      email = S(b.email, 200).toLowerCase(); name = S(b.name, 80); role = b.role === 'editor' ? 'editor' : 'viewer'; person_id = S(b.person_id, 60) || null;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && !/^[a-z0-9а-яіїєґ'][a-z0-9а-яіїєґ'._-]{2,31}$/.test(email)) return fail(res, 400, 'email'); // пошта або простий логін (для тих, у кого пошти немає)
      const ex = await db.get('members', { eq: { email } }); if (ex) return fail(res, 409, 'exists');
    }
    const t = token(32);
    await db.insert('invites', { token_hash: sha(t), email, name, role, person_id, purpose, created_by: me.id, expires_at: iso(Date.now() + 7 * day) });
    await revision('member', email, a === 'reset' ? 'reset' : 'invite', null, { email, role, name }, me.id);
    const origin = `https://${req.headers.host}`;
    return send(res, 200, { link: `${origin}/?invite=${t}`, expires_at: iso(Date.now() + 7 * day) });
  }

  if (a === 'create' && req.method === 'POST') { // власник одразу створює акаунт з логіном і паролем (для тих, хто без пошти)
    const b = await readJSON(req, 10_000);
    const login = S(b.login, 200).toLowerCase(), name = S(b.name, 80), role = b.role === 'editor' ? 'editor' : 'viewer', person_id = S(b.person_id, 60) || null;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(login) && !/^[a-z0-9а-яіїєґ'][a-z0-9а-яіїєґ'._-]{2,31}$/.test(login)) return fail(res, 400, 'email');
    if (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 200) return fail(res, 400, 'weak');
    if (await db.get('members', { eq: { email: login } })) return fail(res, 409, 'exists');
    const [m] = await db.insert('members', { email: login, name, role, person_id, pass_hash: hashPass(b.password), created_by: me.id });
    await revision('member', m.id, 'create', null, { email: login, role, name, person_id }, me.id);
    return send(res, 200, { ok: true, id: m.id });
  }
  if (a === 'member' && req.method === 'POST') {
    const b = await readJSON(req, 10_000);
    const m = await db.get('members', { eq: { id: S(b.id, 60) } }); if (!m) return fail(res, 404, 'not_found');
    if (m.id === me.id && (b.role && b.role !== 'owner' || b.active === false)) return fail(res, 400, 'self');
    const patch = {};
    if (['owner', 'editor', 'viewer'].includes(b.role)) patch.role = b.role;
    if (typeof b.active === 'boolean') patch.active = b.active;
    if (typeof b.name === 'string') patch.name = S(b.name, 80);
    if (typeof b.person_id === 'string') patch.person_id = S(b.person_id, 60) || null;
    if (typeof b.login === 'string' && S(b.login, 200).toLowerCase() !== m.email) { // змінити логін (пошту)
      const l = S(b.login, 200).toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(l) && !/^[a-z0-9а-яіїєґ'][a-z0-9а-яіїєґ'._-]{2,31}$/.test(l)) return fail(res, 400, 'email');
      if (await db.get('members', { eq: { email: l } })) return fail(res, 409, 'exists');
      patch.email = l;
    }
    let passChanged = false;
    if (typeof b.password === 'string' && b.password) { // власник задає новий пароль (людина забула) — старі входи закриваються
      if (m.id === me.id) return fail(res, 400, 'self');
      if (b.password.length < 8 || b.password.length > 200) return fail(res, 400, 'weak');
      patch.pass_hash = hashPass(b.password); passChanged = true;
    }
    const [row] = await db.update('members', { eq: { id: m.id } }, patch);
    if (patch.active === false || passChanged) await db.update('sessions', { eq: { member_id: m.id } }, { revoked: true });
    await revision('member', m.id, 'update', { role: m.role, active: m.active, name: m.name, email: m.email, person_id: m.person_id }, { role: row.role, active: row.active, name: row.name, email: row.email, person_id: row.person_id, ...(passChanged ? { password: 'змінено власником' } : {}) }, me.id);
    return send(res, 200, { ok: true });
  }

  // Видалити акаунт: вхід неможливий назавжди (пароль стерто, пошту звільнено), усі сеанси й запрошення — анульовано.
  // Спогади й запитання людини лишаються в архіві з її ім'ям. Власника видалити не можна — спершу змініть права.
  if (a === 'delete' && req.method === 'POST') {
    const b = await readJSON(req, 10_000);
    const m = await db.get('members', { eq: { id: S(b.id, 60) } }); if (!m) return fail(res, 404, 'not_found');
    if (m.id === me.id || m.role === 'owner') return fail(res, 400, 'owner');
    const patch = { active: false, pass_hash: null, email: `deleted-${m.id}@deleted.local`, name: (m.name || 'Родич') + ' (видалено)' };
    await db.update('members', { eq: { id: m.id } }, patch);
    await db.update('sessions', { eq: { member_id: m.id } }, { revoked: true });
    await db.remove('invites', { eq: { email: m.email } }).catch(() => {});
    await revision('member', m.id, 'delete', { email: m.email, name: m.name, role: m.role, active: m.active }, { name: patch.name, active: false }, me.id);
    return send(res, 200, { ok: true });
  }

  if (a === 'revoke' && req.method === 'POST') {
    const b = await readJSON(req, 10_000); const mid = S(b.member_id, 60);
    if (b.k || b.others) { // один пристрій, або всі, крім цього (свій акаунт)
      const ss = await db.list('sessions', { eq: { member_id: mid, revoked: false } }); let n = 0;
      for (const x of ss) {
        if (x.token_hash === ctx.sid) continue; // поточний сеанс власника не закриваємо
        if (b.k && !String(x.token_hash).startsWith(S(b.k, 16))) continue;
        await db.update('sessions', { eq: { token_hash: x.token_hash } }, { revoked: true }); n++;
      }
      await revision('member', mid, 'update', null, { sessionsClosed: n }, me.id);
      return send(res, 200, { ok: true, n });
    }
    await db.update('sessions', { eq: { member_id: mid } }, { revoked: true });
    return send(res, 200, { ok: true });
  }

  if (a === 'stats') {
    const { from, to } = period(url);
    const len = to - from; const pFrom = new Date(from - len);
    const [events, prevEvents, revs, prevRevs, members, persons, docs] = await Promise.all([
      db.list('events', { gte: { at: iso(from) }, lt: { at: iso(to) }, order: 'id', limit: 200000 }),
      db.list('events', { gte: { at: iso(pFrom) }, lt: { at: iso(from) }, order: 'id', limit: 200000 }),
      db.list('revisions', { gte: { at: iso(from) }, lt: { at: iso(to) }, order: 'id', limit: 50000 }),
      db.list('revisions', { gte: { at: iso(pFrom) }, lt: { at: iso(from) }, order: 'id', limit: 50000 }),
      db.list('members', { select: 'id,name,role,active' }),
      db.list('persons', { select: 'id,data' }),
      db.list('documents', { select: 'id,data' }),
    ]);
    const cur = aggregate(events, revs), prev = aggregate(prevEvents, prevRevs);
    // що дивилися: відкриття + час на картці
    const top = {};
    const T = k => (top[k] ||= { opens: 0, time: 0, people: new Set() });
    for (const e of events) {
      if (!e.target) continue;
      if (e.type === 'open') { const x = T(e.target); x.opens++; x.people.add(e.member_id); }
      if (e.type === 'beat' && (e.view === 'person' || e.view === 'family' || e.view === 'doc')) { T(e.target).time += e.ms || 0; }
    }
    const pname = Object.fromEntries(persons.map(p => [p.id, [p.data.n, p.data.s].filter(Boolean).join(' ')]));
    const dname = Object.fromEntries(docs.map(d => [d.id, d.data.title]));
    const label = k => k.startsWith('person:') ? pname[k.slice(7)] || k : k.startsWith('doc:') ? dname[k.slice(4)] || k : k.startsWith('fam:') ? 'Родина: ' + k.slice(4) : k.startsWith('photo:') ? 'Фото' : k;
    const topList = Object.entries(top).map(([k, v]) => ({ key: k, label: label(k), opens: v.opens, time: v.time, people: v.people.size })).sort((x, y) => y.time + y.opens * 30000 - (x.time + x.opens * 30000)).slice(0, 50);
    // час по днях
    const daily = {};
    for (const e of events) if (e.type === 'beat') { const d = String(e.at).slice(0, 10); (daily[d] ||= {})[e.member_id] = ((daily[d] ||= {})[e.member_id] || 0) + e.ms; }
    // розділи
    const views = {}; for (const e of events) if (e.type === 'beat') views[e.view || '—'] = (views[e.view || '—'] || 0) + e.ms;
    return send(res, 200, { from: iso(from), to: iso(to), members, cur, prev, top: topList, daily, views });
  }

  if (a === 'log') {
    const id = S(url.searchParams.get('id'), 60); const { from, to } = period(url);
    const [events, revs] = await Promise.all([
      db.list('events', { eq: { member_id: id }, gte: { at: iso(from) }, lt: { at: iso(to) }, order: 'id', desc: true, limit: 3000 }),
      db.list('revisions', { eq: { by: id }, gte: { at: iso(from) }, lt: { at: iso(to) }, order: 'id', desc: true, limit: 1000 }),
    ]);
    return send(res, 200, { events, revisions: revs });
  }

  if (a === 'revisions') {
    const entity = S(url.searchParams.get('entity'), 20), eid = S(url.searchParams.get('id'), 80);
    const f = { order: 'at', desc: true, limit: 500 }; if (entity) f.eq = { entity, ...(eid ? { entity_id: eid } : {}) };
    return send(res, 200, { revisions: await db.list('revisions', f) });
  }

  if (a === 'revert' && req.method === 'POST') {
    const b = await readJSON(req, 10_000);
    const r = (await db.list('revisions', { eq: { id: Number(b.id) || b.id }, limit: 1 }))[0];
    if (!r) return fail(res, 404, 'not_found');
    const now = new Date().toISOString();
    if (r.entity === 'person') {
      const cur = await db.get('persons', { eq: { id: r.entity_id } });
      if (r.action === 'create') { if (cur) await db.update('persons', { eq: { id: cur.id } }, { deleted: true, updated_by: me.id, updated_at: now }); }
      else if (cur && r.before) await db.update('persons', { eq: { id: cur.id } }, { data: r.before, deleted: false, version: cur.version + 1, updated_by: me.id, updated_at: now });
      await revision('person', r.entity_id, 'restore', cur?.data || null, r.action === 'create' ? null : r.before, me.id);
    } else if (r.entity === 'family' && r.before) {
      await db.update('families', { eq: { id: r.entity_id } }, { data: r.before, updated_by: me.id, updated_at: now });
      await revision('family', r.entity_id, 'restore', r.after, r.before, me.id);
    } else if (r.entity === 'union' && r.action === 'update') { // повернути попередню дату шлюбу
      await db.update('unions', { eq: { id: r.entity_id } }, { date: r.before?.date || '' });
      await revision('union', r.entity_id, 'restore', r.after, r.before, me.id);
    } else if (['union', 'story', 'photo'].includes(r.entity)) {
      const table = { union: 'unions', story: 'stories', photo: 'photos' }[r.entity];
      await db.update(table, { eq: { id: r.entity_id } }, { deleted: r.action === 'create' });
      await revision(r.entity, r.entity_id, 'restore', null, { deleted: r.action === 'create' }, me.id);
    } else return fail(res, 400, 'cannot');
    return send(res, 200, { ok: true });
  }

  return fail(res, 404, 'unknown');
}, { role: 'owner' });
