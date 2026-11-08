// Дані дерева. GET /api/data — усе для показу; POST /api/data {op, ...} — зміни (з історією).
import fs from 'node:fs';
import path from 'node:path';
import { db } from './_db.js';
import { findDupes, mergePersons, notDup, pairKey } from './_merge.js';
import { handler, send, fail, readJSON, can, revision, track, cleanPerson, cleanLinks, slugId, canAddTo, pendGet, pendSet, joinCfg, verGet, verOut } from './_lib.js';

const S = (v, n) => String(v ?? '').slice(0, n).trim();

const QK = ['fix', 'ask', 'find'], QS = ['new', 'work', 'found', 'closed'];
const qOut = q => ({ id: q.id, kind: q.kind, person: q.person_id || '', about: q.about || '', text: q.text, status: q.status, answer: q.answer || '', by: q.created_by, at: q.created_at, upd: q.updated_at, updBy: q.updated_by || null });

/* Спільні налаштування родини (settings): група Telegram, «Хто на фото?», «Допоможіть знайти», ДНК-збіги, місця на карті */
const CFG = { tg_group: {}, photo_ask: {}, wanted: [], dna_matches: [], places: {}, photo_people: {}, photo_faces: {}, words: [], routes: [] };
async function cfgAll() {
  const out = {}; for (const k in CFG) out[k] = structuredClone(CFG[k]);
  try { for (const r of await db.list('settings', { in: { key: Object.keys(CFG) } })) out[r.key] = r.value ?? out[r.key]; } catch {}
  return out;
}
async function cfgGet(k) { try { const r = await db.get('settings', { eq: { key: k } }); return r?.value ?? structuredClone(CFG[k]); } catch { return structuredClone(CFG[k]); } }
async function cfgSet(k, v, by, before) { await db.upsert('settings', { key: k, value: v, updated_by: by, updated_at: new Date().toISOString() }); await revision('setting', k, 'update', before ?? null, v, by); }
/* Правки від родичів: питання kind 'fix' + запропоновані зміни полів картки в settings 'fix_pending' = {qid: {person, ch:{k:[було, стане]}, st?:'ok'|'no', keys?}}.
   Вносить у картку лише власник (fix.apply), після перегляду. */
const FIXK = { n: "Ім'я", pt: 'По батькові', s: 'Прізвище', m: 'Дівоче прізвище', sex: 'Стать', b: 'Народження', bp: 'Місце народження', d: 'Смерть', dp: 'Місце смерті', lp: 'Де жив(-ла) / живе', note: 'Опис' };
const FIXN = { n: 80, pt: 80, s: 80, m: 80, sex: 2, b: 40, bp: 160, d: 40, dp: 160, lp: 160, note: 8000 };
async function fixGet() { try { const r = await db.get('settings', { eq: { key: 'fix_pending' } }); return r?.value || {}; } catch { return {}; } }
async function fixSet(v, by) { await db.upsert('settings', { key: 'fix_pending', value: v, updated_by: by, updated_at: new Date().toISOString() }); }
const FIXREL = { spouse: 'чоловік / дружина', son: 'син', daughter: 'донька', father: 'батько', mother: 'мати', brother: 'брат', sister: 'сестра' };
const fixKeys = it => [...Object.keys(it.ch || {}), ...(it.add || []).map((_, i) => 'add' + i), ...(it.dup ? ['dup'] : [])];
function fixText(it) {
  const sh = v => v.length > 200 ? v.slice(0, 200) + '…' : v;
  const L = [...Object.entries(it.ch || {}).map(([k, [a, b]]) => `${FIXK[k]}: «${sh(a) || '—'}» → «${sh(b) || '—'}»`),
    ...(it.add || []).map(x => `Додати: ${FIXREL[x.rel]} — ${[x.n, x.pt, x.s].filter(Boolean).join(' ')}${x.m ? ' (' + x.m + ')' : ''}${x.b ? ', н. ' + x.b : ''}`),
    ...(it.dup ? ['Це та сама людина, що й картка ' + it.dup] : [])];
  return L.join('\n') + (it.why ? (L.length ? '\n\n' : '') + 'Звідки відомо / коментар: ' + it.why : '');
}
/* Внести пропозицію: поля картки, нові рідні (з перевіркою дублів і зв'язками), об'єднання дубля. keys = null → усе. */
async function applyFix(it, keys, keep, me) {
  const all = fixKeys(it); keys = (keys || all).filter(k => all.includes(k)); if (!keys.length) return { error: 'empty' };
  const now = () => new Date().toISOString(), made = [];
  const get = id => db.get('persons', { eq: { id, deleted: false } });
  const upd = async (id, set) => { const p = await get(id); if (!p) return; const data = { ...p.data, ...set }; await db.update('persons', { eq: { id } }, { data, version: (p.version || 1) + 1, updated_by: me.id, updated_at: now() }); await revision('person', id, 'update', p.data, data, me.id); };
  const unite = async (a, b, date = '') => { if (!a || !b || a === b) return; const us = await db.list('unions', { eq: { deleted: false } }); if (us.some(u => (u.a === a && u.b === b) || (u.a === b && u.b === a))) return; const u = { id: 'u_' + slugId().replace(/^p_/, ''), a, b, date, created_by: me.id }; await db.insert('unions', u); await revision('union', u.id, 'create', null, u, me.id); };
  const fk = keys.filter(k => it.ch?.[k]);
  if (fk.length) { const cur = await get(it.person); if (!cur) return { error: 'not_found' }; const set = {}; for (const k of fk) set[k] = it.ch[k][1]; await upd(cur.id, set); }
  const note = 'Додано ' + (it.author ? 'за словами ' + it.author + ' ' : '') + '(пропозиція на сайті, підтвердив власник).';
  const SEX = { son: 'm', brother: 'm', father: 'm', daughter: 'f', sister: 'f', mother: 'f' };
  const order = ['spouse', 'father', 'mother', 'son', 'daughter', 'brother', 'sister'];
  const items = (it.add || []).map((x, i) => ({ ...x, i })).filter(x => keys.includes('add' + x.i)).sort((a, b) => order.indexOf(a.rel) - order.indexOf(b.rel));
  let newSp = '';
  for (const x of items) {
    const cur = await get(it.person); if (!cur) break;
    const sex = SEX[x.rel] || (cur.data.sex === 'm' ? 'f' : cur.data.sex === 'f' ? 'm' : '');
    const data = cleanPerson({ s: x.s, n: x.n, pt: x.pt, m: x.m, b: x.b, sex, fam: cur.data.fam || [], note });
    if (x.rel === 'son' || x.rel === 'daughter') {
      const me2 = cur.data.sex === 'f' ? 'mo' : 'f', oth = me2 === 'f' ? 'mo' : 'f'; data[me2] = cur.id;
      const sps = (await db.list('unions', { eq: { deleted: false } })).filter(u => u.a === cur.id || u.b === cur.id).map(u => u.a === cur.id ? u.b : u.a);
      const sp = newSp || (sps.length === 1 ? sps[0] : ''); if (sp) data[oth] = sp;
    }
    if (x.rel === 'brother' || x.rel === 'sister') { data.f = cur.data.f || ''; data.mo = cur.data.mo || ''; }
    if (!data.s) { const fa = data.f ? await get(data.f) : null; data.s = fa?.data.s || ''; } // прізвище не вказали — як у батька
    const dd = await findDupes(data); let id;
    if (dd.length === 1) { id = dd[0].id; const set = {}; for (const k of ['f', 'mo']) if (data[k] && !dd[0].data[k]) set[k] = data[k]; if (Object.keys(set).length) await upd(id, set); }
    else { id = slugId(); await db.insert('persons', { id, data, created_by: me.id, updated_by: me.id }); await revision('person', id, 'create', null, data, me.id); made.push(id); }
    if (x.rel === 'spouse') { await unite(cur.id, id); newSp ||= id; }
    if (x.rel === 'father' || x.rel === 'mother') { const k = x.rel === 'father' ? 'f' : 'mo'; if (!cur.data[k]) await upd(cur.id, { [k]: id }); const c2 = await get(cur.id); if (c2?.data.f && c2?.data.mo) await unite(c2.data.f, c2.data.mo); }
  }
  let kept = '';
  if (keys.includes('dup') && it.dup) {
    const a = await get(it.person), b = await get(it.dup);
    if (a && b) { const k = [a.id, b.id].includes(keep) ? keep : (b.data.portrait && !a.data.portrait ? b.id : a.data.root ? a.id : b.data.root ? b.id : a.id); const r = await mergePersons(k, k === a.id ? b.id : a.id, me.id); if (r.error) return { error: r.error }; kept = k; }
  }
  return { keys, made, keep: kept };
}
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
    const fp = await fixGet(); for (const q of questions) if (fp[q.id]) Object.assign(q, { patch: fp[q.id].ch || {}, padd: fp[q.id].add || [], pdup: fp[q.id].dup || '', pst: fp[q.id].st || '', pkeys: fp[q.id].keys || null });
  } catch { qReady = false; }
  const [pend, cfg, jc, pver] = await Promise.all([pendGet(), cfgAll(), joinCfg(false).catch(() => null), verGet()]); const isOwn = can(ctx.member, 'owner');
  const photosV = photos.filter(p => !pend[p.id] || isOwn || p.created_by === ctx.member.id); // чужі непідтверджені фото не показуємо
  let joinPending = 0;
  if (can(ctx.member, 'owner')) { try { joinPending = (await db.list('join_requests', { eq: { status: 'pending' }, select: 'id' })).length; } catch {} }
  const authors = new Set([...photosV.map(p => p.created_by), ...stories.map(x => x.created_by), ...questions.map(q => q.by), ...questions.map(q => q.updBy)].filter(Boolean));
  const last = {};
  for (const r of revs) if (!last[r.entity_id]) last[r.entity_id] = { by: r.by, at: r.at, action: r.action };
  return {
    me: { id: ctx.member.id, name: ctx.member.name, role: ctx.member.role, person_id: ctx.member.person_id || null },
    // Хто й коли правив картку — лише власнику (родичі не бачать активності інших)
    persons: persons.map(p => ({ id: p.id, ...p.data, v: p.version, last: isOwn ? (last[p.id] || null) : (last[p.id]?.action === 'create' ? { action: 'create' } : null) })),
    unions: unions.map(u => ({ id: u.id, a: u.a, b: u.b, date: u.date || '' })),
    families: families.map(f => ({ id: f.id, ...f.data })),
    documents: documents.map(d => ({ id: d.id, ...d.data, pages: (d.data.pages || []).length })),
    photos: photosV.map(p => ({ id: p.id, person: p.person_id, caption: p.caption, mime: p.mime, by: p.created_by, at: p.created_at, ...(pend[p.id] ? { pending: true } : {}), ...(pver[p.id] ? { ver: verOut(pver[p.id]) } : {}) })),
    photoPending: isOwn ? photosV.filter(p => pend[p.id]).length : 0,
    stories: stories.map(s => ({ id: s.id, target: s.target, text: s.text, by: s.created_by, at: s.created_at })),
    // Імена учасників: власнику — усі; іншим — лише автори видимих фото, спогадів і запитань та сам користувач (хто ще зареєстрований — не видно)
    names: Object.fromEntries(members.filter(m => isOwn || m.id === ctx.member.id || authors.has(m.id)).map(m => [m.id, m.name || 'Родич'])),
    accounts: isOwn ? [...new Set(members.filter(m => m.active && m.person_id).map(m => m.person_id))] : [], // у кого вже є доступ — лише власнику (запрошує тільки він)
    questions, qReady, joinPending,
    cfg: { tg: cfg.tg_group?.url || '', photoAsk: cfg.photo_ask || {}, wanted: cfg.wanted || [], words: cfg.words || [], routes: cfg.routes || [], dna: cfg.dna_matches || [], places: cfg.places || {}, photoPeople: cfg.photo_people || {}, photoFaces: cfg.photo_faces || {}, notDup: await notDup(), join: jc?.on && jc?.code ? jc.code : '' },
  };
}

// Джерела для «Бази» (файл → назва джерела й посилання). Новий файл facts/baza/src_*.csv — додати сюди.
const BAZA_SRC = {
  'src_documents.csv': { src: 'Документи сайту (метрики, сповідні, ЗАГС, описи) — усі люди, названі в цитатах (батьки, хрещені, поручителі, свідки, священики); написання як у джерелі; зібрано автоматично (tools/baza_docs.py)' },
  'src_rum1767_veprik.csv': { src: 'Рум\'янцевський опис 1767 р., с. Веприк — ЦДІАК України, ф. 57, оп. 1, спр. 170 (читання триває; «кадр» — номер у переглядачі Архіуму)', url: 'https://archium.cdiak.archives.gov.ua/file-viewer/60295' },
  'src_rum1767_voronky.csv': { src: 'Рум\'янцевський опис 1767 р., с. Вороньки — ЦДІАК України, ф. 57, оп. 1, спр. 169 (подвірний опис; прізвища жінок і дітей — за головою двору)', url: 'https://archium.cdiak.archives.gov.ua/file-viewer/60294#file-1268216' },
  'src_perepys1782_voronky.csv': { src: 'Подвірний перепис с. Вороньки 20.12.1782 р. (чистовик) — ЦДІАК України, ф. 57, оп. 1, спр. 435 (поки переписано двори наших родин і їхніх сусідів; «кадр» — номер у переглядачі Архіуму)', url: 'https://archium.cdiak.archives.gov.ua/file-viewer/60556' },
  'src_fs_metryky.csv': { src: 'Метричні книги з FamilySearch («Україна, Чернігів, церковні записи, 1717–1935»), прочитані окремо зі сканів (Красновиди з Лосинівки й Веприка, Терещенки з Козацького тощо); кадр і плівка — у колонках', url: 'https://www.familysearch.org/search/collection/3656669' },
  'src_arolsen.csv': { src: 'Arolsen Archives (онлайн-архів переслідуваних нацистським режимом: остарбайтери, в’язні концтаборів) — покажчик імен; пошук 07.11.2026 за «Weprik», «Woronki/Woronky», «Schuty/Schutij/Schutyj»; повторний пошук 07.11 — 54 варіанти назв сіл (Веприк, Вороньки, Озеряни, Пустотин, Свидовець, Лідин, Козацьке, Нова Басань, Бобровиця) і ~300 написань прізвищ дерева (рядки без села — рідкісні прізвища дерева, чи наші — не встановлено). Записано, як в індексі (німецьке написання)', url: 'https://collections.arolsen-archives.org/en/search?s=Weprik' },
  'src_kupchi_f57_voronky.csv': { src: 'Копії купчих жителів Вороньків (і хто згаданий у них), подані до ревізії 1767 р. — ЦДІАК України, ф. 57, оп. 1, спр. 161, 163, 164, 165 (на документах «Воронки (22)»); «кадр» — переглядач Архіуму/кадр', url: 'https://archium.cdiak.archives.gov.ua/file-viewer/60289' },
  'src_kozaky1700s_voronky.csv': { src: 'Список козаків с. Вороньки з поділом за майновим станом (без дати, XVIII ст.) — ЦДІАК України, ф. 51, оп. 1, спр. 2750', url: 'https://archium.cdiak.archives.gov.ua/file-viewer/64488' },
  'src_obd_memorial.csv': { src: 'ОБД «Мемориал» (Міноборони РФ; донесення про втрати, картотеки, списки полонених і поховань) — усі записи з наших сіл і Шуті з Ново-Басанського/Бобровицького р-ну; пошук 07–08.11.2026 за прізвищами й за текстом «Вороньки/Воронки/Веприк»; записано як у джерелі (рос.), «кадр» — номер запису ОБД', url: 'https://obd-memorial.ru/html/index.html' },
  'src_gwar_ww1.csv': { src: '«Память героев Великой войны 1914–1918» (gwar.mil.ru; РДВІА: картотека бюро обліку втрат, іменні списки втрат) — усі записи з Козелецького й Остерського повітів за прізвищами дерева і всі з Вороньківської, Ново-Басанської та Бобровицької волостей; пошук 08.11.2026; записано як у джерелі (рос.), «кадр» — номер запису gwar', url: 'https://gwar.mil.ru/heroes/' },
  'src_holodomor_bobrovytskyi.csv': { src: 'Національна книга пам\'яті жертв Голодомору 1932–1933 рр., Чернігівська обл. (2008), Бобровицький р-н: Веприк і Вороньки — с. 65–70, х. Лідин — с. 81, Олександрівка — с. 84, Свидовець — с. 87; ДАЧО ф. 9030', url: 'https://history.org.ua/LiberUA/978-966-502-451-4/978-966-502-451-4.pdf', doc: 'holod' },
};

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
    if (url?.searchParams?.get('dvory')) { // «Карта дворів» 1767/1782 — двори з книг (facts/dvory/dvory.json, збирає tools/dvory_build.py); для всіх, хто увійшов
      let d = null; try { d = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'facts/dvory/dvory.json'), 'utf8')); } catch {}
      track(me.id, ctx.sid, 'open', 'dvory', 'dvory');
      return send(res, 200, { dvory: d });
    }
    const sc = url?.searchParams?.get('scan'); // скан сторінки книги для карти дворів: лише кадри трьох справ ЦДІАК (Архіум), лише тим, хто увійшов
    if (sc) { const m = /^(60294|60295|60556)-(\d{1,3})$/.exec(sc); if (!m) return fail(res, 400, 'bad');
      let ids = null; try { ids = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'facts/dvory/archium_frames.json'), 'utf8'))[m[1]]; } catch {}
      const id = ids?.[+m[2] - 1]; if (!id || !/^\d{5,9}$/.test(id)) return fail(res, 404, 'not_found');
      const r = await fetch(`https://archium.cdiak.archives.gov.ua/static/files/${id.slice(0, 3)}/${id}.jpg`).catch(() => null);
      if (!r || !r.ok) return fail(res, 502, 'archium');
      const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 4.4e6) return fail(res, 502, 'too_large');
      res.statusCode = 200; res.setHeader('content-type', 'image/jpeg'); res.setHeader('cache-control', 'private, max-age=604800'); res.setHeader('x-content-type-options', 'nosniff');
      return res.end(buf); }
    if (url?.searchParams?.get('baza')) { // «База»: усі люди, прочитані в джерелах (і не наші) — facts/baza/src_*.csv з репозиторію; ЛИШЕ власнику (вимога Максима, 06.11)
      if (!can(me, 'owner')) return fail(res, 403, 'forbidden');
      const dir = path.join(process.cwd(), 'facts/baza'), out = [];
      try { for (const f of fs.readdirSync(dir).filter(f => /^src_.*\.csv$/.test(f)).sort()) {
        const [head, ...rows] = fs.readFileSync(path.join(dir, f), 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).map(l => l.split(';'));
        const meta = BAZA_SRC[f] || { src: f };
        rows.forEach(r => out.push({ ...meta, ...Object.fromEntries(head.map((h, i) => [h, r[i] || ''])) }));
      } } catch {}
      track(me.id, ctx.sid, 'open', 'baza', 'baza');
      return send(res, 200, { rows: out });
    }
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
    if (!editor && !(body.on && ph.created_by === me.id)) return fail(res, 403, 'forbidden'); // родич може попросити впізнати своє щойно завантажене фото
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
  if (op === 'route.save' || op === 'route.del') { // «Сімейні маршрути»: створити може кожен родич; змінити — автор, редактор або власник
    const before = await cfgGet('routes'); let v = Array.isArray(before) ? before.slice() : [];
    const id = S(body.id, 20), cur = v.find(x => x.id === id);
    if (cur && cur.by !== me.id && !editor) return fail(res, 403, 'forbidden');
    if (op === 'route.del') { if (!cur) return fail(res, 404, 'not_found'); v = v.filter(x => x.id !== id); }
    else {
      const num = (x, a, b) => { const n = Number(x); return Number.isFinite(n) && n >= a && n <= b ? Math.round(n * 1e6) / 1e6 : null; };
      const pts = (Array.isArray(body.pts) ? body.pts : []).slice(0, 60).map(q => ({ id: S(q?.id, 20) || rid(), la: num(q?.la, -90, 90), lo: num(q?.lo, -180, 180), name: S(q?.name, 120), kind: ['home', 'school', 'work', 'church', 'grave', 'war', 'other'].includes(q?.kind) ? q.kind : 'other', people: (Array.isArray(q?.people) ? q.people : []).map(x => S(x, 60)).filter(Boolean).slice(0, 20), story: S(q?.story, 3000), yr: S(q?.yr, 40), media: (Array.isArray(q?.media) ? q.media : []).map(x => /^[0-9a-f-]{36}$/.test(String(x?.p || '')) ? { p: x.p } : /^[\w-]{11}$/.test(String(x?.yt || '')) ? { yt: x.yt } : null).filter(Boolean).slice(0, 20) })).filter(q => q.la != null && q.lo != null && q.name);
      const it = { title: S(body.title, 120), intro: S(body.intro, 2000), pts };
      if (!it.title) return fail(res, 400, 'empty');
      if (cur) Object.assign(cur, it, { upd: new Date().toISOString(), updBy: me.id });
      else { if (v.length >= 200) return fail(res, 400, 'full'); v.push({ id: rid(), ...it, by: me.id, at: new Date().toISOString() }); }
    }
    await cfgSet('routes', v, me.id, before); return done({ routes: v, id: id || v[v.length - 1]?.id }, 'route:' + id);
  }
  if (op === 'word.save' || op === 'word.del') { // «Наші слова» — говірка: записати слово може кожен родич; змінити — автор або власник
    const before = await cfgGet('words'); let v = Array.isArray(before) ? before.slice() : [];
    const id = S(body.id, 20), cur = v.find(x => x.id === id);
    if (cur && cur.by !== me.id && !can(me, 'owner')) return fail(res, 403, 'forbidden');
    if (op === 'word.del') { if (!cur) return fail(res, 404, 'not_found'); v = v.filter(x => x.id !== id); }
    else {
      const it = { w: S(body.w, 80), m: S(body.m, 1000), ex: S(body.ex, 500), pl: S(body.pl, 120) };
      if (!it.w || !it.m) return fail(res, 400, 'empty');
      if (cur) Object.assign(cur, it, { upd: new Date().toISOString() });
      else { if (v.length >= 3000) return fail(res, 400, 'full'); v.push({ id: rid(), ...it, by: me.id, at: new Date().toISOString() }); }
    }
    await cfgSet('words', v, me.id, before); return done({ words: v }, 'words');
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
      for (const k of ['src', 'links', 'dna', 'pc', 'war', 'rel']) if (cur.data[k] && !body.data.hasOwnProperty(k)) data[k] = cur.data[k];
      const [row] = await db.update('persons', { eq: { id: cur.id, version: cur.version } }, { data, version: cur.version + 1, updated_by: me.id, updated_at: new Date().toISOString() });
      if (!row) return fail(res, 409, 'conflict');
      await revision('person', cur.id, 'update', cur.data, data, me.id);
      return done({ person: { id: row.id, ...row.data, v: row.version, last: { by: me.id, at: row.updated_at, action: 'update' } } }, cur.id);
    }
    // можливо, ця людина вже є в дереві — спершу перепитати (body.force — «Ні, це інша людина»)
    if (!body.force) { const dd = await findDupes(data); if (dd.length) return send(res, 409, { error: 'dupe', dupes: dd.slice(0, 5).map(p => p.id) }); }
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
    const r = await mergePersons(S(body.keep, 60), S(body.drop, 60), me.id);
    if (r.error) return fail(res, r.error === 'not_found' ? 404 : 400, r.error);
    return done(r, r.keep);
  }
  if (op === 'dup.no') { // «Це різні люди» — більше не показувати попередження про цю пару
    if (!editor) return fail(res, 403, 'forbidden');
    const a = S(body.a, 60), b = S(body.b, 60); if (!a || !b || a === b) return fail(res, 400, 'bad');
    const before = await notDup(), v = [...new Set([...before, pairKey(a, b)])].slice(-2000);
    await db.upsert('settings', { key: 'not_dup', value: v, updated_by: me.id, updated_at: new Date().toISOString() }); await revision('setting', 'not_dup', 'update', null, { add: pairKey(a, b) }, me.id);
    return done({ notDup: v }, 'person:' + a);
  }

  if (op === 'person.portrait') {
    if (!editor) return fail(res, 403, 'forbidden');
    const cur = await db.get('persons', { eq: { id: S(body.id, 60), deleted: false } });
    const ph = await db.get('photos', { eq: { id: S(body.photo, 60), deleted: false } });
    if (!cur || !ph || (ph.person_id !== cur.id && !((await cfgGet('photo_people')) || {})[ph.id]?.includes(cur.id))) return fail(res, 404, 'not_found'); // своє фото або фото, де людину позначено
    const nd = cleanPerson({ ...cur.data, portrait: ph.id, pc: body.pc && typeof body.pc === 'object' ? { ...body.pc, id: ph.id } : null });
    const [row] = await db.update('persons', { eq: { id: cur.id } }, { data: nd, version: cur.version + 1, updated_by: me.id, updated_at: new Date().toISOString() });
    await revision('person', cur.id, 'update', cur.data, nd, me.id);
    return done({ person: { id: row.id, ...row.data, v: row.version } }, cur.id);
  }

  /* ── подружжя ── */
  if (op === 'person.link') { // прив'язати НАЯВНУ картку як батька / матір / дитину / брата чи сестру (лише порожні поля)
    if (!editor) return fail(res, 403, 'forbidden');
    const kind = S(body.kind, 20), bid = S(body.base, 60), oid = S(body.other, 60);
    if (!bid || !oid || bid === oid || !['father', 'mother', 'child', 'sibling'].includes(kind)) return fail(res, 400, 'bad');
    const base = await db.get('persons', { eq: { id: bid, deleted: false } }), oth = await db.get('persons', { eq: { id: oid, deleted: false } });
    if (!base || !oth) return fail(res, 404, 'not_found');
    let tgt, set = {};
    if (kind === 'father') { tgt = base; set.f = oid; }
    else if (kind === 'mother') { tgt = base; set.mo = oid; }
    else if (kind === 'child') { tgt = oth; const isF = base.data.sex === 'f' || (base.data.sex !== 'm' && oth.data.f && !oth.data.mo); set[isF ? 'mo' : 'f'] = bid;
      const us = (await db.list('unions', { eq: { deleted: false } })).filter(u => u.a === bid || u.b === bid);
      if (us.length === 1) { const sp = us[0].a === bid ? us[0].b : us[0].a; const k2 = isF ? 'f' : 'mo'; if (!oth.data[k2] && sp !== oid) set[k2] = sp; } }
    else { tgt = oth; if (base.data.f) set.f = base.data.f; if (base.data.mo) set.mo = base.data.mo; }
    const ch = {}; for (const [k, v] of Object.entries(set)) { if (!v || v === tgt.id) continue; if (tgt.data[k] && tgt.data[k] !== v) { if (kind !== 'child' || k === (base.data.sex === 'f' ? 'mo' : 'f')) return fail(res, 409, 'has_parent'); continue; } if (!tgt.data[k]) ch[k] = v; }
    if (!Object.keys(ch).length) return done({ ok: true, same: true }, tgt.id);
    const data = { ...tgt.data, ...ch }; if (!(data.fam || []).length) data.fam = base.data.fam || [];
    await db.update('persons', { eq: { id: tgt.id } }, { data, updated_by: me.id, version: (tgt.version || 1) + 1, updated_at: new Date().toISOString() });
    await revision('person', tgt.id, 'update', tgt.data, data, me.id);
    return done({ ok: true }, tgt.id);
  }
  if (op === 'union.add') {
    if (!editor) return fail(res, 403, 'forbidden');
    const a = S(body.a, 60), b = S(body.b, 60);
    if (!a || !b || a === b) return fail(res, 400, 'bad');
    const u = { id: 'u_' + slugId().slice(2), a, b, date: S(body.date, 40), created_by: me.id };
    await db.insert('unions', u); await revision('union', u.id, 'create', null, u, me.id);
    return done({ union: { id: u.id, a, b, date: u.date } }, a);
  }
  if (op === 'union.date') { // дата шлюбу вже наявного зв'язку (можна без року: «16.10»)
    if (!editor) return fail(res, 403, 'forbidden');
    const u = await db.get('unions', { eq: { id: S(body.id, 60) } }); if (!u || u.deleted) return fail(res, 404, 'not_found');
    const date = S(body.date, 40);
    await db.update('unions', { eq: { id: u.id } }, { date }); await revision('union', u.id, 'update', { date: u.date }, { date }, me.id);
    return done({ union: { id: u.id, a: u.a, b: u.b, date } }, u.a);
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
    const marks = (Array.isArray(body.marks) ? body.marks : []).slice(0, 8).map(m => ({ p: Math.max(0, Math.min(n - 1, parseInt(m.p) || 0)), x: f(m.x), y: f(m.y), w: f(m.w), h: f(m.h), ...(m.t ? { t: String(m.t).slice(0, 60) } : {}) })).filter(m => m.w > 0.005 && m.h > 0.003);
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
    else if (/^hyp:[\w:.-]{1,70}$/.test(target)) open = true;
    else if (/^rt:[\w-]{1,20}$/.test(target)) open = (await cfgGet('routes')).some(x => x.id === target.slice(3)); // спогади до сімейного маршруту
    else if (/^iv:[\w-]{1,60}$/.test(target)) open = !!(await db.get('persons', { eq: { id: target.slice(3), deleted: false } })); // відповіді на «Питання для розмови» — кожен родич // «Припущення»: підтвердити, спростувати чи доповнити може кожен родич
    if (!open && !(await canAddTo(me, target))) return fail(res, 403, 'branch');
    // «Припущення»: остаточне рішення [ok] (підтверджено) / [ko] (спростовано) — лише власник; родичі голосують [yes]/[no]/[add]
    const fin = /^hyp:/.test(target) && (/^\[(ok|ko)\]/.exec(text) || [])[1];
    if (fin && !owner) return fail(res, 403, 'forbidden');
    const [s] = await db.insert('stories', { target, text, created_by: me.id });
    await revision('story', s.id, 'create', null, { target, text }, me.id);
    if (fin === 'ok') { // підтвердження власника одразу міняє дерево: картка більше не «гіпотеза», шлюб — підтверджений
      const k = target.slice(4), when = new Date().toISOString().slice(0, 10).split('-').reverse().join('.');
      if (/^pt:/.test(k)) { const p = await db.get('persons', { eq: { id: k.slice(3), deleted: false } }); if (p?.data?.hyp) { const data = cleanPerson({ ...p.data, hyp: false }); await db.update('persons', { eq: { id: p.id } }, { data, version: p.version + 1, updated_by: me.id, updated_at: new Date().toISOString() }); await revision('person', p.id, 'update', p.data, data, me.id); } }
      if (/^u:/.test(k)) { const u = await db.get('unions', { eq: { id: k.slice(2), deleted: false } }); if (u && /не підтвердж/i.test(u.date || '')) { await db.update('unions', { eq: { id: u.id } }, { date: 'підтверджено родиною ' + when }); await revision('union', u.id, 'update', { date: u.date }, { date: 'підтверджено родиною ' + when }, me.id); } }
    }
    return done({ story: { id: s.id, target, text, by: me.id, at: s.created_at } }, target);
  }
  if (op === 'story.delete') {
    const s = await db.get('stories', { eq: { id: S(body.id, 60) } }); if (!s) return fail(res, 404, 'not_found');
    if (!owner && s.created_by !== me.id) return fail(res, 403, 'forbidden');
    await db.update('stories', { eq: { id: s.id } }, { deleted: true }); await revision('story', s.id, 'delete', s, null, me.id);
    return done({ ok: true }, s.target);
  }

  /* ── фото ── */
  if (op === 'photo.faces') { // де на фото чиє обличчя: {pid: {x,y,s,r}} — частки зображення (квадрат); лише позначені на фото люди
    const p = await db.get('photos', { eq: { id: S(body.id, 60), deleted: false } }); if (!p) return fail(res, 404, 'not_found');
    if (!editor && p.created_by !== me.id) return fail(res, 403, 'forbidden');
    const allowed = new Set([p.person_id, ...(((await cfgGet('photo_people')) || {})[p.id] || [])]);
    const n = v => Math.round(Math.max(0, Math.min(1, Number(v) || 0)) * 1e4) / 1e4, f = {};
    for (const [pid, b] of Object.entries(body.faces && typeof body.faces === 'object' ? body.faces : {}).slice(0, 40)) if (allowed.has(pid) && b && typeof b === 'object' && n(b.s) >= 0.01) f[pid] = { x: n(b.x), y: n(b.y), s: n(b.s), r: Math.round(Math.max(0.05, Math.min(20, Number(b.r) || 1)) * 1e4) / 1e4 };
    const before = await cfgGet('photo_faces'), v = { ...before };
    if (Object.keys(f).length) v[p.id] = f; else delete v[p.id];
    await cfgSet('photo_faces', v, me.id, before); return done({ photoFaces: v }, 'photo:' + p.id);
  }
  if (op === 'photo.people') { // хто на фото: позначені люди з дерева (фото з'являється і в їхніх картках)
    const p = await db.get('photos', { eq: { id: S(body.id, 60), deleted: false } }); if (!p) return fail(res, 404, 'not_found');
    if (!editor && p.created_by !== me.id) return fail(res, 403, 'forbidden');
    const ids = [...new Set((Array.isArray(body.people) ? body.people : []).map(x => S(x, 60)).filter(Boolean))].slice(0, 40);
    const ok = new Set((await db.list('persons', { eq: { deleted: false }, select: 'id' })).map(x => x.id));
    const keep = ids.filter(x => ok.has(x) && x !== p.person_id);
    const before = await cfgGet('photo_people'), v = { ...before };
    if (keep.length) v[p.id] = keep; else delete v[p.id];
    await cfgSet('photo_people', v, me.id, before);
    // позначеним людям без головного фото це фото стає головним (як перше фото в картці)
    const persons = []; const pend = (await pendGet()) || {};
    if (!pend[p.id] && /^image\//.test(p.mime || 'image/')) for (const pid of keep) {
      const cur = await db.get('persons', { eq: { id: pid, deleted: false } }); if (!cur || cur.data.portrait) continue;
      const nd = { ...cur.data, portrait: p.id };
      const [row] = await db.update('persons', { eq: { id: cur.id } }, { data: nd, version: cur.version + 1, updated_by: me.id, updated_at: new Date().toISOString() });
      await revision('person', cur.id, 'update', cur.data, nd, me.id); persons.push({ id: row.id, ...row.data, v: row.version });
    }
    return done({ photoPeople: v, persons }, 'photo:' + p.id);
  }
  if (op === 'photo.caption') {
    const p = await db.get('photos', { eq: { id: S(body.id, 60), deleted: false } }); if (!p) return fail(res, 404, 'not_found');
    if (!editor && p.created_by !== me.id) return fail(res, 403, 'forbidden');
    await db.update('photos', { eq: { id: p.id } }, { caption: S(body.caption, 500) }); await revision('photo', p.id, 'update', { caption: p.caption }, { caption: S(body.caption, 500) }, me.id);
    return done({ ok: true }, p.person_id);
  }
  if (op === 'photo.delete') {
    const p = await db.get('photos', { eq: { id: S(body.id, 60), deleted: false } }); if (!p) return fail(res, 404, 'not_found');
    if (!owner) return fail(res, 403, 'forbidden'); // видаляти фото й голоси — лише власник сайту
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
  if (op === 'fix.add') { // родич пропонує правку картки (поля, нові рідні, дублікат) — вносить власник одним кліком
    const cur = await db.get('persons', { eq: { id: S(body.person, 60), deleted: false } }); if (!cur) return fail(res, 404, 'not_found');
    const pt = body.patch && typeof body.patch === 'object' ? body.patch : {}, ch = {};
    for (const k of Object.keys(FIXK)) { if (!(k in pt)) continue; let v = S(pt[k], FIXN[k]); if (k === 'sex' && !['m', 'f', ''].includes(v)) continue; const old = String(cur.data[k] ?? ''); if (v !== old) ch[k] = [old, v]; }
    const add = (Array.isArray(body.add) ? body.add : []).slice(0, 12).map(x => ({ rel: S(x?.rel, 10), s: S(x?.s, 80), n: S(x?.n, 80), pt: S(x?.pt, 80), m: S(x?.m, 80), b: S(x?.b, 40) })).filter(x => FIXREL[x.rel] && x.n);
    let dup = S(body.dup, 60); if (dup && (dup === cur.id || !(await db.get('persons', { eq: { id: dup, deleted: false } })))) dup = '';
    const why = S(body.text, 5000), any = Object.keys(ch).length || add.length || dup;
    if (!any && !why) return fail(res, 400, 'empty');
    const it = { person: cur.id, ch, add, dup, why, at: new Date().toISOString() };
    if (owner && body.apply) { // власник — одразу
      const r = await applyFix(it, null, S(body.keep, 60), me); if (r.error) return fail(res, r.error === 'conflict' ? 409 : 400, r.error);
      return done({ ok: true, made: r.made, keep: r.keep }, cur.id);
    }
    const open = await db.list('questions', { eq: { created_by: me.id, status: 'new', deleted: false }, limit: 60 });
    if (open.length >= 50) return fail(res, 429, 'too_many_q');
    const text = fixText(it).slice(0, 5000);
    const [q] = await db.insert('questions', { kind: 'fix', person_id: cur.id, about: '', text, status: 'new', answer: '', deleted: false, created_by: me.id, created_at: it.at, updated_at: it.at });
    if (any) { const fp = await fixGet(); fp[q.id] = it; await fixSet(fp, me.id); }
    await revision('question', q.id, 'create', null, { kind: 'fix', person: cur.id, ch, add, dup, text: why }, me.id);
    return done({ question: { ...qOut(q), ...(any ? { patch: ch, padd: add, pdup: dup } : {}), pst: '' } }, cur.id);
  }
  if (op === 'fix.apply' || op === 'fix.reject') { // власник: внести вибране / відхилити
    if (!owner) return fail(res, 403, 'forbidden');
    const q = await db.get('questions', { eq: { id: S(body.id, 60), deleted: false } }); if (!q) return fail(res, 404, 'not_found');
    const fp = await fixGet(), it = fp[q.id]; if (!it || it.st) return fail(res, 409, 'done');
    const now = new Date().toISOString(); let answer = S(body.answer, 8000), keys = [], made = [];
    if (op === 'fix.apply') {
      const mem = await db.get('members', { eq: { id: q.created_by } }).catch(() => null);
      const r = await applyFix({ ...it, author: mem?.name || '' }, Array.isArray(body.keys) ? body.keys.map(k => S(k, 20)) : null, S(body.keep, 60), me);
      if (r.error) return fail(res, r.error === 'conflict' ? 409 : 400, r.error);
      keys = r.keys; made = r.made;
      answer ||= 'Дякуємо! Внесено в дерево' + (keys.length < fixKeys(it).length ? ' (частково)' : '') + '.';
    } else answer ||= 'Переглянули й поки не вносимо.';
    fp[q.id] = { ...it, st: op === 'fix.apply' ? 'ok' : 'no', keys, made, done: now, by: me.id }; await fixSet(fp, me.id);
    const [row] = await db.update('questions', { eq: { id: q.id } }, { status: 'closed', answer, updated_by: me.id, updated_at: now });
    await revision('question', q.id, 'update', { status: q.status }, { status: 'closed', fix: fp[q.id].st, keys }, me.id);
    return done({ question: { ...qOut(row), patch: it.ch, padd: it.add || [], pdup: it.dup || '', pst: fp[q.id].st, pkeys: keys } }, it.person);
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
