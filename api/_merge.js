// Дублі в дереві: перевірка «чи це та сама людина» і об'єднання двох карток в одну.
// Те саме правило sameMan() є в public/app.js (для попереджень на сторінці) — міняти обидва разом.
import { db } from './_db.js';
import { revision, cleanPerson } from './_lib.js';

const norm = s => String(s || '').toLowerCase().replace(/\s*\(.*?\)/g, '').replace(/[’ʼ`]/g, "'").replace(/ё/g, 'е').trim().split(/\s+/)[0] || '';
const yr = s => (String(s || '').match(/\d{4}/) || [])[0] || '';

// a, b — {id, ...data}. Та сама людина, якщо збігаються ім'я і прізвище (або дівоче) і
// або однаковий рік народження, або (рік відомий не в обох) спільний батько чи мати.
// По батькові, стать, рік смерті — якщо відомі в обох і різні, це різні люди.
export function sameMan(a, b) {
  if (!a || !b || a.id === b.id) return false;
  if ([a.f, a.mo].includes(b.id) || [b.f, b.mo].includes(a.id)) return false;
  const na = norm(a.n); if (!na || na !== norm(b.n)) return false;
  const sa = [a.s, a.m].map(norm).filter(Boolean), sb = [b.s, b.m].map(norm).filter(Boolean);
  if (!sa.length || !sa.some(x => sb.includes(x))) return false;
  if (a.sex && b.sex && a.sex !== b.sex) return false;
  if (a.pt && b.pt && norm(a.pt) !== norm(b.pt)) return false;
  if (yr(a.d) && yr(b.d) && yr(a.d) !== yr(b.d)) return false;
  if ((yr(a.d) && yr(b.b) && +yr(a.d) < +yr(b.b)) || (yr(b.d) && yr(a.b) && +yr(b.d) < +yr(a.b))) return false; // один помер раніше, ніж народився інший
  const ya = yr(a.b), yb = yr(b.b);
  if (ya && yb) return ya === yb;
  return !!((a.f && a.f === b.f) || (a.mo && a.mo === b.mo));
}
export const pairKey = (a, b) => [a, b].sort().join('|');
export async function notDup() { try { const r = await db.get('settings', { eq: { key: 'not_dup' } }); return Array.isArray(r?.value) ? r.value : []; } catch { return []; } }
// усі можливі дублі для data (серед живих карток), крім тих пар, що позначені «це різні люди»
export async function findDupes(data, persons) {
  persons ||= await db.list('persons', { eq: { deleted: false } });
  const nd = data.id ? new Set(await notDup()) : new Set();
  return persons.filter(p => sameMan({ ...data }, { id: p.id, ...p.data }) && !nd.has(pairKey(data.id || '', p.id)));
}

// дві картки однієї людини → одна: усі зв'язки, фото, спогади, документи, акаунт переходять на keep
export async function mergePersons(keepId, dropId, by) {
  if (!keepId || !dropId || keepId === dropId) return { error: 'bad' };
  const keep = await db.get('persons', { eq: { id: keepId, deleted: false } }), drop = await db.get('persons', { eq: { id: dropId, deleted: false } });
  if (!keep || !drop) return { error: 'not_found' };
  if (drop.data.root) return { error: 'root' };
  const now = () => new Date().toISOString();
  const up = async (row, nd) => { await db.update('persons', { eq: { id: row.id } }, { data: nd, version: (row.version || 1) + 1, updated_by: by, updated_at: now() }); await revision('person', row.id, 'update', row.data, nd, by); };
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
    if (other === keepId || partners.has(other)) { await db.update('unions', { eq: { id: u.id } }, { deleted: true }); await revision('union', u.id, 'delete', u, null, by); continue; }
    const nu = { a: u.a === dropId ? keepId : u.a, b: u.b === dropId ? keepId : u.b }; await db.update('unions', { eq: { id: u.id } }, nu); await revision('union', u.id, 'update', u, { ...u, ...nu }, by); partners.add(other);
  }
  // 4) фото, спогади, акаунти, заявки, запитання, документи, гілки
  for (const ph of await db.list('photos', { eq: { person_id: dropId } })) { await db.update('photos', { eq: { id: ph.id } }, { person_id: keepId }); await revision('photo', ph.id, 'update', { person_id: dropId }, { person_id: keepId }, by); }
  for (const st of await db.list('stories', { eq: { target: dropId } })) { await db.update('stories', { eq: { id: st.id } }, { target: keepId }); await revision('story', st.id, 'update', { target: dropId }, { target: keepId }, by); }
  for (const t of ['members', 'join_requests', 'questions', 'invites']) { try { for (const r of await db.list(t, { eq: { person_id: dropId } })) { await db.update(t, { eq: { id: r.id } }, { person_id: keepId }); await revision(t === 'members' ? 'member' : t, r.id, 'update', { person_id: dropId }, { person_id: keepId }, by); } } catch {} }
  for (const d of await db.list('documents', {})) { const pp = d.data?.people || []; if (pp.includes(dropId)) { const data = { ...d.data, people: [...new Set(pp.map(x => x === dropId ? keepId : x))] }; await db.update('documents', { eq: { id: d.id } }, { data }); await revision('document', d.id, 'update', d.data, data, by); } }
  for (const f of await db.list('families', {})) { const mm = f.data?.members || []; if (mm.includes(dropId)) { const data = { ...f.data, members: [...new Set(mm.map(x => x === dropId ? keepId : x))] }; await db.update('families', { eq: { id: f.id } }, { data }); await revision('family', f.id, 'update', f.data, data, by); } }
  try { const r = await db.get('settings', { eq: { key: 'photo_people' } }); const v = r?.value || {}; let ch = false; for (const k in v) if (Array.isArray(v[k]) && v[k].includes(dropId)) { v[k] = [...new Set(v[k].map(x => x === dropId ? keepId : x))]; ch = true; } if (ch) await db.upsert('settings', { key: 'photo_people', value: v, updated_by: by, updated_at: now() }); } catch {}
  // 5) дубль прибираємо (повернути можна з «Історії змін»)
  await db.update('persons', { eq: { id: dropId } }, { deleted: true, updated_by: by, updated_at: now() });
  await revision('person', dropId, 'delete', drop.data, { mergedInto: keepId }, by);
  return { ok: true, keep: keepId };
}
