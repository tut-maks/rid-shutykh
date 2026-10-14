// Спільне для серверних функцій: сесія в HttpOnly-cookie, ролі, захист від підробки запитів, журнали.
import crypto from 'node:crypto';
import { db } from './_db.js';

export const env = (k, d = '') => String(process.env[k] || d).trim();
const COOKIE = env('DB_MOCK') === '1' ? 'rs_sid' : '__Host-rs_sid';
const SESSION_DAYS = 30;

export function send(res, code, body, headers = {}) {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}
export const fail = (res, code, error) => send(res, code, { error });

export async function readRaw(req, max) {
  return new Promise((ok, bad) => {
    let n = 0; const ch = [];
    req.on('data', c => { n += c.length; if (n > max) { bad(new Error('too_large')); req.destroy(); } else ch.push(c); });
    req.on('end', () => ok(Buffer.concat(ch)));
    req.on('error', bad);
  });
}
export async function readJSON(req, max = 1_000_000) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const b = await readRaw(req, max);
  try { return JSON.parse(b.toString('utf8') || '{}'); } catch { throw new Error('bad_json'); }
}

export const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
export const token = (n = 32) => crypto.randomBytes(n).toString('base64url');
export const safeEq = (a, b) => { a = Buffer.from(String(a ?? '')); b = Buffer.from(String(b ?? '')); return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b); };

/* Паролі — scrypt */
export function hashPass(p) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const h = crypto.scryptSync(String(p), salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('base64url');
  return `scrypt$32768$${salt}$${h}`;
}
export function checkPass(p, stored) {
  try {
    const [alg, N, salt, h] = String(stored || '').split('$');
    if (alg !== 'scrypt') return false;
    const x = crypto.scryptSync(String(p), salt, 64, { N: Number(N), r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('base64url');
    return safeEq(x, h);
  } catch { return false; }
}

/* Cookie */
export function cookies(req) {
  const out = {}; for (const part of String(req.headers.cookie || '').split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}
export function setSessionCookie(res, value, maxAge) {
  const secure = env('DB_MOCK') === '1' ? '' : '; Secure';
  res.setHeader('set-cookie', `${COOKIE}=${value}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=${maxAge}`);
}
export const clientIp = req => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();

/* Захист від підробки запитів: зміни приймаємо лише з нашого ж сайту */
export function sameOrigin(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin') return false;
  const origin = req.headers.origin;
  if (!origin) return !!site; // сучасний браузер завжди надсилає щось із двох
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

export async function createSession(res, req, member) {
  const t = token(32);
  const exp = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  await db.insert('sessions', { token_hash: sha(t), member_id: member.id, expires_at: exp, ua: String(req.headers['user-agent'] || '').slice(0, 300), ip: clientIp(req) });
  setSessionCookie(res, t, SESSION_DAYS * 86400);
  return sha(t);
}

/* Хто це: повертає {member, sid} або null */
export async function who(req) {
  const t = cookies(req)[COOKIE];
  if (!t || t.length < 20) return null;
  const s = await db.get('sessions', { eq: { token_hash: sha(t) } });
  if (!s || s.revoked || new Date(s.expires_at) < new Date()) return null;
  const m = await db.get('members', { eq: { id: s.member_id } });
  if (!m || !m.active) return null;
  // оновлюємо «востаннє бачили» не частіше ніж раз на 5 хв
  if (Date.now() - new Date(s.last_seen).getTime() > 300000) db.update('sessions', { eq: { token_hash: s.token_hash } }, { last_seen: new Date().toISOString() }).catch(() => {});
  return { member: m, sid: s.token_hash };
}

const RANK = { viewer: 1, editor: 2, owner: 3 };
export const can = (m, role) => !!m && RANK[m.role] >= RANK[role];

/* Обгортка: перевіряє походження запиту і вхід */
export function handler(fn, { role = 'viewer', auth = true } = {}) {
  return async (req, res) => {
    try {
      res.setHeader('x-robots-tag', 'noindex, nofollow');
      if (!sameOrigin(req)) return fail(res, 403, 'bad_origin');
      let ctx = null;
      if (auth) { ctx = await who(req); if (!ctx) return fail(res, 401, 'auth'); if (!can(ctx.member, role)) return fail(res, 403, 'forbidden'); }
      const url = new URL(req.url, 'http://x');
      return await fn(req, res, ctx, url);
    } catch (e) {
      console.error('[api]', e);
      return fail(res, e.message === 'too_large' ? 413 : e.message === 'bad_json' ? 400 : 500, e.message === 'too_large' ? 'too_large' : e.message === 'bad_json' ? 'bad_json' : 'server');
    }
  };
}

/* Журнали */
export const revision = (entity, entity_id, action, before, after, by) =>
  db.insert('revisions', { entity, entity_id: String(entity_id), action, before: before ?? null, after: after ?? null, by: by ?? null }).catch(e => console.error('[rev]', e));
export const track = (member_id, sid, type, view, target, ms = 0) =>
  db.insert('events', { member_id, session: sid ? sid.slice(0, 16) : null, type, view: view ?? null, target: target ?? null, ms }).catch(() => {});

/* Обмеження спроб (вхід, запрошення) */
export async function tooMany(key, limit, minutes) {
  const since = new Date(Date.now() - minutes * 60000).toISOString();
  const rows = await db.list('login_attempts', { eq: { key }, gte: { at: since }, limit: limit + 1 });
  return rows.length >= limit;
}
export const attempt = key => db.insert('login_attempts', { key }).catch(() => {});

/* Перевірка полів людини */
const STR = (v, n) => (v == null ? '' : String(v).slice(0, n)).trim();
export function cleanPerson(d) {
  const o = {
    n: STR(d.n, 80), pt: STR(d.pt, 80), s: STR(d.s, 80), m: STR(d.m, 80),
    sex: ['m', 'f'].includes(d.sex) ? d.sex : '',
    b: STR(d.b, 40), d: STR(d.d, 40), bp: STR(d.bp, 160), dp: STR(d.dp, 160), lp: STR(d.lp, 160),
    note: STR(d.note, 8000), f: STR(d.f, 60), mo: STR(d.mo, 60),
    hyp: !!d.hyp, fam: Array.isArray(d.fam) ? d.fam.map(x => STR(x, 40)).filter(Boolean).slice(0, 10) : [],
  };
  if (d.portrait) o.portrait = STR(d.portrait, 60);
  if (d.portrait && d.pc && typeof d.pc === 'object') { // кадр обличчя на головному фото: частки зображення, квадрат
    const n = v => Math.round(Math.max(0, Math.min(1, Number(v) || 0)) * 1e4) / 1e4;
    const pc = { id: STR(d.pc.id, 60), x: n(d.pc.x), y: n(d.pc.y), s: n(d.pc.s), r: Math.round(Math.max(0.05, Math.min(20, Number(d.pc.r) || 1)) * 1e4) / 1e4 };
    if (pc.id === o.portrait && pc.s >= 0.02) o.pc = pc;
  }
  if (Array.isArray(d.src)) o.src = d.src.slice(0, 30).map(s => ({ t: STR(s?.t, 120), u: STR(s?.u, 300) })).filter(s => /^https?:\/\/[^\s<>"']+$/.test(s.u)); // джерела: будь-який сайт (і старі http-адреси, напр. сайти шкіл)
  if (d.root) o.root = true;
  const ln = cleanLinks(d.links); if (ln.length) o.links = ln;
  if (typeof d.dna === 'string' && d.dna) o.dna = STR(d.dna, 30);
  if (d.war && typeof d.war === 'object' && ['ww1', 'ww2', 'other'].includes(d.war.w)) o.war = { w: d.war.w, f: ['ret', 'kil', 'mis', 'unk'].includes(d.war.f) ? d.war.f : 'unk', ...(d.war.h ? { h: true } : {}) }; // участь у війні: яка, доля, h — припущення
  return o;
}

/* Соцмережі й зв'язок живих родичів: [{t, u}]. Посилання — лише https на відомі сайти, телефони — лише цифри. */
const LINK_HOST = { ig: /^(www\.)?instagram\.com$/, fb: /^(www\.|m\.)?(facebook|fb)\.com$/, tg: /^t\.me$/, tt: /^(www\.)?tiktok\.com$/, yt: /^(www\.|m\.)?youtube\.com$|^youtu\.be$/, li: /^(www\.)?linkedin\.com$/, wa: /^wa\.me$/, web: /./ };
const LINK_BASE = { ig: 'https://instagram.com/', fb: 'https://facebook.com/', tg: 'https://t.me/', tt: 'https://www.tiktok.com/@', yt: 'https://youtube.com/@', li: 'https://linkedin.com/in/' };
export function normLink(t, raw) {
  let v = STR(raw, 300).replace(/\s+/g, ' ');
  if (!v) return '';
  if (t === 'tel' || t === 'vb') { const d = v.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, ''); const n = d.replace(/^\+/, ''); if (!/^\d{9,15}$/.test(n)) return ''; return '+' + (n.length === 10 && n[0] === '0' ? '38' + n : n); }
  if (t === 'wa' && /^[+\d][\d\s()-]{8,}$/.test(v)) { const n = normLink('tel', v); return n ? 'https://wa.me/' + n.slice(1) : ''; }
  if (t === 'tg' && /^\+?[\d\s()-]{9,}$/.test(v)) { const n = normLink('tel', v); return n ? 'https://t.me/' + n : ''; }
  if (!/^https?:\/\//i.test(v)) {
    if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(v) && !(LINK_BASE[t] && /^@/.test(v))) v = 'https://' + v;
    else if (LINK_BASE[t]) { const h = v.replace(/^@/, ''); if (!/^[\w.-]{1,80}$/.test(h)) return ''; v = LINK_BASE[t] + h; }
    else return '';
  }
  let u; try { u = new URL(v.replace(/^http:/i, 'https:')); } catch { return ''; }
  if (u.protocol !== 'https:' || u.username || u.password) return '';
  if (!(LINK_HOST[t] || LINK_HOST.web).test(u.hostname)) return '';
  return u.href.slice(0, 300);
}
export function cleanLinks(a) {
  if (!Array.isArray(a)) return [];
  const T = ['ig', 'fb', 'tg', 'vb', 'wa', 'tt', 'yt', 'li', 'tel', 'web'];
  return a.slice(0, 12).map(x => ({ t: T.includes(x?.t) ? x.t : '', u: '' + (x?.u || '') })).filter(x => x.t).map(x => ({ t: x.t, u: normLink(x.t, x.u) })).filter(x => x.u);
}
export const slugId = () => 'p_' + crypto.randomBytes(5).toString('hex');

/* Глядач доповнює (спогади, фото) лише свою гілку: себе, чоловіка/дружину, батьків, дітей, братів і сестер.
   Редактор і власник — будь-яку картку. Для спогадів про родину — лише родину, до якої належить сам. */
export function branchSet(personId, persons, unions) {
  const out = new Set(); if (!personId) return out;
  const P = new Map(persons.map(p => [p.id, p.data || p]));
  const me = P.get(personId); if (!me) return out;
  out.add(personId);
  for (const k of [me.f, me.mo]) if (k) out.add(k);
  for (const [id, d] of P) {
    if (d.f === personId || d.mo === personId) out.add(id);
    if ((me.f && d.f === me.f) || (me.mo && d.mo === me.mo)) out.add(id);
  }
  for (const u of unions) { if (u.a === personId) out.add(u.b); if (u.b === personId) out.add(u.a); }
  return out;
}
export async function canAddTo(member, target) {
  if (can(member, 'editor')) return true;
  if (!member.person_id || !target) return false;
  if (target.startsWith('fam:')) {
    const f = await db.get('families', { eq: { id: target.slice(4) } });
    return !!f && (f.data.members || []).includes(member.person_id);
  }
  const [persons, unions] = await Promise.all([db.list('persons', { eq: { deleted: false }, select: 'id,data' }), db.list('unions', { eq: { deleted: false } })]);
  return branchSet(member.person_id, persons, unions).has(target);
}

/* Реєстрація за посиланням: код зберігається в settings.join = {code, on} */
export async function joinCfg(create = false, by = null) {
  let row = null; try { row = await db.get('settings', { eq: { key: 'join' } }); } catch { return null; }
  if (!row && create) { const value = { code: token(9), on: true }; await db.upsert('settings', { key: 'join', value, updated_by: by, updated_at: new Date().toISOString() }); return value; }
  return row ? row.value : null;
}
export const JOIN_FIELDS = ['s', 'n', 'pt', 'm', 'sex', 'b', 'bp', 'live', 'phone', 'father', 'mother', 'gpf', 'gpm', 'spouse', 'kids', 'sibs', 'link', 'note'];
export function cleanJoin(d = {}) {
  const o = {};
  for (const k of JOIN_FIELDS) { const v = STR(d[k], ['kids', 'sibs', 'link', 'note', 'gpf', 'gpm'].includes(k) ? 2000 : 300); if (v) o[k] = v; }
  if (o.sex && !['m', 'f'].includes(o.sex)) delete o.sex;
  if (Array.isArray(d.kidsL)) { const L = d.kidsL.slice(0, 12).map(k => ({ n: STR(k?.n, 60), b: STR(k?.b, 20), sex: ['m', 'f'].includes(k?.sex) ? k.sex : '' })).filter(k => k.n); if (L.length) o.kidsL = L; }
  return o;
}

/* Фото, які родич додав не до своєї гілки, чекають підтвердження власника: settings 'photo_pending' = {photoId: {by, at, person}} */
export async function pendGet() { try { const r = await db.get('settings', { eq: { key: 'photo_pending' } }); return r?.value || {}; } catch { return {}; } }
export async function pendSet(v, by) { await db.upsert('settings', { key: 'photo_pending', value: v, updated_by: by ?? null, updated_at: new Date().toISOString() }); }
