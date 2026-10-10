// Вхід / вихід / запрошення. /api/auth?a=me|login|logout|invite|accept|password
import { db } from './_db.js';
import { handler, send, fail, readJSON, sha, hashPass, checkPass, createSession, setSessionCookie, who, cookies, clientIp, tooMany, attempt, track, revision } from './_lib.js';

const pub = m => ({ id: m.id, name: m.name, email: m.email, role: m.role, person_id: m.person_id || null });
const normEmail = e => String(e || '').trim().toLowerCase().slice(0, 200);
const strong = p => typeof p === 'string' && p.length >= 8 && p.length <= 200;

export default handler(async (req, res, _ctx, url) => {
  const a = url.searchParams.get('a');

  if (a === 'me') {
    const ctx = await who(req);
    if (!ctx) return fail(res, 401, 'auth');
    return send(res, 200, { member: pub(ctx.member) });
  }

  if (a === 'login' && req.method === 'POST') {
    const { email, password } = await readJSON(req, 10_000);
    const e = normEmail(email); const ip = clientIp(req);
    if (await tooMany('login:' + e, 8, 15) || await tooMany('ip:' + ip, 30, 15)) return fail(res, 429, 'too_many');
    const m = e ? await db.get('members', { eq: { email: e } }) : null;
    if (!m || !m.active || !m.pass_hash || !checkPass(password, m.pass_hash)) {
      await attempt('login:' + e); await attempt('ip:' + ip);
      return fail(res, 401, 'wrong');
    }
    const sid = await createSession(res, req, m);
    track(m.id, sid, 'login');
    return send(res, 200, { member: pub(m) });
  }

  if (a === 'logout' && req.method === 'POST') {
    const t = Object.entries(cookies(req)).find(([k]) => k.endsWith('rs_sid'))?.[1];
    if (t) await db.update('sessions', { eq: { token_hash: sha(t) } }, { revoked: true });
    setSessionCookie(res, '', 0);
    return send(res, 200, { ok: true });
  }

  if (a === 'invite') {
    const t = url.searchParams.get('t') || '';
    if (await tooMany('ip:' + clientIp(req), 30, 15)) return fail(res, 429, 'too_many');
    const inv = t.length > 20 ? await db.get('invites', { eq: { token_hash: sha(t) } }) : null;
    if (!inv || inv.used_at || new Date(inv.expires_at) < new Date()) { await attempt('ip:' + clientIp(req)); return fail(res, 404, 'invalid'); }
    return send(res, 200, { email: inv.email, name: inv.name, purpose: inv.purpose });
  }

  if (a === 'accept' && req.method === 'POST') {
    const { t, name, password } = await readJSON(req, 10_000);
    if (await tooMany('ip:' + clientIp(req), 30, 15)) return fail(res, 429, 'too_many');
    const inv = String(t || '').length > 20 ? await db.get('invites', { eq: { token_hash: sha(t) } }) : null;
    if (!inv || inv.used_at || new Date(inv.expires_at) < new Date()) { await attempt('ip:' + clientIp(req)); return fail(res, 404, 'invalid'); }
    if (!strong(password)) return fail(res, 400, 'weak');
    const used = await db.update('invites', { eq: { token_hash: inv.token_hash } }, { used_at: new Date().toISOString() });
    if (!used.length) return fail(res, 404, 'invalid');
    let m = await db.get('members', { eq: { email: inv.email } });
    const nm = String(name || inv.name || '').trim().slice(0, 80);
    if (m) {
      [m] = await db.update('members', { eq: { id: m.id } }, { pass_hash: hashPass(password), active: true, ...(nm ? { name: nm } : {}) });
    } else {
      [m] = await db.insert('members', { email: inv.email, name: nm, role: inv.role, person_id: inv.person_id || null, pass_hash: hashPass(password), created_by: inv.created_by });
      revision('member', m.id, 'create', null, { email: m.email, role: m.role, name: m.name }, m.id);
    }
    // скидання пароля — закриваємо всі старі сесії
    if (inv.purpose === 'reset') await db.update('sessions', { eq: { member_id: m.id } }, { revoked: true });
    const sid = await createSession(res, req, m);
    track(m.id, sid, 'login');
    return send(res, 200, { member: pub(m) });
  }

  if (a === 'password' && req.method === 'POST') {
    const ctx = await who(req); if (!ctx) return fail(res, 401, 'auth');
    const { old, password } = await readJSON(req, 10_000);
    if (!checkPass(old, ctx.member.pass_hash)) return fail(res, 401, 'wrong');
    if (!strong(password)) return fail(res, 400, 'weak');
    await db.update('members', { eq: { id: ctx.member.id } }, { pass_hash: hashPass(password) });
    return send(res, 200, { ok: true });
  }

  return fail(res, 404, 'unknown');
}, { auth: false });
