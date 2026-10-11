// Доступ до бази і сховища — лише тут. У браузер ключі не потрапляють.
// DB_MOCK=1 — локальна перевірка без Supabase (усе в пам'яті / у файлі .mock.json).
import fs from 'node:fs';

const env = k => String(process.env[k] || '').trim();
const MOCK = env('DB_MOCK') === '1';

/* ───────── Supabase ───────── */
let _sb = null;
async function sb() {
  if (_sb) return _sb;
  const { createClient } = await import('@supabase/supabase-js');
  let url = env('SUPABASE_URL'); try { url = new URL(url).origin; } catch {}
  _sb = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  return _sb;
}
function applyFilters(q, f = {}) {
  for (const [k, v] of Object.entries(f.eq || {})) q = q.eq(k, v);
  for (const [k, v] of Object.entries(f.gte || {})) q = q.gte(k, v);
  for (const [k, v] of Object.entries(f.lt || {})) q = q.lt(k, v);
  for (const [k, v] of Object.entries(f.in || {})) q = q.in(k, v);
  return q;
}
const real = {
  async list(table, f = {}) {
    const out = []; const page = 1000; let from = 0; const max = f.limit || 100000;
    for (;;) {
      let q = applyFilters((await sb()).from(table).select(f.select || '*'), f);
      if (f.order) q = q.order(f.order, { ascending: !f.desc });
      const to = Math.min(from + page, max) - 1;
      const { data, error } = await q.range(from, to);
      if (error) throw new Error(error.message);
      out.push(...data); if (data.length < page || out.length >= max) break; from += page;
    }
    return out;
  },
  async get(table, f) { const { data, error } = await applyFilters((await sb()).from(table).select('*'), f).maybeSingle(); if (error) throw new Error(error.message); return data; },
  async insert(table, rows) { const { data, error } = await (await sb()).from(table).insert(rows).select(); if (error) throw new Error(error.message); return data; },
  async upsert(table, rows) { const { data, error } = await (await sb()).from(table).upsert(rows).select(); if (error) throw new Error(error.message); return data; },
  async update(table, f, patch) { const { data, error } = await applyFilters((await sb()).from(table).update(patch), f).select(); if (error) throw new Error(error.message); return data; },
  async remove(table, f) { const { error } = await applyFilters((await sb()).from(table).delete(), f); if (error) throw new Error(error.message); },
  async put(path, buf, mime) { const { error } = await (await sb()).storage.from('family').upload(path, buf, { contentType: mime, upsert: true }); if (error) throw new Error(error.message); },
  async read(path) { const { data, error } = await (await sb()).storage.from('family').download(path); if (error) return null; return Buffer.from(await data.arrayBuffer()); },
  async del(path) { await (await sb()).storage.from('family').remove([path]); },
};

/* ───────── Mock (лише локально) ───────── */
const MF = process.env.MOCK_FILE || '/tmp/rid-shutykh.mock.json';
let M = null;
const load = () => { if (M) return M; try { M = JSON.parse(fs.readFileSync(MF, 'utf8')); } catch { M = { t: {}, files: {} }; } return M; };
const save = () => fs.writeFileSync(MF, JSON.stringify(M));
const tbl = n => (load().t[n] ||= []);
const PK = { sessions: 'token_hash', invites: 'token_hash', settings: 'key' };
const match = (r, f = {}) => Object.entries(f.eq || {}).every(([k, v]) => r[k] === v)
  && Object.entries(f.gte || {}).every(([k, v]) => r[k] >= v)
  && Object.entries(f.lt || {}).every(([k, v]) => r[k] < v)
  && Object.entries(f.in || {}).every(([k, v]) => v.includes(r[k]));
let seq = Date.now();
const defaults = (table, r) => {
  const now = new Date().toISOString(); const o = { ...r };
  if (!o.id && !PK[table]) o.id = ['events', 'revisions', 'login_attempts'].includes(table) ? ++seq : crypto.randomUUID();
  for (const k of ['created_at', 'at', 'updated_at', 'last_seen']) if (o[k] === undefined && ['created_at', 'at'].includes(k)) o[k] = now;
  if (table === 'persons') { o.version ??= 1; o.deleted ??= false; o.updated_at ??= now; }
  if (['unions', 'photos', 'stories'].includes(table)) o.deleted ??= false;
  if (table === 'members') o.active ??= true;
  if (table === 'sessions') { o.revoked ??= false; o.last_seen ??= now; }
  if (table === 'photos') o.caption ??= '';
  return o;
};
const mock = {
  async list(table, f = {}) { let r = tbl(table).filter(x => match(x, f)); if (f.order) r = r.sort((a, b) => (a[f.order] > b[f.order] ? 1 : -1) * (f.desc ? -1 : 1)); return structuredClone(r.slice(0, f.limit || 1e9)); },
  async get(table, f) { const r = tbl(table).find(x => match(x, f)); return r ? structuredClone(r) : null; },
  async insert(table, rows) { rows = [].concat(rows).map(r => defaults(table, r)); tbl(table).push(...rows); save(); return structuredClone(rows); },
  async upsert(table, rows) { const pk = PK[table] || 'id'; const out = []; for (const r of [].concat(rows)) { const i = tbl(table).findIndex(x => x[pk] === r[pk]); if (i >= 0) { tbl(table)[i] = { ...tbl(table)[i], ...r }; out.push(tbl(table)[i]); } else { const d = defaults(table, r); tbl(table).push(d); out.push(d); } } save(); return structuredClone(out); },
  async update(table, f, patch) { const out = []; tbl(table).forEach((x, i) => { if (match(x, f)) { tbl(table)[i] = { ...x, ...patch }; out.push(tbl(table)[i]); } }); save(); return structuredClone(out); },
  async remove(table, f) { load().t[table] = tbl(table).filter(x => !match(x, f)); save(); },
  async put(path, buf, mime) { load().files[path] = { b: Buffer.from(buf).toString('base64'), mime }; save(); },
  async read(path) { const x = load().files[path]; return x ? Buffer.from(x.b, 'base64') : null; },
  async del(path) { delete load().files[path]; save(); },
};

export const db = MOCK ? mock : real;
export const isMock = MOCK;
