/* Наш родовід (сайт роду Шутих) — інтерфейс. Ванільний JS, стан у S, render() перебудовує #app.
   Усі дані — лише через /api (сесія в HttpOnly-cookie). Жодних ключів і прямих звернень до бази. */
(function () {
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { me: null, data: null, view: 'tree', arg: null, ui: {}, admin: {} };
/* Нова версія сайту: раз на 5 хв і при поверненні на вкладку звіряємо /version.json; якщо змінилась — смужка «Оновити» */
const BUILD = '202610222206';
async function checkUpdate() {
  if (BUILD === 'dev' || document.querySelector('.updbar')) return;
  try { const r = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store', credentials: 'same-origin' }); const j = await r.json();
    if (j.v && j.v !== BUILD) document.body.insertAdjacentHTML('beforeend', `<div class="updbar" role="status"><span>Вийшло оновлення сайту</span><button class="btn small" data-act="upd-reload">Оновити</button></div>`);
  } catch {}
}
setInterval(checkUpdate, 300000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate(); });
let P = {}, KIDS = {}, SPOUSES = {}, FAM = {};

/* ───── API ───── */
async function api(path, opts = {}) {
  const r = await fetch(path, { method: opts.method || (opts.body || opts.raw ? 'POST' : 'GET'), headers: opts.raw ? { 'content-type': 'application/octet-stream' } : opts.body ? { 'content-type': 'application/json' } : {}, body: opts.raw || (opts.body ? JSON.stringify(opts.body) : undefined), credentials: 'same-origin' });
  let j = {}; try { j = await r.json(); } catch {}
  if (r.status === 401 && !opts.noRedirect) { S.me = null; render(); }
  if (!r.ok) { const e = new Error(j.error || 'http_' + r.status); e.status = r.status; e.data = j; throw e; }
  return j;
}
const ERR = { wrong: 'Невірна пошта або пароль.', too_many: 'Забагато спроб. Зачекайте 15 хвилин.', weak: 'Пароль має бути не коротший за 8 символів.', invalid: 'Посилання недійсне або вже використане. Попросіть Максима надіслати нове.', conflict: 'Хтось щойно змінив цю картку. Оновіть сторінку й спробуйте ще раз.', forbidden: 'У вас немає прав на цю дію.', exists: 'Людина з такою поштою вже має доступ.', email: 'Перевірте адресу пошти.', too_large: 'Файл завеликий (до 4 МБ).', type: 'Підходять фото JPG, PNG, WEBP або PDF.', token: 'Невірний код налаштування.', name: 'Вкажіть хоча б ім\'я або прізвище.', branch: 'Доповнювати можна лише свою гілку: себе, батьків, дітей, братів і сестер.', empty: 'Напишіть кілька слів.', pending: 'Вашу заявку ще розглядають. Щоб швидше — напишіть Максиму, що ви зареєструвалися. Щойно він прийме заявку, увійдете з цією поштою й паролем.', exists_login: 'З цією поштою вже є доступ — просто увійдіть.', parents: 'Вкажіть хоча б батька або матір — так ми знайдемо вас у дереві.', invalid_join: 'Посилання для реєстрації недійсне або вимкнене. Попросіть у Максима нове.', bad_person: 'Такої картки немає в дереві.', about: 'Вкажіть, кого шукаємо: ім\'я, роки, село.', too_many_q: 'У вас уже багато нових запитань — зачекайте відповіді на них.' };
const errText = e => ERR[e.message] || 'Не вдалося. Спробуйте ще раз.';
function toastUndo(t, fn) { const d = document.createElement('div'); d.className = 'toast tundo'; d.innerHTML = `<span>${esc(t)}</span><button type="button">Скасувати</button>`; d.querySelector('button').onclick = () => { d.remove(); fn(); }; document.body.appendChild(d); setTimeout(() => d.remove(), 8000); }
function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2600); }

/* ───── Аналітика переглядів ───── */
const Q = []; let lastAct = Date.now(), curTarget = null;
const flush = () => { if (!Q.length || !S.me) return; const events = Q.splice(0, 20); fetch('/api/track', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events }), keepalive: true, credentials: 'same-origin' }).catch(() => {}); };
const ev = (type, view, target, ms) => { Q.push({ type, view, target, ms }); if (Q.length >= 10) flush(); };
['pointerdown', 'keydown', 'scroll', 'mousemove', 'touchstart'].forEach(t => addEventListener(t, () => { lastAct = Date.now(); }, { passive: true }));
setInterval(() => { if (S.me && document.visibilityState === 'visible' && Date.now() - lastAct < 120000) ev('beat', S.view, curTarget, 20000); flush(); }, 20000);
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

/* ───── Дані ───── */
function index() {
  const d = S.data; P = {}; KIDS = {}; SPOUSES = {}; FAM = {};
  d.persons.forEach(p => { P[p.id] = p; });
  d.persons.forEach(p => [p.f, p.mo].forEach(x => { if (x && P[x]) (KIDS[x] ||= []).push(p.id); }));
  d.unions.forEach(u => { if (P[u.a] && P[u.b]) { (SPOUSES[u.a] ||= []).push({ id: u.b, date: u.date, u: u.id }); (SPOUSES[u.b] ||= []).push({ id: u.a, date: u.date, u: u.id }); } });
  Object.values(KIDS).forEach(l => l.sort(byBirth));
  d.families.forEach(f => { FAM[f.id] = f; });
  PVER = {}; d.photos.forEach(x => { if (x.ver?.orig && x.ver.at) PVER[x.id] = Date.parse(x.ver.at).toString(36); });
  // покоління відносно Максима: батьки +1, діти −1, подружжя — те саме
  GEN = {}; const r = rootId(); if (r) { GEN[r] = 0; const q = [r]; while (q.length) { const id = q.shift(), g = GEN[id], p = P[id];
    const step = (x, v) => { if (x && P[x] && GEN[x] === undefined) { GEN[x] = v; q.push(x); } };
    step(p.f, g + 1); step(p.mo, g + 1); (KIDS[id] || []).forEach(k => step(k, g - 1)); (SPOUSES[id] || []).forEach(s => step(s.id, g)); } }
}
let GEN = {};
const GENNAME = g => g === 0 ? 'Покоління Максима' : g === 1 ? 'Покоління батьків' : g === 2 ? 'Покоління дідів' : g === 3 ? 'Прадіди' : g === 4 ? 'Прапрадіди' : g > 4 ? `${g - 2}-ті прадіди` : g === -1 ? 'Діти' : g === -2 ? 'Онуки' : 'Нащадки';
async function load() { S.data = await api('/api/data'); index(); }
const yearOf = s => { const m = String(s || '').match(/(\d{4})/); return m ? (String(s).trim().startsWith('~') ? '≈' : '') + m[1] : ''; };
const life = p => { const b = yearOf(p.b), d = yearOf(p.d); return d ? `${b || '?'}–${d}` : p.dead ? `${b || '?'}–†` : b ? `н. ${b}` : ''; };
const maidenOf = p => p && p.m ? p.m : ''; // дівоче прізвище — у дужках після теперішнього, всюди
const full = p => [p.n, p.pt, p.s].filter(Boolean).join(' ') + (maidenOf(p) ? ` (${maidenOf(p)})` : '');
const short = p => ([p.n, p.s].filter(Boolean).join(' ') || '(без імені)') + (maidenOf(p) ? ` (${maidenOf(p)})` : '');
const byBirth = (a, b) => (yearOf(P[a]?.b).replace('≈', '') || '9999').localeCompare(yearOf(P[b]?.b).replace('≈', '') || '9999');
const genN = n => /ія$/.test(n) ? n.slice(0, -1) + 'ї' : /я$/.test(n) ? n.slice(0, -1) + 'і' : /[гкхжчшщ]а$/.test(n) ? n.slice(0, -1) + 'и' : /а$/.test(n) ? n.slice(0, -1) + 'и' : /й$/.test(n) ? n.slice(0, -1) + 'я' : /о$/.test(n) ? n.slice(0, -1) + 'а' : /ь$/.test(n) ? n.slice(0, -1) + 'я' : n + 'а'; // родовий відмінок імені
const ucU = s => /не підтвердж/i.test(s?.date || ''); // зв'язок без підтвердженого шлюбу
const ucLabel = (pid, s) => { const kids = (KIDS[pid] || []).filter(k => P[k] && [P[k].f, P[k].mo].includes(s.id)); const o = P[s.id]; const role = o?.sex === 'f' ? 'мати' : 'батько';
  return kids.length ? `${role} ${kids.map(k => (P[k].sex === 'f' ? 'доньки ' : 'сина ') + genN(String(P[k].n || '').replace(/\s*\(.*?\)/, ''))).join(', ')}, шлюб не підтверджено` : 'шлюб не підтверджено'; };
const srcSite = u => /familysearch\.org/.test(u) ? 'FamilySearch' : /pamyat-naroda\.ru/.test(u) ? '«Память народа» (документи Другої світової)' : /obd-memorial/.test(u) ? 'ОБД «Мемориал»' : (String(u).match(/^https?:\/\/(?:www\.)?([^/]+)/) || [])[1] || '';
const img = (q, thumb) => { const m = /^photo=([^&]+)/.exec(q), r = m && PVER[decodeURIComponent(m[1])]; return `/api/file?${q}${thumb ? '&thumb=1' : ''}${r ? '&r=' + r : ''}`; }; // r — фото замінили обробленою версією: нова адреса, щоб браузер не показував старе з кешу
let PVER = {};
const portrait = p => p.portrait ? img('photo=' + encodeURIComponent(p.portrait), true) : null;
const pcOf = p => p.pc && p.pc.id === p.portrait && p.pc.s > 0 ? p.pc : null; // кадр обличчя для головного фото
const pcStyle = c => c ? ` class="pcrop" style="width:${(100 / c.s).toFixed(3)}%!important;height:auto!important;left:${(-c.x / c.s * 100).toFixed(3)}%;top:${(-c.y * c.r / c.s * 100).toFixed(3)}%"` : '';
const pimg = (p, extra = '') => { const u = portrait(p); return u ? `<img src="${u}" alt="" loading="lazy"${pcStyle(pcOf(p))}${extra}>` : ''; };
const ph = p => { const u = portrait(p); return `<span class="ph">${u ? pimg(p) : esc((p.n || '?')[0])}</span>`; };
const canEdit = () => S.me && (S.me.role === 'editor' || S.me.role === 'owner');
const isOwner = () => S.me && S.me.role === 'owner';
// глядач доповнює лише свою гілку (сервер перевіряє те саме)
function canAdd(target) {
  if (canEdit()) return true; const me = S.me?.person_id; if (!me || !P[me] || !target) return false;
  if (target.startsWith('fam:')) return (FAM[target.slice(4)]?.members || []).includes(me);
  const p = P[me], set = new Set([me, p.f, p.mo, ...(KIDS[me] || []), ...(SPOUSES[me] || []).map(s => s.id)]);
  for (const x of [p.f, p.mo]) if (x) (KIDS[x] || []).forEach(k => set.add(k));
  return set.has(target);
}
const noAdd = '<p class="small muted">Доповнювати можна свою картку та найближчих: батьків, дітей, братів і сестер, чоловіка чи дружину.</p>';
const who = id => S.data?.names?.[id] || 'Родич';
const when = t => t ? new Date(t).toLocaleString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const rootId = () => (Object.values(P).find(p => p.root) || {}).id;
// З кого починати дерево: людина, яка увійшла (якщо прив'язана до картки), інакше — наймолодший у корені
const startId = () => { const me = S.me?.person_id; if (me && P[me]) return me; const r0 = rootId(); return (KIDS[r0] || []).slice().sort(byBirth).reverse()[0] || r0; };
const href = (v, a) => '#/' + v + (a ? '/' + encodeURIComponent(a) : '');
const mini = id => { const p = P[id]; if (!p) return ''; return `<a class="mini${p.hyp ? ' hyp' : ''}" href="${href('p', id)}">${ph(p)}<span><b>${esc(short(p))}</b><em>${esc(life(p))} ${relBadge(p, 1)}</em></span></a>`; };

/* ───── Маршрути ───── */
function parse() {
  const h = location.hash.replace(/^#\/?/, ''); const [v, a] = h.split('/');
  S.view = v || 'home'; S.arg = a ? decodeURIComponent(a) : null;
}
addEventListener('hashchange', () => { parse(); if (S.view === 'p') { S.ui.pp = null; S.ui.ppHist = []; } render(); window.scrollTo(0, 0); });

/* ───── Шапка ───── */
function top() {
  const nav = [['home', 'Головна'], ['tree', 'Дерево'], ['families', 'Історія роду'], ['villages', 'Історія сіл'], ['people', 'Люди'], ['docs', 'Архів'], ['maps', 'Карти'], ['hyp', 'Припущення'], ['q', 'Запитання й уточнення']];
  const cur = S.view === 'p' ? 'people' : S.view === 'fam' ? 'families' : S.view;
  const qb = qBadge() || 0, jb = isOwner() ? (S.data?.joinPending || 0) + (S.data?.photoPending || 0) : 0;
  const me = { n: String(S.me.name || S.me.email || '?').split(/\s+/)[0], s: String(S.me.name || '').split(/\s+/)[1] || '' };
  return `<header class="top"><div class="wrap topw">
    <a class="brand" href="#/home" title="Наш родовід: ${SURN.join(', ')}"><span class="br-t">Наш родовід<span class="br-c">:</span></span><small class="br-s"><span>${SURN.slice(0, 3).join(' · ')} ·</span> <span>${SURN.slice(3).join(' · ')}</span></small></a>
    <nav class="nav" aria-label="Розділи">${nav.map(([k, t]) => `<a href="${href(k)}"${k === 'q' ? ' class="nav-q"' : k === 'families' || k === 'villages' ? ' class="nav-hist"' : ''}${cur === k ? ' aria-current="page"' : ''}${k === 'q' ? ` title="Запитання й уточнення: бачите помилку чи знаєте щось — напишіть${qb ? '. Нових: ' + qb : ''}"` : ''}>${k === 'q' ? 'Запитання<span class="nq-l">&nbsp;й уточнення</span>' : t}${k === 'q' && qb ? `<i class="nq-b" aria-label="нових: ${qb}">${qb}</i>` : ''}</a>`).join('')}</nav>
    <div class="who"><a class="tic" href="#/people" data-act="gsearch" title="Знайти людину" aria-label="Пошук">${IC.search}</a>
      <details class="umenu"><summary class="uav" title="${esc(S.me.name || S.me.email || '')}"><span class="av sm">${esc(initials(me))}</span>${qb + jb ? `<i class="bn-badge">${qb + jb}</i>` : ''}<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></summary>
        <div class="um-b"><div class="um-n">${esc(S.me.name || '')}<span>${esc(S.me.email || '')}</span></div>
          <a href="${href('q')}"${cur === 'q' ? ' aria-current="page"' : ''}>Запитання${qb ? ` <b class="nb">${qb}</b>` : ''}</a>
          ${isOwner() ? `<a href="${href('admin')}"${cur === 'admin' ? ' aria-current="page"' : ''}>Власнику${jb ? ` <b class="nb">${jb}</b>` : ''}</a>` : ''}
          <button type="button" data-act="logout">Вийти</button></div></details></div>
  </div></header>${mNav(cur)}`;
}
/* ───── Пристрої учасника: що за телефон/комп'ютер, звідки, коли; вийти з окремого ───── */
function uaName(ua) {
  ua = String(ua || ''); if (!ua) return 'Невідомий пристрій';
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? ((ua.match(/Android[^;)]*;\s*([^;)]+?)(?:\s+Build|\))/) || [])[1] || 'Android') : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Пристрій';
  const br = /Telegram/.test(ua) ? 'Telegram' : /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /YaBrowser/.test(ua) ? 'Яндекс' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : /Claude|Electron/.test(ua) ? 'програма' : 'браузер';
  return os + ' · ' + br;
}
function devRows(x) {
  const own = x.id === S.me.id, L = x.sessions.devices || [];
  return `<tr class="devrow"><td colspan="5"><div class="devs">${L.map(d => `<div class="dev${d.cur ? ' cur' : ''}"><b>${esc(uaName(d.ua))}</b>${d.cur ? ' <span class="badge">цей пристрій</span>' : ''}<span class="small muted">IP ${esc(d.ip || '—')} · увійшов ${esc(when(d.created))} · востаннє ${esc(when(d.last))}</span>${d.cur ? '' : `<button class="btn line small" data-act="devout" data-id="${x.id}" data-dk="${esc(d.k)}">Вийти на цьому пристрої</button>`}</div>`).join('') || '<span class="muted small">Активних входів немає.</span>'}
    ${own && L.length > 1 ? `<button class="btn danger small" data-act="devothers" data-id="${x.id}">Вийти на всіх, крім цього пристрою</button>` : ''}
    <p class="small muted" style="margin:0">Пристрій — це кожен браузер, де виконано вхід. IP показує, звідки (мережа/місто). Якщо пристрій не ваш — «Вийти»; щоб туди не зайшли знову, змініть пароль.</p></div></td></tr>`;
}



/* «Про людину» не лише з дат: що кажуть документи (їхні описи) і що про людину написано в «Історії роду» */
function ridMentions(id) {
  const t = loadText('history'); if (!t || !t.md) return [];
  return t.md.split(/\n\s*\n/).filter(par => par.includes(`[[p:${id}|`) && !/^#/.test(par.trim()) && !/^\s*-\s/.test(par)).slice(0, 4);
}
/* опис людини починається з народження (вимога власника: усе по хронології) */
function birthPara(p, docs) {
  if (/^\s*(Народи|Нар\.|Хрещен)/i.test(p.note || '')) return '';
  const nm = String(p.n || '').replace(/\s*\(.*?\)/g, '').trim().slice(0, 3).toLowerCase();
  const bd = docs.find(d => { const w = (String(d.title || '').match(/^(?:Народження|Хрещення)[:\s]+([^\s,(]+)/) || [])[1]; return w && nm && w.toLowerCase().slice(0, 3) === nm; });
  const m = String(p.b || '').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/), y = String(p.b || '').match(/\d{4}/);
  const bs = String(p.b || '').trim(), rg = bs.match(/(\d{4})\s*[–-]\s*(\d{4})/);
  const when = m ? `${+m[1]} ${MONTHS_G[m[2] - 1]} ${m[3]} року` : rg ? `приблизно в ${rg[1]}–${rg[2]} роках` : /^\d{4}$/.test(bs) ? `${bs} року` : y ? `близько ${y[0]} року` : '';
  const par = [p.f, p.mo].filter(x => x && P[x]);
  if (!when && !par.length && !bd) return '';
  const v = p.sex === 'f' ? 'Народилася' : p.sex === 'm' ? 'Народився' : 'Народження:';
  const t = [when || p.bp ? `${v}${when ? ' ' + when : ''}${p.bp ? ` (${esc(p.bp)})` : ''}.` : '', par.length ? `${par.length > 1 ? 'Батьки' : P[par[0]].sex === 'f' ? 'Мати' : 'Батько'} — ${par.map(pLink).join(' і ')}.` : '', bd ? `<a href="#" class="doclink" data-doc="${bd.id}">${esc(bd.title.match(/^Хрещення/) ? 'Запис про хрещення' : 'Запис про народження')}</a>` : ''].filter(Boolean).join(' ');
  return t ? `<p class="about birth-p">${t}</p>` : '';
}
const docYear = d => +((String(d.date || d.title || '').match(/\d{4}/) || ['9999'])[0]);
function aboutMore(p, docs) {
  const plain = t => esc(String(t || '').replace(/\[\[[pd]:[a-z0-9_-]+\|([^\]]+)\]\]/gi, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|[^*])\*([^*]+)\*/g, '$1$2'));
  const ds = docs.filter(d => d.text || d.line).slice().sort((a, b) => docYear(a) - docYear(b)).slice(0, 8);
  const rid = ridMentions(p.id);
  return `${ds.length ? `<div class="abt-g"><h4>Що кажуть документи</h4>${ds.map(d => `<div class="abt-d"><a href="#" data-doc="${d.id}">${esc(d.title)}</a>${d.date || d.pages > 1 ? ` <span class="muted small mono">${esc([d.date, d.pages > 1 ? d.pages + ' стор.' : ''].filter(Boolean).join(' · '))}</span>` : ''}<p>${glossify(mdLinks(esc([d.text, d.line && d.line !== 'Весь бланк.' ? 'Запис: ' + d.line : ''].filter(Boolean).join(' '))))}</p></div>`).join('')}</div>` : ''}
    ${rid.length ? `<div class="abt-g"><h4>З «Історії роду»</h4>${rid.map(x => `<p>${glossify(plain(x))}</p>`).join('')}<a class="small" href="#/families">Читати всю історію →</a></div>` : ''}`;
}

/* ───── Новий вигляд: аватари з ініціалами, шапка дерева, бічна панель людини ───── */
const IC = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s6.5-6 6.5-11a6.5 6.5 0 0 0-13 0c0 5 6.5 11 6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M5 19 13 11"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0z"/></svg>',
  tree: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="5" r="2.2"/><circle cx="6" cy="18.5" r="2.2"/><circle cx="18" cy="18.5" r="2.2"/><path d="M12 7.2v5.3M6 16.3v-1.8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1.8"/></svg>',
  ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};
const initials = p => ((String(p.n || '').replace(/\s*\(.*?\)/g, '')[0] || '') + (String(p.s || '')[0] || '')).toUpperCase() || '?';
const avatar = (p, cls = '') => { const u = portrait(p); return `<span class="av ${cls}">${u ? pimg(p) : esc(initials(p))}</span>`; };
const years = p => { const b = yearOf(p.b), d = yearOf(p.d); return d ? `${b || '?'} – ${d}` : p.dead ? `${b || '?'} – †` : b || ''; };
// Можливі дублі: те саме правило, що sameMan() в api/_merge.js (міняти обидва разом)
const dNorm = x => String(x || '').toLowerCase().replace(/\s*\(.*?\)/g, '').replace(/[’ʼ`]/g, "'").replace(/ё/g, 'е').trim().split(/\s+/)[0] || '';
const dYr = x => (String(x || '').match(/\d{4}/) || [])[0] || '';
function sameMan(a, b) {
  if (!a || !b || a.id === b.id) return false;
  if ([a.f, a.mo].includes(b.id) || [b.f, b.mo].includes(a.id)) return false;
  const na = dNorm(a.n); if (!na || na !== dNorm(b.n)) return false;
  const sa = [a.s, a.m].map(dNorm).filter(Boolean), sb = [b.s, b.m].map(dNorm).filter(Boolean);
  if (!sa.length || !sa.some(x => sb.includes(x))) return false;
  if (a.sex && b.sex && a.sex !== b.sex) return false;
  if (a.pt && b.pt && dNorm(a.pt) !== dNorm(b.pt)) return false;
  if (dYr(a.d) && dYr(b.d) && dYr(a.d) !== dYr(b.d)) return false;
  if ((dYr(a.d) && dYr(b.b) && +dYr(a.d) < +dYr(b.b)) || (dYr(b.d) && dYr(a.b) && +dYr(b.d) < +dYr(a.b))) return false;
  const ya = dYr(a.b), yb = dYr(b.b); if (ya && yb) return ya === yb;
  return !!((a.f && a.f === b.f) || (a.mo && a.mo === b.mo));
}
const dupesOf = id => { const nd = new Set(S.data?.cfg?.notDup || []); return Object.values(P).filter(x => sameMan(P[id], x) && !nd.has([id, x.id].sort().join('|'))).map(x => x.id); };
const dupKeep = (a, b) => { const ph = id => S.data.photos.filter(x => x.person === id).length; return P[b].root || (P[b].portrait && !P[a].portrait) || (!!P[b].portrait === !!P[a].portrait && ph(b) > ph(a)) ? [b, a] : [a, b]; }; // головна — та, що з фото
function dupNote(id, small) {
  if (!canEdit()) return ''; const dd = dupesOf(id); if (!dd.length) return '';
  return dd.map(o => `<div class="dupnote${small ? ' sm' : ''}"><b>Можливо, це та сама людина</b>, що й <a href="${href('p', o)}">${esc(full(P[o]))}${years(P[o]) ? ' (' + esc(years(P[o])) + ')' : ''}</a>.
    <div class="btns">${isOwner() ? `<button class="btn small" data-act="dup-merge" data-a="${id}" data-b="${o}">Об'єднати</button>` : '<span class="small muted">Об\'єднати може Максим.</span>'}<button class="btn line small" data-act="dup-no" data-a="${id}" data-b="${o}">Це різні люди</button></div></div>`).join('');
}
const treeHead = () => '';
/* Діти, що померли малими: вік на момент смерті (до 15 років) — для позначки на дереві й опису */
function childAge(p) {
  if (!p || !p.d) return null;
  const D = s => { const m = String(s || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/); if (m) return new Date(+m[3], m[2] - 1, +m[1]); const y = String(s || '').match(/(\d{4})/); return y ? new Date(+y[1], 6, 1) : null; };
  const b = D(p.b), d = D(p.d); if (!b || !d || d < b) return null;
  const exact = /\d\.\d/.test(p.b || '') && /\d\.\d/.test(p.d || '');
  const days = Math.round((d - b) / 864e5); if (days > 15 * 365.25) return null;
  const pl = (n, a, b2, c) => { const m10 = n % 10, m100 = n % 100; return n + ' ' + (m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b2 : c); };
  let t;
  if (!exact) { const y = d.getFullYear() - b.getFullYear(); t = y < 1 ? 'до року' : 'близько ' + pl(y, 'року', 'років', 'років'); }
  else if (days < 31) t = pl(days, 'день', 'дні', 'днів');
  else if (days < 365) t = pl(Math.max(1, Math.round(days / 30.44)), 'місяць', 'місяці', 'місяців');
  else { const y = Math.floor(days / 365.25), mo = Math.round((days - y * 365.25) / 30.44); t = pl(y, 'рік', 'роки', 'років') + (mo ? ' ' + mo + ' міс.' : ''); }
  return { t, txt: (p.sex === 'f' ? 'Померла малою' : p.sex === 'm' ? 'Помер малим' : 'Померла дитина') + ', у віці ' + t + '.' };
}
/* Позначки достовірності картки: doc — є документ; mem — зі спогадів родичів; chk — потребує перевірки; окремо — суперечливі версії.
   Рахуються самі (документи, «Є припущення», «за словами…»), редактор може поставити вручну (p.rel.k) і описати суперечність (p.rel.c). */
const RELK = {
  doc: { t: 'Підтверджено документом', d: 'Є архівний документ (метрика, перепис, ЗАГС…), де записана ця людина.', i: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 2.5h7l3.5 3.5v11.5H5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7.5 11.2l2 2 3.8-4.2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
  mem: { t: 'Зі спогадів', d: 'Відомо зі слів родичів; документа поки немає.', i: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 4.5h14v9H9l-4 3v-3H3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="7" cy="9" r="1" fill="currentColor"/><circle cx="10" cy="9" r="1" fill="currentColor"/><circle cx="13" cy="9" r="1" fill="currentColor"/></svg>' },
  chk: { t: 'Потребує перевірки', d: 'Документа немає або зв\'язок — лише припущення. Шукаємо підтвердження.', i: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7.8 7.8a2.3 2.3 0 1 1 3.2 2.1c-.7.3-1 .8-1 1.5v.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="10" cy="14.4" r="1" fill="currentColor"/></svg>' },
  con: { t: 'Суперечливі версії', d: 'Джерела або спогади розходяться (дата, ім\'я, батьки…).', i: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 7h11M12 4l3 3-3 3M16 13H5M8 10l-3 3 3 3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
};
const CON_RX = /([^.!?\n]*(?:розбіжн|суперечн|за іншими даними|в інш(?:ому|их) (?:запис|документ|джерел)[а-яіїє]*\s+(?:—\s*)?(?:інш|вона|він|рік|дата)|інакше записан)[^.!?\n]*[.!?]?)/i;
function relOf(p) {
  if (!p) return null;
  const docs = S.data.documents.filter(d => (d.people || []).includes(p.id) && d.type !== 'map' && !d.maybe).length;
  let k = p.rel?.k, auto = !k;
  if (!k) { const note = String(p.note || ''), y = yN(p.b) || 0;
    k = p.hyp ? 'chk' : docs ? 'doc' : /за словами|спогад|переказ|розповіда|пам['’]ята/i.test(note) || y >= 1925 ? 'mem' : 'chk'; }
  const c = p.rel?.c || (String(p.note || '').match(CON_RX)?.[1] || '').trim();
  return { k, auto, docs, c };
}
// sm — лише іконка (дерево, списки); інакше іконка з підписом
const relBadge = (p, sm) => { const r = relOf(p); if (!r) return ''; const R = RELK[r.k];
  const one = (k, t, tip) => `<span class="relb rel-${k}${sm ? ' sm' : ''}" title="${esc(tip)}">${RELK[k].i}${sm ? '' : `<em>${esc(t)}</em>`}</span>`;
  return one(r.k, R.t, R.t + ' — ' + R.d + (r.k === 'doc' ? ` (документів: ${r.docs})` : '') + (r.auto ? '' : ' · позначено вручну')) + (r.c ? one('con', RELK.con.t, RELK.con.t + ': ' + r.c) : ''); };
const relLegend = () => `<div class="rellg">${['doc', 'mem', 'chk', 'con'].map(k => `<span class="relb rel-${k}" title="${esc(RELK[k].d)}">${RELK[k].i}<em>${RELK[k].t}</em></span>`).join('')}</div>`;
const kdBadge = p => { const a = childAge(p); return a ? `<i class="kd" title="${esc(a.txt)}">†</i>` : ''; };
/* Померлі — позначка на дереві (чорний куточок). Померлий: є дата смерті, або народився понад 105 років тому
   (рік народження — з картки, інакше оцінка від батьків +25 або від найстаршої дитини −25). */
const yOf_ = s => { const m = String(s || '').match(/(\d{4})/); return m ? +m[1] : null; };
function estBY(p, dep = 0, seen = new Set()) {
  if (!p || seen.has(p.id)) return null; seen.add(p.id); const y = yOf_(p.b); if (y) return y; if (dep > 4) return null;
  const pa = [P[p.f], P[p.mo]].map(q => estBY(q, dep + 1, seen)).filter(Boolean); if (pa.length) return Math.max(...pa) + 25;
  const ks = (KIDS[p.id] || []).map(k => yOf_(P[k]?.b)).filter(Boolean); if (ks.length) return Math.min(...ks) - 25;
  const sp = (SPOUSES[p.id] || []).map(x => yOf_(P[x?.id || x]?.b)).filter(Boolean); return sp.length ? sp[0] : null;
}
let docY_ = null, docYsrc_ = null; /* найраніший рік документа, де згадано людину */
const docYr_ = id => { const ds = S.data?.documents || []; if (docYsrc_ !== ds) { docYsrc_ = ds; docY_ = {}; ds.forEach(d => { const y = yOf_(d.date); if (y) (d.people || []).forEach(pid => { if (!docY_[pid] || y < docY_[pid]) docY_[pid] = y; }); }); } return docY_[id] || null; };
const isDead = p => { if (!p) return false; if (p.d || p.dead) return true; const lim = new Date().getFullYear() - 105; const by = estBY(p); if (by != null) return by < lim; return (docYr_(p.id) ?? 9999) < lim; }; /* рік документа — лише коли року народження немає (словник 1907 р. прив'язаний і до живих) */
const deadCls = p => isDead(p) ? ' dead' : '';

function famSelect(f) {
  return `<select class="in tfam" id="tfam" aria-label="Гілка"><option value="">Усі гілки</option>${Object.values(FAM).map(x => `<option value="${x.id}"${f.fam === x.id ? ' selected' : ''}>${esc(x.title)}</option>`).join('')}</select>`;
}
/* бічна панель: клік по людині — не перехід на сторінку, а панель праворуч (на телефоні — шторка знизу) */
/* ───── Соцмережі й зв'язок (живі родичі) ───── */
const SOC = { tel: ['Телефон', '☎', 'tel', '+380…'], vb: ['Viber', 'Vb', 'tel', '+380…'], tg: ['Telegram', 'TG', 'text', '@нік або номер'], wa: ['WhatsApp', 'WA', 'tel', '+380…'], ig: ['Instagram', 'IG', 'text', '@нік або посилання'], fb: ['Facebook', 'f', 'url', 'посилання на сторінку'], tt: ['TikTok', 'TT', 'text', '@нік'], yt: ['YouTube', 'YT', 'url', 'посилання на канал'], li: ['LinkedIn', 'in', 'url', 'посилання на профіль'], web: ['Сайт', 'www', 'url', 'https://…'] };
const socHref = l => l.t === 'tel' ? 'tel:' + l.u : l.t === 'vb' ? 'viber://chat?number=' + encodeURIComponent(l.u) : /^https:\/\//.test(l.u) ? l.u : '#';
const socLabel = l => { if (l.t === 'tel' || l.t === 'vb') return l.u; try { const u = new URL(l.u), seg = decodeURIComponent(u.pathname).split('/').filter(Boolean); if (l.t === 'wa') return '+' + seg[0]; if (['ig', 'tg', 'tt'].includes(l.t) && seg[0]) return /^\+/.test(seg[0]) ? seg[0] : '@' + seg[0].replace(/^@/, ''); if (['fb', 'yt', 'li'].includes(l.t) && seg.length) return seg[seg.length - 1].replace(/^@/, ''); return u.hostname.replace(/^www\./, ''); } catch { return l.u; } };
const canSoc = p => !!S.me && (canEdit() || S.me.person_id === p.id);
const isGone = p => !!(p.d || p.dp || (yN(p.b) && yN(p.b) < 1925));
const socChips = (p, small) => (p.links || []).length && !isGone(p) ? `<div class="soc${small ? ' sm' : ''}">${p.links.map(l => `<a class="soc-a s-${l.t}" href="${esc(socHref(l))}" target="_blank" rel="noopener noreferrer" data-soc="${l.t}" title="${esc(SOC[l.t]?.[0] || '')}"><span class="si">${esc(SOC[l.t]?.[1] || '·')}</span><span class="sl">${esc(small ? SOC[l.t]?.[0] || '' : socLabel(l))}</span></a>`).join('')}</div>` : '';
function socBlock(p) {
  if (isGone(p)) return '';
  const has = (p.links || []).length, can = canSoc(p);
  if (!has && !(can && !p.d) && !(isLiving(p) && S.me && !accSet().has(p.id))) return '';
  const mine = S.me?.person_id === p.id;
  return `<div class="sec socsec"><h3>Зв'язок ${can ? `<button class="btn line small" data-act="soc-edit">${has ? 'Змінити' : '+ Соцмережі й телефон'}</button>` : ''}</h3>
    ${isLiving(p) && !mine && S.me && !accSet().has(p.id) ? `<div class="btns"><button class="btn small" data-act="inv" data-id="${p.id}">Запросити на сайт</button><span class="small muted">надіслати посилання у Viber чи Telegram</span></div>` : ''}
    ${p.dna ? `<p class="small">🧬 Здав${p.sex === 'f' ? 'ла' : ''} ДНК-тест: <b>${esc(p.dna)}</b> · <a href="#/dna">ДНК-збіги</a></p>` : ''}
    ${has ? socChips(p) : `<p class="muted small">${mine ? 'Додайте свій Instagram, Facebook, Telegram чи телефон — щоб родичі могли вас знайти.' : 'Ще не додано. Instagram, Facebook, Telegram чи телефон — щоб родичі могли знайтись.'}</p>`}</div>`;
}
document.addEventListener('click', e => { const a = e.target.closest('a[data-soc]'); if (a) ev('open', 'soc', 'soc:' + a.dataset.soc + ':' + (S.ui.pp && a.closest('#pp') ? S.ui.pp : S.arg || '')); }, true);
function openSoc(p) {
  const cur = {}; (p.links || []).forEach(l => { if (!cur[l.t]) cur[l.t] = l.t === 'tel' || l.t === 'vb' ? l.u : socLabel(l); });
  (p.links || []).forEach(l => { if (['fb', 'yt', 'li', 'web'].includes(l.t)) cur[l.t] = l.u; });
  modal(`<h2>Зв'язок — ${esc(short(p))}</h2>
    <p class="small muted">Бачать лише родичі, які увійшли на сайт. Заповніть те, що є; порожні поля не показуються.</p>
    <div class="grid2 socf">${Object.entries(SOC).map(([k, [t, , im, ph]]) => `<label class="f"><span><span class="si s-${k}">${esc(SOC[k][1])}</span> ${esc(t)}</span><input class="in" id="sc-${k}" value="${esc(cur[k] || '')}" placeholder="${esc(ph)}" inputmode="${im}" autocomplete="off" autocapitalize="off" spellcheck="false"></label>`).join('')}</div>
    <label class="f">Де живе зараз (місто чи село)<input class="in" id="sc-lp" value="${esc(p.lp || '')}" placeholder="Напр.: Київ" autocomplete="address-level2"></label>
    <label class="f">ДНК-тест<select class="in" id="sc-dna"><option value="">не здавав(ла)</option>${['MyHeritage', 'FamilyTreeDNA', 'Ancestry', '23andMe', 'GEDmatch', 'інше'].map(c => `<option${p.dna === c ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
    <div class="btns"><button class="btn" data-act="soc-save">Зберегти</button><button class="btn line" data-act="close">Скасувати</button><span class="msg" id="scmsg"></span></div>`);
  S.ui.socFor = p.id;
}
function ppHtml(id) {
  const p = P[id]; if (!p) return '';
  const tab = S.ui.ppTab || 'life';
  const par = [p.f, p.mo].filter(x => P[x]), sp = SPOUSES[p.id] || [], ch = (KIDS[p.id] || []).slice().sort(byBirth);
  const sib = par.length ? [...new Set(par.flatMap(x => KIDS[x] || []))].filter(x => x !== p.id && P[x]).sort(byBirth) : [];
  const docs = S.data.documents.filter(d => (d.people || []).includes(p.id) && d.type !== 'map').sort((a, b) => yearOf(a.date).localeCompare(yearOf(b.date)));
  const fams = (p.fam || []).filter(f => FAM[f]);
  const ev = [];
  if (p.b || p.bp) ev.push([yearOf(p.b) || '?', 'Народження', p.b && /\d\d\.\d\d/.test(p.b) ? p.b : '', p.bp]);
  sp.forEach(s => P[s.id] && !ucU(s) && ev.push([yearOf(s.date) || '', `Шлюб — ${short(P[s.id])}`, s.date && /\d\d\.\d\d/.test(s.date) ? s.date : '', '']));
  ch.forEach(c => ev.push([yearOf(P[c].b) || '', `${P[c].sex === 'f' ? 'Народилася донька' : P[c].sex === 'm' ? 'Народився син' : 'Народилася дитина'} ${String(P[c].n || '').replace(/\s*\(.*?\)/g, '')}`, '', '']));
  if (p.d || p.dp) ev.push([yearOf(p.d) || '?', 'Завершення життєвого шляху', p.d && /\d\d\.\d\d/.test(p.d) ? p.d : '', p.dp]);
  const yk = e => e[1] === 'Народження' ? '0' : e[1].startsWith('Завершення') ? '9' : e[0] ? '1' + e[0] : '5';
  ev.sort((a, b) => yk(a).localeCompare(yk(b)));
  const row = x => `<button type="button" class="pp-p" data-pp="${x}">${avatar(P[x], 'sm')}<span><b>${esc(short(P[x]))}</b><i>${esc(years(P[x]))}${childAge(P[x]) ? ' · †' : ''}</i></span></button>`;
  const grp = (t, ids) => ids.length ? `<div class="pp-g"><h4>${t}</h4>${ids.map(row).join('')}</div>` : '';
  const docRow = d => `<button type="button" class="pp-doc" data-doc="${d.id}">${d.pages ? docThumbs(d) : '<span class="ph"></span>'}<span><b>${esc(d.title)}</b><i>${esc([d.date, d.place, pgWord(d.pages)].filter(Boolean).join(' · '))}</i></span>${IC.ext}</button>`;
  const life = `<ol class="tl">${ev.map(e => `<li><b>${esc(String(e[0] || ''))}${e[0] ? ' · ' : ''}${esc(e[1])}</b>${e[2] ? `<span class="tl-d">${esc(e[2])}</span>` : ''}${e[3] ? `<span class="tl-pl">${IC.pin}${esc(e[3])}</span>` : ''}</li>`).join('') || '<li class="muted">Дат поки немає.</li>'}</ol>
    ${(() => { const t = (p.note || '').replace(/\[\[[pd]:[a-z0-9_-]+\|([^\]]+)\]\]/gi, '$1') || (ridMentions(p.id)[0] || '').replace(/\[\[[pd]:[a-z0-9_-]+\|([^\]]+)\]\]/gi, '$1').replace(/\*\*?([^*]+)\*\*?/g, '$1') || docs.map(d => d.text).filter(Boolean)[0] || ''; return t ? `<div class="pp-note">${esc(t.length > 420 ? t.slice(0, 420).replace(/\s\S*$/, '') + '…' : t)}</div>` : ''; })()}
    ${docs.length ? `<div class="pp-g"><h4>${docs.length > 1 ? 'Джерела' : 'Джерело'}</h4>${docs.slice(0, 4).map(docRow).join('')}${docs.length > 4 ? `<button type="button" class="btn line small" data-act="pp-tab" data-v="src">Усі джерела (${docs.length})</button>` : ''}</div>` : ''}`;
  const fam = grp('Батьки', par) + grp('Чоловік / дружина', sp.filter(x => !ucU(x)).map(x => x.id).filter(x => P[x])) + sp.filter(x => ucU(x) && P[x.id]).map(x => grp(esc(ucLabel(p.id, x).replace(/^./, c => c.toUpperCase())), [x.id])).join('') + grp('Діти', ch) + grp('Брати й сестри', sib) || '<p class="muted">Родичів поки не додано.</p>';
  const src = docs.length ? docs.map(docRow).join('') : '<p class="muted">Документів поки немає.</p>';
  const back = (S.ui.ppHist || []).length;
  return `<aside class="pp" id="pp" aria-label="Людина у дереві">
    <div class="pp-top"><button type="button" class="pp-ic" data-act="pp-back"${back ? '' : ' disabled'} title="Назад">${IC.back}</button><span>Людина у дереві</span><button type="button" class="pp-ic" data-act="pp-close" title="Закрити">${IC.x}</button></div>
    <div class="pp-sc" id="pp-sc">
      <div class="pp-head">${p.portrait ? `<button type="button" class="pp-av" data-photo="${esc(p.portrait)}" data-pctx="${p.id}" title="Відкрити фото">${avatar(p, 'lg')}</button>` : avatar(p, 'lg')}<h2>${esc(full(p))}</h2><div class="pp-y">${esc(years(p))}</div><div class="relrow">${relBadge(p)}</div>${childAge(p) ? `<div class="pp-kd">† ${esc(childAge(p).txt)}</div>` : ''}
        ${socChips(p, true)}<div class="pp-chips">${fams.map(f => `<a class="chip2" href="${href('fam', f)}">${IC.leaf}${esc(FAM[f].title)}</a>`).join('')}${p.hyp ? '<span class="chip2 hyp">гіпотеза</span>' : ''}</div>${dupNote(p.id, true)}${fixBtn(p.id, 'sm')}</div>
      <div class="pp-tabs" role="tablist">${[['life', 'Життя'], ['fam', 'Родина'], ['src', 'Джерела' + (docs.length ? ` <i>${docs.length}</i>` : '')]].map(([k, t]) => `<button type="button" role="tab" data-act="pp-tab" data-v="${k}" class="${tab === k ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div class="pp-body">${tab === 'fam' ? fam : tab === 'src' ? src : life}</div>
    </div>
    <div class="pp-act"><a class="btn wine" href="${href('p', p.id)}">${IC.user}Відкрити профіль</a><button type="button" class="btn line" data-act="pp-tree">${IC.tree}Побудувати дерево</button></div>
  </aside>`;
}
function ppOpen(id, push = true) {
  if (!P[id]) return;
  if (push && S.ui.pp && S.ui.pp !== id) (S.ui.ppHist ||= []).push(S.ui.pp);
  S.ui.pp = id; ppPaint();
}
function ppPaint() {
  const old = document.getElementById('pp'), id = S.ui.pp;
  document.querySelectorAll('.nd.sel').forEach(e => e.classList.remove('sel'));
  if (!id || !P[id]) { old?.remove(); document.body.classList.remove('pp-on'); return; }
  const h = ppHtml(id); if (old) { old.outerHTML = h; document.getElementById('pp').classList.add('pp-still'); } else $('#app').insertAdjacentHTML('beforeend', h); // повторне малювання (вкладки) — без анімації появи, щоб не блимало
  document.body.classList.add('pp-on');
  if (innerWidth <= 820) sheetSwipe(document.getElementById('pp'), ppClose);
  document.querySelectorAll(`.nd[data-id="${id}"]`).forEach(e => e.classList.add('sel'));
}
function ppClose() { S.ui.pp = null; S.ui.ppHist = []; ppPaint(); }

/* ───── Телефон: нижнє меню й шторка «Ще» (як у KRental CRM: 4 розділи + «Ще», кнопки ≥44 px, під великим пальцем) ───── */
const MI = {
  voices: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>',
  terms: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M9 8h7M9 12h5"/></svg>',
  hyp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.4 2.4 0 1 1 3.2 2.3c-.6.3-.8.8-.8 1.4M12 16.4v.1"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11 12 4l8 7"/><path d="M6 9.5V20h4.5v-5h3v5H18V9.5"/></svg>',
  kin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="12" cy="19" r="2.4"/><path d="M6 8.4v2.6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8.4M12 13v3.6"/></svg>',
  help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/><path d="M9.3 9.4a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.7.6-.7 1.1M11 14v.1"/></svg>',
  geo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/></svg>',
  stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/></svg>',
  dna: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3c0 6 10 6 10 12s-10 3-10 6M17 3c0 6-10 6-10 12M17 21c0-2-1.4-3.2-3.3-4"/><path d="M8.5 6h7M8.5 18h7"/></svg>',
  villages: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18"/><path d="M5 20v-8l4-3 4 3v8"/><path d="M13 20v-6l3.5-2.5L20 14v6"/><path d="M8 20v-4h2v4"/></svg>',
  tree: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.2"/><circle cx="5.5" cy="18.5" r="2.2"/><circle cx="18.5" cy="18.5" r="2.2"/><path d="M12 7.2v5.3M5.5 16.3v-1.8a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1.8"/></svg>',
  families: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2A4.5 4.5 0 0 1 21 18.5"/></svg>',
  docs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 6.5 20V4a.5.5 0 0 1 .5-.5z"/><path d="M14 3.5V8h4M9.5 12h5M9.5 15.5h5"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  maps: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3.5 6.5 9 4l6 2.5L20.5 4v13.5L15 20l-6-2.5-5.5 2.5z"/><path d="M9 4v13.5M15 6.5V20"/></svg>',
  q: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4.5 5.5h15v10h-8l-4 3.5v-3.5h-3z"/><path d="M10.3 8.6a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.7.6-.7 1.1M12 13.3v.1"/></svg>',
  admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 19 6v5.5c0 4.2-3 7.4-7 9-4-1.6-7-4.8-7-9V6z"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4.5h4.5v15H14M10 8l-4 4 4 4M6 12h9.5"/></svg>',
  fbook: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5C6.5 4 9.5 4 12 5.5v14c-2.5-1.5-5.5-1.5-8 0zM20 5.5C17.5 4 14.5 4 12 5.5v14c2.5-1.5 5.5-1.5 8 0z"/></svg>',
  routes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/></svg>',
  words: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19.5V5a1.5 1.5 0 0 1 1.5-1.5H19v13H6.5A1.5 1.5 0 0 0 5 18v1.5A1.5 1.5 0 0 0 6.5 21H19"/><path d="M9 8h6M9 11h4"/></svg>',
  iv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3.5" width="6" height="10" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v3.5M9 20.5h6"/></svg>',
};
function mNav(cur) {
  const more = ['maps', 'villages', 'q', 'admin', 'docs', 'kin', 'stats', 'help', 'geo', 'dna', 'hyp', 'terms', 'iv', 'fbook', 'words', 'routes'].includes(cur) ? 'more' : cur;
  const B = [['home', 'Головна'], ['tree', 'Дерево'], ['families', 'Історія'], ['people', 'Люди']];
  const badge = (qBadge() || 0) + (isOwner() ? (S.data?.joinPending || 0) + (S.data?.photoPending || 0) : 0);
  return `<nav class="bnav" aria-label="Розділи">${B.map(([k, t]) => `<a href="${href(k)}" class="${more === k ? 'on' : ''}">${MI[k]}<span>${t}</span></a>`).join('')}<button type="button" data-act="msheet" class="${more === 'more' ? 'on' : ''}">${MI.more}<span>Ще</span>${badge ? `<i class="bn-badge">${badge}</i>` : ''}</button></nav>`;
}
/* Подяка автору (бажання власника, 13.10) */
const SURN = ['Шуті', 'Красновиди', 'Левченки', 'Янки', 'Семени', 'Вдовинці']; // головні прізвища роду (Шуті — перші); назва сайту «Наш родовід: …»
const creditHtml = () => { const me = Object.values(P).find(p => p.root); return `<footer class="credit"><span class="cr-orn">✥</span><p>Сайт створив і веде <b>${me ? `<a href="${href('p', me.id)}">Максим Шутий</a>` : 'Максим Шутий'}</b> — зібрав разом документи, розшукав предків в архівах і записав історію роду.</p><p class="cr-s">Наш родовід · ${new Date().getFullYear()}</p></footer>`; };
function mSheet() {
  const L = [['hyp', 'Припущення — допоможіть підтвердити', ''], ['voices', 'Голоси роду — усі записи', ''], ['docs', 'Архів документів', ''], ['villages', 'Історія сіл', ''], ['kin', 'Ким ми доводимось', ''], ['help', 'Допоможіть знайти · Хто на фото?', ''], ['routes', 'Сімейні маршрути', ''], ['iv', 'Питання для розмови з родичами', ivOpen().length || ''], ['words', 'Наші слова (говірка)', ''], ['fbook', 'Сімейна книга (PDF)', ''], ['geo', 'Карта роду', ''], ['stats', 'Цифри роду', ''], ['terms', 'Словник і джерела', ''], ['dna', 'ДНК-тести', ''], ['maps', 'Старі карти', ''], ['q', 'Запитання й уточнення', qBadge() || ''], ...(isOwner() ? [['admin', 'Власнику', ((S.data?.joinPending || 0) + (S.data?.photoPending || 0)) || '']] : [])];
  $('#layer').innerHTML = `<div class="msh-scrim" data-act="mshclose"><div class="msh" role="dialog" aria-modal="true" aria-label="Ще"><div class="msh-grip"></div>
    ${L.map(([k, t, n]) => `<a class="msh-row" href="${href(k)}" data-act="mshclose">${MI[k]}<span>${t}</span>${n ? `<i class="bn-badge in">${n}</i>` : ''}<b>›</b></a>`).join('')}
    <div class="msh-me">${esc(S.me.name || S.me.email || '')}</div>
    <div class="msh-cr">Сайт створив і веде <b>Максим Шутий</b></div>
    <button class="msh-row out" data-act="logout">${MI.out}<span>Вийти</span></button></div></div>`;
  document.documentElement.classList.add('msh-open');
  sheetSwipe($('#layer .msh'), () => { $('#layer').innerHTML = ''; document.documentElement.classList.remove('msh-open'); });
}
// Шторка знизу закривається свайпом униз (тягнеться за пальцем; далеко або швидко — закрити, інакше повертається)
function sheetSwipe(sh, onClose) {
  if (!sh) return; let y0 = null, t0 = 0, dy = 0, drag = false;
  const scr = sh.parentElement;
  const scrolled = el => { for (; el && el !== sh.parentElement; el = el.parentElement) if (el.scrollTop > 0) return true; return false; }; // свайп униз у прокрученому списку — це прокрутка, а не закриття
  sh.addEventListener('touchstart', e => { if (e.touches.length !== 1 || scrolled(e.target)) { y0 = null; return; } y0 = e.touches[0].clientY; t0 = Date.now(); dy = 0; drag = false; }, { passive: true });
  sh.addEventListener('touchmove', e => { if (y0 == null) return; dy = e.touches[0].clientY - y0; if (!drag && dy > 8) drag = true; if (!drag) return; if (dy < 0) dy = 0; e.preventDefault(); sh.style.transition = 'none'; sh.style.transform = `translateY(${dy}px)`; if (scr) scr.style.background = `rgba(20,18,15,${Math.max(0, .38 * (1 - dy / 400))})`; }, { passive: false });
  const end = () => { if (y0 == null) return; y0 = null; if (!drag) return; const fast = dy > 40 && dy / Math.max(1, Date.now() - t0) > 0.5;
    if (dy > 90 || fast) { sh.style.transition = 'transform .2s ease'; sh.style.transform = 'translateY(100%)'; if (scr) { scr.style.transition = 'background .2s'; scr.style.background = 'rgba(20,18,15,0)'; } setTimeout(onClose, 190); }
    else { sh.style.transition = 'transform .2s ease'; sh.style.transform = ''; if (scr) scr.style.background = ''; }
    // клік після свайпу не повинен відкрити пункт меню
    if (drag) { const stop = ev => { ev.stopPropagation(); ev.preventDefault(); }; sh.addEventListener('click', stop, { capture: true, once: true }); setTimeout(() => sh.removeEventListener('click', stop, { capture: true }), 350); } };
  sh.addEventListener('touchend', end); sh.addEventListener('touchcancel', end);
}

/* ───── Дерево предків ───── */
// стать — легкий колір картки на дереві (власник, 22.10): чоловіки блакитні, жінки рожеві
function sxCount() { let m = 0, w = 0; for (const x of Object.values(P)) { if (x.sex === 'm') m++; else if (x.sex === 'f') w++; } return `<div class="sxcnt" title="Усього в родоводі: чоловіків — ${m}, жінок — ${w}"><span class="sxm"><i></i>${m} чол.</span><span class="sxf"><i></i>${w} жін.</span></div>`; }
function sxCls(p) { return p && p.sex === 'm' ? ' sx-m' : p && p.sex === 'f' ? ' sx-f' : ''; }
function node(id) { const p = P[id]; return `<a class="nd${sxCls(p)}${deadCls(p)}${p.hyp ? ' hyp' : ''}${p.root ? ' root' : ''}" href="${href('p', id)}">${ph(p)}<span><b>${esc(short(p))}</b><i>${esc(p.pt || '')}</i><span class="y">${esc(life(p))}</span></span></a>`; }
let depthMax = 0;
function branchHtml(id, d, seen) {
  if (seen.has(id)) return ''; seen.add(id); depthMax = Math.max(depthMax, d);
  const p = P[id]; const ps = [p.f, p.mo].filter(x => x && P[x]);
  return `<div class="br">${node(id)}${ps.length ? `<div class="par">${ps.map(x => branchHtml(x, d + 1, seen)).join('')}</div>` : ''}</div>`;
}
function vTree() {
  const mode = S.ui.tmode || 'all';
  const tabs = `<div class="tmodes seg3">${[['all', 'Родина', 'Предки, брати й сестри, діти'], ['ped', 'Предки', 'Лише предки, зліва направо'], ['desc', 'Нащадки', 'Діти, онуки й правнуки']].map(([k, t, h]) => `<button data-tmode="${k}" class="${mode === k ? 'on' : ''}" title="${h}">${t}</button>`).join('')}</div>`;
  return mode === 'ped' ? vPedigree(tabs) : vAll(tabs);
}
function vPedigree(tabs) {
  const r0 = rootId(); const kidsR = (KIDS[r0] || []).slice().sort(byBirth).reverse();
  const r = S.arg && P[S.arg] ? S.arg : startId();
  depthMax = 0; const t = branchHtml(r, 0, new Set());
  const L = ['', 'Батьки', 'Діди', 'Прадіди', 'Прапрадіди', '4-ті прадіди', '5-ті прадіди', '6-ті прадіди', '7-мі прадіди', '8-мі прадіди', '9-ті прадіди'];
  const R = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  return `${treeHead()}
    ${treeBar(tabs, `<div class="legend"><span><i class="sw r"></i>Від кого рахуємо</span><span><i class="sw"></i>Підтверджено документами</span><span><i class="sw h"></i>Гіпотеза</span><span><i class="sw dd"></i>Помер(ла)</span></div>`)}
    <div class="vp" id="vp" data-mode="ped"><div class="stage" id="stage"><div class="treebox ped"><div class="gens">${Array.from({ length: depthMax + 1 }, (_, i) => `<div><b>${R[i] || i + 1}</b>${i ? (L[i] || i + '-ті прадіди') : 'Покоління'}</div>`).join('')}</div>${t}</div></div>${vpCtl(false)}</div>`;
}
const vpCtl = mini => `<div class="vpctl"><button data-zoom-in title="Збільшити">+</button><button data-zoom-out title="Зменшити">−</button><button data-zoom-fit title="Показати все">⤢</button><button data-full title="На весь екран">⛶</button>${mini ? `<button type="button" data-act="mini-tog" class="${S.ui.mini ? 'on' : ''}" title="Мінікарта: показати / сховати">▦</button>` : ''}</div>${mini ? `<canvas class="minimap" id="minimap" width="220" height="140"${S.ui.mini ? '' : ' hidden'}></canvas>` : ''}`;

/* ── Дерево згори вниз: людина в центрі, над нею батьки, діди…; біля кожного предка — брати й сестри ── */
const T2 = { W: 236, H: 92, GX: 22, GY: 92, PAD: 60 }; /* картка дерева: фото 70 px (власник, 18.10 — більші фото) */
const tname = p => [String(p.n || '').replace(/\s*\([^)]*\)/g, ''), p.s].filter(Boolean).join(' ') + (maidenOf(p) ? ` (${maidenOf(p)})` : '') || '(без імені)'; // у дереві — без «(Настя)», повне ім'я в підказці
const P2 = T2.W + T2.GX;
function treeCenter() { const f = S.ui.tf || {}; if (f.center && P[f.center]) return f.center; return startId(); }
function layoutTD(center) {
  const f = S.ui.tf || {}; const sortS = f.sort === 'name' ? ((a, b) => short(P[a]).localeCompare(short(P[b]), 'uk')) : byBirth;
  const mk = () => ({ n: [], c: {} }); // n: [{id,x,r}], c: row -> [min,max]
  const add = (B, id, x, r) => { B.n.push({ id, x, r }); const c = B.c[r] ||= [x, x]; c[0] = Math.min(c[0], x); c[1] = Math.max(c[1], x); };
  const shift = (B, dx) => { B.n.forEach(o => o.x += dx); Object.values(B.c).forEach(c => { c[0] += dx; c[1] += dx; }); return B; };
  const merge = (A, B) => { B.n.forEach(o => add(A, o.id, o.x, o.r)); return A; };
  const sep = (A, B) => { let d = -Infinity; for (const r in A.c) if (B.c[r]) d = Math.max(d, A.c[r][1] - B.c[r][0] + P2); return d === -Infinity ? 0 : d; };
  const seen = new Set();
  const sibs = c => { const p = P[c]; const ps = [p.f, p.mo].filter(x => x && P[x]); if (!ps.length) return [c]; return [...new Set(ps.flatMap(x => KIDS[x] || []))].filter(x => x === c || !seen.has(x)).sort(sortS); };
  const EXP = S.ui.exp ||= {}; const SIBX = S.ui.sibx ||= {}; const DS = S.ui.dsib = {}; const DEF = innerWidth < 820 ? 3 : 4; const hid = S.ui.hid = {};
  function up(c, r, side, lim) { // блок предків людини c (c у x=0, ряд r); lim — з якого ряду ховати предків (коли відкрита рідня дружини/чоловіка)
    const B = mk(); const all = sibs(c).filter(x => x === c || (P[x] && !seen.has(x)));
    const dflt = !SIBX[c] && !f.allOpen && SIBX[c] !== 0 && r === 0; const g = (SIBX[c] || f.allOpen || dflt) ? all : [c]; if (dflt && all.length > 1) DS[c] = 1; /* відкриті одразу лише брати й сестри центральної людини; решта — кнопкою ▸N */ if (all.length > g.length) (hid[c] ||= {}).sib = all.length - 1;
    const outer = x => x !== c && (SPOUSES[x] || []).some(s => EXP[s.id] && P[s.id]); // у кого розгорнута рідня чоловіка/дружини — ставимо скраю ряду, щоб чужа гілка не перетинала лінію братів і сестер
    let order = g.filter(x => x !== c && !outer(x)); const ou = g.filter(outer); order = side === 'L' ? [...ou, ...order, c] : side === 'R' ? [c, ...order, ...ou] : [...g.filter(x => !outer(x)), ...ou];
    const ci = order.indexOf(c); order.forEach((id, i) => { seen.add(id); add(B, id, (i - ci) * P2, r); });
    const p = P[c]; let fa = p.f && P[p.f] && !seen.has(p.f) ? p.f : null, mo = p.mo && P[p.mo] && !seen.has(p.mo) ? p.mo : null;
    if ((fa || mo) && (r >= DEF || (lim && r >= lim)) && !EXP[c] && !f.allOpen) { (hid[c] ||= {}).up = true; fa = mo = null; }
    if (fa || mo) {
      let F = fa ? up(fa, r + 1, mo ? 'L' : 'C', lim) : null; let M = mo ? up(mo, r + 1, fa ? 'R' : 'C', lim) : null;
      let mid;
      if (F && M) { shift(M, sep(F, M)); const fx = F.n.find(o => o.id === fa).x, mx = M.n.find(o => o.id === mo).x; merge(F, M); mid = (fx + mx) / 2; shift(F, -mid); merge(B, F); }
      else { const X = F || M; const id = fa || mo; shift(X, -X.n.find(o => o.id === id).x); merge(B, X); }
    }
    return B;
  }
  function down(c, r) { // нащадки центру
    const B = mk(); const kids = (KIDS[c] || []).filter(k => !seen.has(k)).sort(sortS); let X = null;
    kids.forEach(k => { seen.add(k); const K = down(k, r - 1); if (!X) X = K; else { shift(K, sep(X, K)); merge(X, K); } });
    if (X) { const xs = kids.map(k => X.n.find(o => o.id === k).x); shift(X, -(Math.min(...xs) + Math.max(...xs)) / 2 + (SPOUSES[c] || []).length * P2 / 2); }
    add(B, c, 0, r); (SPOUSES[c] || []).forEach((s, i) => { if (!seen.has(s.id)) { seen.add(s.id); add(B, s.id, (i + 1) * P2, r); } });
    if (X) merge(B, X); return B;
  }
  seen.add(center);
  const A = S.ui.tmode === 'desc' ? (() => { const B = mk(); add(B, center, 0, 0); return B; })() : up(center, 0, (SPOUSES[center] || []).some(x => P[x.id]) ? 'L' : 'C', (SPOUSES[center] || []).some(x => EXP[x.id] && P[x.id]) ? 1 : 0); /* відкрита рідня дружини/чоловіка — власні предки центру згортаються до батьків, щоб гілки не переплітались (розгорнути знову — ▲) */ /* є подружжя праворуч — брати й сестри ліворуч, щоб не накладались */ const D = down(center, 0); D.n = D.n.filter(o => o.id !== center); // центр уже в A
  D.n.forEach(o => add(A, o.id, o.x, o.r));
  // інші шлюби, розгорнуті кнопкою «⚭ +N» (до дітей бічних — щоб «▾N» у другої дружини/чоловіка теж працювала): ставимо поруч із людиною в тому самому ряду, решту дерева розсуваємо
  const SPX = S.ui.spx ||= {};
  Object.keys(SPX).forEach(id => { if (!SPX[id]) return; const o = A.n.find(x => x.id === id); if (!o) return; const extra = (SPOUSES[id] || []).filter(x => P[x.id] && !seen.has(x.id)); if (!extra.length) return;
    const k = extra.length, rightTaken = A.n.some(x => x.r === o.r && Math.abs(x.x - (o.x + P2)) < 1 && (SPOUSES[id] || []).some(y => y.id === x.id));
    if (!rightTaken) { A.n.forEach(x => { if (x.x > o.x) x.x += k * P2; }); extra.forEach((x, i) => { seen.add(x.id); add(A, x.id, o.x + (i + 1) * P2, o.r); }); }
    else { A.n.forEach(x => { if (x.x < o.x) x.x -= k * P2; }); extra.forEach((x, i) => { seen.add(x.id); add(A, x.id, o.x - (i + 1) * P2, o.r); }); } });
  // діти бічних родичів (брати й сестри предків тощо): кнопка «▾N» під карткою; розгорнуті — ставимо під людиною, решту дерева праворуч розсуваємо
  const KX = S.ui.kidx ||= {};
  const hasHidden = id => (KIDS[id] || []).some(k => !seen.has(k));
  const KL = f.allOpen ? null : Object.keys(KX);
  for (let i = 0; i < (KL ? KL.length : A.n.length); i++) {
    const id = KL ? KL[i] : A.n[i].id; if (!KL && id === center) continue;
    const o = A.n.find(x => x.id === id); if (!o || !hasHidden(id)) continue;
    const Sb = mk(); add(Sb, id, 0, o.r);
    (SPOUSES[id] || []).forEach(sp => { if (!seen.has(sp.id) && P[sp.id]) { seen.add(sp.id); add(Sb, sp.id, Sb.n.filter(n => n.r === o.r).length * P2, o.r); } });
    let X = null; (KIDS[id] || []).filter(k => !seen.has(k)).sort(sortS).forEach(k => { seen.add(k); const K = down(k, o.r - 1); if (!X) X = K; else { shift(K, sep(X, K)); merge(X, K); } });
    if (X) { shift(X, -Math.min(...X.n.map(n => n.x))); merge(Sb, X); }
    Sb.n = Sb.n.filter(n => n.id !== id);
    const rowsS = [...new Set(Sb.n.map(n => n.r))], others = A.n.filter(n => n.id !== id);
    const left = others.filter(n => n.x <= o.x), right = others.filter(n => n.x > o.x);
    let off = o.x; for (const r of rowsS) { const lx = left.filter(n => n.r === r).map(n => n.x); if (!lx.length) continue; const smin = Math.min(...Sb.n.filter(n => n.r === r).map(n => n.x)); off = Math.max(off, Math.max(...lx) + P2 - smin); }
    shift(Sb, off);
    let d = 0; for (const r of rowsS) { const rx = right.filter(n => n.r === r).map(n => n.x); if (!rx.length) continue; const smax = Math.max(...Sb.n.filter(n => n.r === r).map(n => n.x)); d = Math.max(d, smax + P2 - Math.min(...rx)); }
    if (d > 0) right.forEach(n => n.x += d);
    Sb.n.forEach(n => add(A, n.id, n.x, n.r));
  }
  // батьки й рідня подружжя (невістки, зяті, свати): кнопка «▲» над карткою; розгорнуті — ставимо над людиною, решту дерева розсуваємо
  const upHidden = id => { const p = P[id]; return !!p && [p.f, p.mo].some(x => x && P[x] && !seen.has(x)); };
  A.n.slice().forEach(o0 => { const id = o0.id; if (id === center || !upHidden(id)) return;
    if (!EXP[id] && !f.allOpen) { (hid[id] ||= {}).up = true; return; }
    const o = A.n.find(x => x.id === id); const keep = SIBX[id]; if (keep === undefined) SIBX[id] = 1; // з батьками подружжя одразу видно і його братів та сестер (праворуч від нього)
    const Ub = up(id, o.r, 'R'); if (keep === undefined) delete SIBX[id];
    Ub.n = Ub.n.filter(n => n.id !== id); if (!Ub.n.length) return; shift(Ub, o.x);
    const rowsU = [...new Set(Ub.n.map(n => n.r))], others = A.n.filter(n => n.id !== id);
    const left = others.filter(n => n.x <= o.x), right = others.filter(n => n.x > o.x);
    let off = 0; for (const r of rowsU) { const lx = left.filter(n => n.r === r).map(n => n.x); if (!lx.length) continue; const smin = Math.min(...Ub.n.filter(n => n.r === r).map(n => n.x)); off = Math.max(off, Math.max(...lx) + P2 - smin); }
    shift(Ub, off);
    let d = 0; for (const r of rowsU) { const rx = right.filter(n => n.r === r).map(n => n.x); if (!rx.length) continue; const smax = Math.max(...Ub.n.filter(n => n.r === r).map(n => n.x)); d = Math.max(d, smax + P2 - Math.min(...rx)); }
    if (d > 0) right.forEach(n => n.x += d);
    Ub.n.forEach(n => add(A, n.id, n.x, n.r)); });
  if (!f.allOpen) A.n.forEach(o => { if (o.id !== center && !KX[o.id] && hasHidden(o.id) && !(KIDS[o.id] || []).some(k => seen.has(k))) /* хтось із дітей уже в дереві — решту відкриває «+N» біля нього */ (hid[o.id] ||= {}).kids = (KIDS[o.id] || []).filter(k => !seen.has(k)).length; });
  const rows = [...new Set(A.n.map(o => o.r))].sort((a, b) => b - a); const ri = Object.fromEntries(rows.map((r, i) => [r, i]));
  const minX = Math.min(...A.n.map(o => o.x)), maxX = Math.max(...A.n.map(o => o.x));
  const N = {}; A.n.forEach(o => { N[o.id] = { x: o.x - minX + T2.PAD, y: ri[o.r] * (T2.H + T2.GY) + T2.PAD, r: o.r }; });
  return { N, w: maxX - minX + T2.W + T2.PAD * 2, h: rows.length * (T2.H + T2.GY) - T2.GY + T2.PAD * 2, rows };
}
function treeBar(tabs, extra = '') {
  const f = S.ui.tf || {}, center = treeCenter();
  const opts = Object.values(P).sort((x, y) => short(x).localeCompare(short(y), 'uk')).map(x => `<option value="${x.id}"${x.id === center ? ' selected' : ''}>${esc(full(x))}${yearOf(x.b) ? ' (' + yearOf(x.b) + ')' : ''}</option>`).join('');
  return `<div class="tbar tbar1 tbar2"><h1 class="th1" title="Кожен із нас — продовження когось.">Родинне дерево</h1><label class="tsearch">${IC.search}<input class="in" id="tq" type="search" placeholder="Знайти людину…" value="${esc(f.q || '')}" aria-label="Пошук у дереві"></label>
      ${famSelect(f)}${tabs}<button class="btn line tme" data-act="t-me" title="Побудувати дерево від мене">${IC.target}<span>До мене</span></button>
      <details class="tmore"><summary class="btn line" title="Ще налаштування">⋯</summary><div class="tmore-b">
        <label class="f">Від кого будувати<select class="in" id="tcenter">${opts}</select></label>
        <label class="f">Брати й сестри<select class="in" id="tsort"><option value="birth"${f.sort !== 'name' ? ' selected' : ''}>за роком</option><option value="name"${f.sort === 'name' ? ' selected' : ''}>за ім'ям</option></select></label>
        <button class="btn line small" data-act="t-open">${f.allOpen ? 'Згорнути все' : 'Розгорнути все'}</button>${extra}</div></details>${sxCount()}</div>`;
}
function vAll(tabs) {
  const center = treeCenter(); const L = layoutTD(center); S.ui.tl = L; const f = S.ui.tf || {}; const V = new Set(Object.keys(L.N));
  const cx = id => L.N[id].x + T2.W / 2, top = id => L.N[id].y, bot = id => L.N[id].y + T2.H, midY = id => L.N[id].y + T2.H / 2;
  let lines = '', rings = ''; const done = new Set();
  V.forEach(id => (SPOUSES[id] || []).forEach(s => { const k = [id, s.id].sort().join('|'); if (done.has(k) || !V.has(s.id) || L.N[s.id].r !== L.N[id].r) return; done.add(k);
    const [a, b] = cx(id) < cx(s.id) ? [id, s.id] : [s.id, id]; lines += `<path d="M${L.N[a].x + T2.W} ${midY(a)}H${L.N[b].x}" class="ln sp${ucU(s) ? ' unc' : ''}"/>`; const gap = L.N[b].x - (L.N[a].x + T2.W), rx = gap > T2.GX + 30 ? L.N[b].x - 13 : (L.N[a].x + T2.W + L.N[b].x) / 2, ry = midY(a); /* далекий шлюб — кільце біля самої людини, не на сусідній картці */ rings += `<g class="ring" transform="translate(${rx} ${ry})"><circle r="12"/><circle cx="-3" r="4.2" class="r2"/><circle cx="3" r="4.2" class="r2"/></g>`; }));
  const fam = {}; V.forEach(id => { const ps = [P[id].f, P[id].mo].filter(x => x && V.has(x)); if (ps.length) (fam[ps.sort().join('|')] ||= []).push(id); });
  // батьки → діти: товстіша лінія; сусідні родини в одному ряду — кожна на своїй висоті, щоб лінії не зливалися в одну
  const FL = Object.entries(fam).map(([k, kids]) => { const ps = k.split('|'); const two = ps.length === 2 && L.N[ps[0]].r === L.N[ps[1]].r;
    /* батьки стоять далеко (між ними чужі картки) — лінія до дітей іде від кільця біля правого з батьків, а не з середини, яка може припасти на чужу картку */
    const [pa, pb] = two && cx(ps[0]) > cx(ps[1]) ? [ps[1], ps[0]] : ps, far = two && L.N[pb].x - (L.N[pa].x + T2.W) > T2.GX + 30;
    const px = two ? (far ? L.N[pb].x - 13 : (cx(pa) + cx(pb)) / 2) : cx(ps[0]), py = two ? midY(ps[0]) : bot(ps[0]); const xs = kids.map(cx);
    return { kids, px, py, xs, x1: Math.min(px, ...xs), x2: Math.max(px, ...xs), row: L.N[kids[0]].r }; });
  const LANE = 14, rowsF = {}; FL.forEach(o => (rowsF[o.row] ||= []).push(o));
  Object.values(rowsF).forEach(list => { const ends = []; list.sort((a, b) => a.x1 - b.x1).forEach(o => { let i = ends.findIndex(e => e < o.x1 - 10); if (i < 0) { i = ends.length; ends.push(0); } ends[i] = o.x2; o.lane = i; }); list.forEach(o => { o.n = ends.length; }); });
  FL.forEach(o => { const ty = top(o.kids[0]), by = ty - T2.GY / 2 + (o.lane - (o.n - 1) / 2) * Math.min(LANE, 64 / Math.max(1, o.n - 1));
    lines += `<path d="M${o.px} ${o.py}V${by}M${o.x1} ${by}H${o.x2}${o.xs.map(x => `M${x} ${by}V${ty}`).join('')}" class="ln pc"/>`; });
  // брати й сестри, чиїх батьків у дереві не показано (відкриті кнопкою ▸N): з'єднуємо їх «дужкою» над карткою, щоб було видно, що це одна родина
  const SG = {}; V.forEach(id => { const ps = [P[id].f, P[id].mo].filter(x => x && P[x]); if (!ps.length || ps.some(x => V.has(x))) return; (SG[ps.sort().join('|') + '@' + L.N[id].r] ||= []).push(id); });
  Object.values(SG).forEach(ks => { if (ks.length < 2) return; const xs = ks.map(cx), ty = top(ks[0]), by = ty - T2.GY / 2 + 6;
    lines += `<path d="M${Math.min(...xs)} ${by}H${Math.max(...xs)}${xs.map(x => `M${x} ${by}V${ty}`).join('')}" class="ln pc sibl"/>`; });
  const q = (f.q || '').trim().toLowerCase();
  const anc = new Set(); (function up(id) { if (!id || anc.has(id) || !P[id]) return; anc.add(id); up(P[id].f); up(P[id].mo); })(center);
  const desc = new Set(); (function dn(id) { (KIDS[id] || []).forEach(k => { if (!desc.has(k)) { desc.add(k); dn(k); } }); })(center);
  const cards = [...V].map(id => { const p = P[id], n = L.N[id]; const hit = q && full(p).toLowerCase().includes(q); const br = !anc.has(id) && !desc.has(id) && (KIDS[id] || []).some(k => !anc.has(k) && !desc.has(k)); /* бічна гілка, що має продовження */
    const dim = f.fam && !(p.fam || []).includes(f.fam);
    return `<a class="nd t2${sxCls(p)}${deadCls(p)}${p.hyp ? ' hyp' : ''}${id === center ? ' root' : ''}${hit ? ' hit' : ''}${S.ui.pp === id ? ' sel' : ''}${dim ? ' dim' : ''}${br ? ' brc' : ''}" href="${href('p', id)}" style="left:${n.x}px;top:${n.y}px" data-id="${id}" data-pp="${id}" title="${esc(full(p) + (life(p) ? ', ' + life(p) : '') + (isDead(p) ? (p.d ? ' · помер(ла)' : ' · помер(ла), дати смерті не знаємо') : '') + (childAge(p) ? ' · ' + childAge(p).txt : '') + (br ? ' — є нащадки в дереві' : ''))}">${avatar(p)}<span><b>${esc(tname(p))}</b><span class="y">${esc(years(p))}</span></span>${kdBadge(p)}${(r => `<i class="ndrel rel-${r.k}${r.c ? ' con' : ''}" title="${esc(RELK[r.k].t + (r.c ? ' · ' + RELK.con.t : ''))}">${RELK[r.k].i}</i>`)(relOf(p))}</a>`; }).join('');
  const tog = Object.entries(S.ui.hid || {}).filter(([id]) => L.N[id]).map(([id, h]) => { const n = L.N[id]; let s = '';
    if (h.up) s += `<button class="tg up" data-exp="${id}" style="left:${n.x + T2.W / 2 - 15}px;top:${n.y - 26}px" title="Показати батьків">▲</button>`;
    if (h.kids) s += `<button class="tg kid" data-kidx="${id}" style="left:${n.x + T2.W / 2 - 4}px;top:${n.y + T2.H - 13}px" title="Показати дітей">▾${h.kids}</button>`;
    if (h.sib) s += `<button class="tg sib" data-sibx="${id}" style="left:${n.x + T2.W - 44}px;top:${n.y - 15}px" title="Показати братів і сестер (${h.sib})">▸${h.sib}</button>`;
    return s; }).join('') + [...V].map(id => { const n = L.N[id], h = (S.ui.hid || {})[id] || {}; let s = ''; /* кожне відкрите — своя кнопка «згорнути» на тому ж місці, незалежно від інших */
    if (((S.ui.sibx || {})[id] || (S.ui.dsib || {})[id]) && !h.sib) s += `<button class="tg cl" data-coll="${id}" data-cw="sib" style="left:${n.x + T2.W - 44}px;top:${n.y - 15}px" title="Сховати братів і сестер">◂−</button>`;
    if ((S.ui.exp || {})[id] && !h.up) s += `<button class="tg cl" data-coll="${id}" data-cw="up" style="left:${n.x + T2.W / 2 - 15}px;top:${n.y - 26}px" title="Сховати батьків">▼</button>`;
    if ((S.ui.kidx || {})[id] && !h.kids) s += `<button class="tg cl" data-coll="${id}" data-cw="kid" style="left:${n.x + T2.W / 2 - 4}px;top:${n.y + T2.H - 13}px" title="Сховати дітей">▴</button>`;
    return s; }).join('');
  // інші шлюби людей у дереві (чоловік/дружина, яких немає на дереві): значок «⚭ +N» → бічна панель
  const spx = [...V].map(id => { const n = L.N[id]; const open = (S.ui.spx || {})[id];
    if (open) return `<button type="button" class="tg sp on" data-spx="${id}" style="left:${n.x + 10}px;top:${n.y + T2.H - 13}px" title="Сховати інші шлюби">⚭ −</button>`;
    const o = (SPOUSES[id] || []).filter(x => P[x.id] && !V.has(x.id)); if (!o.length) return '';
    return `<button type="button" class="tg sp" data-spx="${id}" style="left:${n.x + 10}px;top:${n.y + T2.H - 13}px" title="${esc('Показати в дереві: ' + o.map(x => full(P[x.id]) + (life(P[x.id]) ? ' (' + life(P[x.id]) + ')' : '') + (ucU(x) ? ' — ' + ucLabel(id, x) : '')).join('; '))}">⚭ +${o.length}</button>`; }).join('');
  const opts = Object.values(P).sort((x, y) => short(x).localeCompare(short(y), 'uk')).map(x => `<option value="${x.id}"${x.id === center ? ' selected' : ''}>${esc(full(x))}${yearOf(x.b) ? ' (' + yearOf(x.b) + ')' : ''}</option>`).join('');
  const glabels = L.rows.map((r, i) => `<div class="glab" style="top:${Math.max(0, i * (T2.H + T2.GY) + T2.PAD - 62)}px">${r === 0 ? 'Від кого будуємо' : r > 0 ? (['', 'Батьки', 'Діди', 'Прадіди', 'Прапрадіди'][r] || (r - 2) + '-ті прадіди') : r === -1 ? 'Діти' : r === -2 ? 'Онуки' : 'Нащадки'}</div>`).join('');
  return `${treeHead()}
    ${treeBar(tabs, `<span class="small muted">${V.size} осіб у дереві</span><span class="small muted"><i class="sw brc" style="display:inline-block;width:18px;height:12px;border-radius:3px;vertical-align:-1px;margin-right:6px"></i>товста рамка — у брата чи сестри є нащадки в дереві</span>${isOwner() ? `<button class="btn line small" data-act="t-png" title="Велика картинка PNG — саме ті родичі, що зараз відкриті в дереві">⤓ Завантажити картинкою (PNG)</button>` : ''}<button class="btn line small" data-act="poster" title="Велика картинка з рамкою й заголовком — для друку на стіну">🖼 Плакат для друку</button>`)}
    <div class="vp all" id="vp" data-mode="all" data-center="${center}"><div class="stage" id="stage" style="width:${L.w}px;height:${L.h}px">${glabels}<svg class="lines" width="${L.w}" height="${L.h}">${lines}${rings}</svg>${cards}${tog}${spx}</div>${vpCtl(true)}</div>
    `;
}

/* ── Дерево картинкою (власнику): малюємо відкрите зараз дерево на canvas у великій роздільності ── */
async function treePng(PO) {
  const L = S.ui.tl, st = $('#stage'); if (!L || !st) return;
  if (document.fonts?.ready) await document.fonts.ready;
  const HEAD = PO ? 20 : 110, w = L.w, h = L.h + HEAD + 40;
  let k = Math.min(3, Math.sqrt((PO ? 90e6 : 200e6) / (w * h)), 16000 / w, 16000 / h); k = Math.max(0.5, Math.floor(k * 4) / 4); // до 3× (чітко при друку), у межах можливостей браузера
  const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
  const g = c.getContext('2d'); g.scale(k, k);
  const css = getComputedStyle(document.documentElement), cv = (n, d) => (css.getPropertyValue(n) || '').trim() || d;
  const PAPER = cv('--paper', '#F7F4EF'), WINE = cv('--wine', '#7A2E3B'), INK = cv('--ink', '#1E1B17'), MUT = cv('--muted', '#7A7368'), HYP = cv('--hyp', '#B08A3E');
  const fD = cv('--f-display', 'Georgia, serif'), fB = cv('--f-body', 'sans-serif'), fM = cv('--f-mono', 'monospace');
  g.fillStyle = PAPER; g.fillRect(0, 0, w, h);
  // заголовок
  const cen = P[treeCenter()];
  if (!PO) { g.fillStyle = WINE; g.font = `700 40px ${fD}`; g.textBaseline = 'alphabetic'; g.fillText('Наш родовід — родинне дерево', 60, 62);
  g.fillStyle = MUT; g.font = `15px ${fB}`; g.fillText(`Від кого будуємо: ${cen ? full(cen) : ''} · осіб у дереві: ${Object.keys(L.N).length} · ${new Date().toLocaleDateString('uk-UA')} · shutyi.com.ua`, 60, 92); }
  g.translate(0, HEAD);
  // підписи поколінь
  st.querySelectorAll('.glab').forEach(el => { g.fillStyle = WINE; g.globalAlpha = .55; g.font = `700 22px ${fD}`; g.fillText(el.textContent, 8, parseFloat(el.style.top) + 24); g.globalAlpha = 1; });
  // лінії та кільця з того самого SVG, що на екрані
  st.querySelectorAll('svg.lines path').forEach(pth => { const pc = pth.classList.contains('pc'); g.lineWidth = pc ? 2.6 : 1.6; g.strokeStyle = pc ? '#6F6457' : '#B7AC9E'; g.lineJoin = 'round'; g.stroke(new Path2D(pth.getAttribute('d'))); });
  st.querySelectorAll('svg.lines g.ring').forEach(r => { const m = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(r.getAttribute('transform')); if (!m) return; const x = +m[1], y = +m[2];
    g.beginPath(); g.arc(x, y, 12, 0, 7); g.fillStyle = '#fff'; g.fill(); g.strokeStyle = '#B7AC9E'; g.lineWidth = 1.3; g.stroke();
    g.strokeStyle = '#8E8275'; g.lineWidth = 1.4; [-3, 3].forEach(dx => { g.beginPath(); g.arc(x + dx, y, 4.2, 0, 7); g.stroke(); }); });
  // портрети (з тих самих адрес, що й на сторінці — вже в кеші)
  const ims = {}; await Promise.all(Object.keys(L.N).map(id => { const u = portrait(P[id]); if (!u) return null; return new Promise(res => { const im = new Image(); im.onload = () => { ims[id] = im; res(); }; im.onerror = () => res(); im.src = u; }); }));
  const rr = (x, y, ww, hh, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + ww, y, x + ww, y + hh, r); g.arcTo(x + ww, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + ww, y, r); g.closePath(); };
  const wrap = (txt, maxW, lines) => { const words = txt.split(/\s+/), out = []; let cur = ''; for (const wd of words) { const t2 = cur ? cur + ' ' + wd : wd; if (g.measureText(t2).width <= maxW || !cur) cur = t2; else { out.push(cur); cur = wd; } } if (cur) out.push(cur);
    if (out.length > lines) { out.length = lines; let l = out[lines - 1]; while (l && g.measureText(l + '…').width > maxW) l = l.slice(0, -1); out[lines - 1] = l + '…'; } return out; };
  const center = treeCenter();
  for (const [id, n] of Object.entries(L.N)) { const p = P[id]; const x = n.x, y = n.y, W = T2.W, H = T2.H;
    g.save(); g.shadowColor = 'rgba(60,40,30,.12)'; g.shadowBlur = 10; g.shadowOffsetY = 3; rr(x, y, W, H, 12); g.fillStyle = p.sex === 'm' ? '#eef4fb' : p.sex === 'f' ? '#fbeff3' : '#fff'; g.fill(); g.restore();
    rr(x, y, W, H, 12); g.lineWidth = id === center ? 2 : 1; g.strokeStyle = p.hyp ? HYP : id === center ? WINE : p.sex === 'm' ? '#c9daee' : p.sex === 'f' ? '#ebcad6' : '#EAE3D9'; if (p.hyp) g.setLineDash([5, 4]); g.stroke(); g.setLineDash([]);
    const ax = x + 14 + 25, ay = y + H / 2; g.save(); g.beginPath(); g.arc(ax, ay, 25, 0, 7); g.closePath(); g.fillStyle = '#EADFD8'; g.fill(); g.clip();
    if (ims[id]) { const im = ims[id], c = pcOf(p); if (c) { const sw = c.s * im.width; g.drawImage(im, c.x * im.width, c.y * im.height, sw, sw, ax - 25, ay - 25, 50, 50); } else { const s2 = Math.max(50 / im.width, 50 / im.height); g.drawImage(im, ax - im.width * s2 / 2, ay - im.height * s2 / 2, im.width * s2, im.height * s2); } }
    else { g.fillStyle = '#4B3A35'; g.font = `19px ${fD}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(initials(p), ax, ay + 1); g.textAlign = 'left'; }
    g.restore(); g.textBaseline = 'alphabetic';
    const tx = x + 14 + 50 + 14, tw = W - (tx - x) - 12; g.fillStyle = INK; g.font = `17px ${fD}`;
    const nl = wrap(tname(p), tw, 2), yr = years(p); const blockH = nl.length * 19 + (yr ? 17 : 0); let ty = y + (H - blockH) / 2 + 15;
    nl.forEach(l => { g.fillText(l, tx, ty); ty += 19; });
    if (yr) { g.fillStyle = MUT; g.font = `13px ${fB}`; g.fillText(yr, tx, ty + 1); }
    if (childAge(p)) { g.fillStyle = WINE; g.font = `700 15px ${fD}`; g.fillText('†', x + W - 18, y + 20); } }
  if (PO) return posterCompose(c, PO, Object.keys(L.N).length, { PAPER, WINE, INK, MUT, fD, fB });
  const blob = await new Promise(r => c.toBlob(r, 'image/png')); if (!blob) throw new Error('canvas');
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `rid-shutykh-derevo-${new Date().toISOString().slice(0, 10)}.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 20000);
  toast(`Картинку збережено: ${c.width}×${c.height} px`);
}
/* Плакат: дерево в рамці з заголовком на аркуші A-формату (300 dpi, у межах можливостей браузера) */
async function posterCompose(tree, PO, n, C) {
  const MM = { A2: [420, 594], A1: [594, 841], A0: [841, 1189] }, land = PO.or === 'land' || (PO.or === 'auto' && tree.width >= tree.height);
  let pw, ph; if (PO.f === 'fit') { pw = tree.width * 1.12; ph = tree.height * 1.12 + tree.width * 0.16; } else { const [a, b] = MM[PO.f] || MM.A1; [pw, ph] = land ? [b, a] : [a, b]; const px = 300 / 25.4; pw *= px; ph *= px; }
  const lim = Math.min(1, 16000 / pw, 16000 / ph, Math.sqrt(140e6 / (pw * ph))); pw = Math.round(pw * lim); ph = Math.round(ph * lim);
  const c = document.createElement('canvas'); c.width = pw; c.height = ph; const g = c.getContext('2d'); const u = Math.min(pw, ph) / 1000; // «одиниця» плаката
  g.fillStyle = C.PAPER; g.fillRect(0, 0, pw, ph);
  // рамка: подвійна лінія й куточки
  const m = 36 * u; g.strokeStyle = C.WINE; g.lineWidth = 3 * u; g.strokeRect(m, m, pw - 2 * m, ph - 2 * m); g.lineWidth = 1 * u; g.strokeRect(m + 9 * u, m + 9 * u, pw - 2 * m - 18 * u, ph - 2 * m - 18 * u);
  g.fillStyle = C.WINE; g.font = `${22 * u}px ${C.fD}`; g.textAlign = 'center'; g.textBaseline = 'middle'; [[m, m], [pw - m, m], [m, ph - m], [pw - m, ph - m]].forEach(([x, y]) => { g.fillStyle = C.PAPER; g.fillRect(x - 16 * u, y - 16 * u, 32 * u, 32 * u); g.fillStyle = C.WINE; g.fillText('✥', x, y); });
  // заголовок
  g.textBaseline = 'alphabetic'; g.fillStyle = C.WINE; g.font = `700 ${64 * u}px ${C.fD}`; g.fillText(PO.t || 'Наш родовід', pw / 2, m + 105 * u);
  g.fillStyle = C.MUT; g.font = `${21 * u}px ${C.fB}`; if (PO.s) g.fillText(PO.s, pw / 2, m + 145 * u);
  g.strokeStyle = C.WINE; g.globalAlpha = .5; g.lineWidth = 1.2 * u; g.beginPath(); g.moveTo(pw / 2 - 160 * u, m + 170 * u); g.lineTo(pw / 2 + 160 * u, m + 170 * u); g.stroke(); g.globalAlpha = 1;
  // дерево
  const top = m + 195 * u, bot = ph - m - 80 * u, side = m + 40 * u, aw = pw - 2 * side, ah = bot - top, sc = Math.min(aw / tree.width, ah / tree.height);
  const dw = tree.width * sc, dh = tree.height * sc; g.imageSmoothingQuality = 'high'; g.drawImage(tree, (pw - dw) / 2, top + (ah - dh) / 2, dw, dh);
  // підпис
  g.fillStyle = C.MUT; g.font = `${15 * u}px ${C.fB}`; g.fillText(`${n} осіб · створив Максим Шутий · shutyi.com.ua · ${new Date().toLocaleDateString('uk-UA')}`, pw / 2, ph - m - 34 * u); g.textAlign = 'left';
  const blob = await new Promise(r => c.toBlob(r, 'image/png')); if (!blob) throw new Error('canvas');
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `plakat-rid-shutykh-${PO.f}-${new Date().toISOString().slice(0, 10)}.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  ev('open', 'poster', PO.f); toast(`Плакат збережено: ${pw}×${ph} px${lim < 1 ? ' (браузер не дозволив більше — для друку однаково вистачить)' : ''}`);
}
/* ── Масштаб і переміщення (спільне для обох видів) ── */
function vpMount() {
  const vp = $('#vp'), st = $('#stage'); if (!vp || !st) return;
  const mode = vp.dataset.mode; S.ui.vp ||= {}; const fresh = !S.ui.vp[mode]; const V = S.ui.vp[mode] ||= { s: 1, x: 0, y: 0 };
  const apply = () => { st.style.transform = `translate(${V.x}px,${V.y}px) scale(${V.s})`; mini(); };
  const size = () => mode === 'all' && S.ui.tl ? { w: S.ui.tl.w, h: S.ui.tl.h } : { w: st.scrollWidth || st.offsetWidth, h: st.scrollHeight || st.offsetHeight };
  const fit = () => { const { w, h } = size(); V.s = Math.min(1, Math.max(0.15, Math.min(vp.clientWidth / w, vp.clientHeight / h) * 0.96)); V.x = (vp.clientWidth - w * V.s) / 2; V.y = Math.max(8, (vp.clientHeight - h * V.s) / 2); apply(); };
  const zoomAt = (k, cx, cy) => { const s2 = Math.min(2.5, Math.max(0.12, V.s * k)); V.x = cx - (cx - V.x) * s2 / V.s; V.y = cy - (cy - V.y) * s2 / V.s; V.s = s2; apply(); };
  const center = id => { const el = st.querySelector(`[data-id="${id}"]`) || st.querySelector('.nd.root'); if (!el) return fit(); if (V.s < 0.35) V.s = 0.55; V.x = vp.clientWidth / 2 - (el.offsetLeft + el.offsetWidth / 2) * V.s; V.y = vp.clientHeight / 2 - (el.offsetTop + el.offsetHeight / 2) * V.s; apply(); };
  function mini() { const c = $('#minimap'); if (!c || !S.ui.tl) return; const g = c.getContext('2d'), L = S.ui.tl; const k = Math.min(c.width / L.w, c.height / L.h); g.clearRect(0, 0, c.width, c.height); g.fillStyle = '#B9B2A6';
    Object.values(L.N).forEach(n => g.fillRect(n.x * k, n.y * k, Math.max(1.5, T2.W * k), Math.max(1.5, T2.H * k)));
    g.strokeStyle = '#2C4A6E'; g.lineWidth = 1.5; g.strokeRect(-V.x / V.s * k, -V.y / V.s * k, vp.clientWidth / V.s * k, vp.clientHeight / V.s * k); c._k = k; }
  if (S.ui.anchor && mode === 'all') { const an = S.ui.anchor; S.ui.anchor = null; const el = st.querySelector(`[data-id="${an.id}"]`); if (el) { V.x = an.sx - el.offsetLeft * V.s; V.y = an.sy - el.offsetTop * V.s; } apply(); }
  else if (fresh) { if (mode === 'all') { { const L = S.ui.tl; V.s = L ? Math.max(innerWidth < 820 ? 0.3 : 0.32, Math.min(0.6, vp.clientWidth / L.w * 0.98)) : 0.5; center(vp.dataset.center); if (L && L.w * V.s <= vp.clientWidth) { V.x = (vp.clientWidth - L.w * V.s) / 2; apply(); } } } else fit(); } else apply();
  vp.classList.toggle('full', !!S.ui.full); document.body.classList.toggle('noscroll', !!S.ui.full);
  let drag = null, moved = false, pinch = null; const pts = new Map();
  const pinchStart = () => { const [p1, p2] = [...pts.values()]; const r = vp.getBoundingClientRect(); pinch = { d: Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1, s: V.s, mx: (p1.x + p2.x) / 2 - r.left, my: (p1.y + p2.y) / 2 - r.top, vx: V.x, vy: V.y }; };
  vp.onpointerdown = e => { if (e.target.closest('.vpctl,.minimap,.tg')) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { pinchStart(); drag = null; moved = true; try { vp.setPointerCapture(e.pointerId); } catch {} } else { drag = { x: e.clientX, y: e.clientY, vx: V.x, vy: V.y }; moved = false; } };
  vp.onpointermove = e => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && pinch) { const [p1, p2] = [...pts.values()]; const r = vp.getBoundingClientRect(); const d = Math.hypot(p1.x - p2.x, p1.y - p2.y); const mx = (p1.x + p2.x) / 2 - r.left, my = (p1.y + p2.y) / 2 - r.top;
      const s2 = Math.min(2.5, Math.max(0.12, pinch.s * d / pinch.d)); // точка між пальцями лишається на місці
      V.x = mx - (pinch.mx - pinch.vx) * s2 / pinch.s; V.y = my - (pinch.my - pinch.vy) * s2 / pinch.s; V.s = s2; apply(); return; }
    if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (!moved && Math.abs(dx) + Math.abs(dy) > 6) { moved = true; try { vp.setPointerCapture(e.pointerId); } catch {} } if (!moved) return; V.x = drag.vx + dx; V.y = drag.vy + dy; apply(); };
  vp.onpointerup = vp.onpointercancel = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (pts.size === 1) { const [p] = [...pts.values()]; drag = { x: p.x, y: p.y, vx: V.x, vy: V.y }; } if (!pts.size) drag = null; };
  vp.addEventListener('click', e => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
  const fb = vp.querySelector('[data-full]'); if (fb) fb.onclick = () => { S.ui.full = !S.ui.full; vp.classList.toggle('full', S.ui.full); document.body.classList.toggle('noscroll', S.ui.full); requestAnimationFrame(() => apply()); };
  vp.querySelectorAll('.tg').forEach(b => b.onclick = ev2 => { ev2.stopPropagation(); const id = b.dataset.exp || b.dataset.sibx || b.dataset.kidx || b.dataset.coll || b.dataset.spx; const el = st.querySelector(`[data-id="${id}"]`);
    S.ui.anchor = el ? { id, sx: V.x + el.offsetLeft * V.s, sy: V.y + el.offsetTop * V.s } : null;
    if (b.dataset.spx) { (S.ui.spx ||= {})[id] = !(S.ui.spx || {})[id]; } else if (b.dataset.exp) { S.ui.exp[id] = 1; const c0 = treeCenter(); if ((SPOUSES[c0] || []).some(x => x.id === id)) { const st0 = [P[c0]?.f, P[c0]?.mo]; while (st0.length) { const a0 = st0.pop(); if (!a0 || !P[a0]) continue; delete S.ui.exp[a0]; st0.push(P[a0].f, P[a0].mo); } } } else if (b.dataset.sibx) S.ui.sibx[id] = 1; else if (b.dataset.kidx) (S.ui.kidx ||= {})[id] = 1; else { const w = b.dataset.cw; if (w === 'up') delete S.ui.exp[id]; else if (w === 'kid') delete (S.ui.kidx || {})[id]; else S.ui.sibx[id] = 0; }
    render(); });
  vp.onwheel = e => { e.preventDefault(); const r = vp.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top); };
  vp.querySelector('[data-zoom-in]').onclick = () => zoomAt(1.25, vp.clientWidth / 2, vp.clientHeight / 2);
  vp.querySelector('[data-zoom-out]').onclick = () => zoomAt(0.8, vp.clientWidth / 2, vp.clientHeight / 2);
  vp.querySelector('[data-zoom-fit]').onclick = fit;
  const mm = $('#minimap'); if (mm) mm.onclick = e => { const r = mm.getBoundingClientRect(), k = mm._k || 1; const sx = (e.clientX - r.left) / k, sy = (e.clientY - r.top) / k; V.x = vp.clientWidth / 2 - sx * V.s; V.y = vp.clientHeight / 2 - sy * V.s; apply(); };
  if (S.ui.findId) { center(S.ui.findId); S.ui.findId = null; }
}

/* ───── Сторінка людини: гілка + картка ───── */
function vPerson() {
  const p = P[S.arg]; if (!p) return `<p>Людину не знайдено. <a href="#/people">До списку</a></p>`;
  curTarget = 'person:' + p.id;
  const par = [p.f, p.mo].filter(x => P[x]);
  const gp = par.flatMap(x => [P[x].f, P[x].mo].filter(y => P[y]));
  const sp = SPOUSES[p.id] || [];
  const ch = KIDS[p.id] || [];
  const gch = ch.flatMap(c => KIDS[c] || []);
  const sib = par.length ? [...new Set(par.flatMap(x => KIDS[x] || []))].filter(x => x !== p.id).sort(byBirth) : [];
  const docs = S.data.documents.filter(d => (d.people || []).includes(p.id));
  const photos = S.data.photos.filter(x => photoOf(x, p.id) && !isVoice(x));
  const stories = S.data.stories.filter(s => s.target === p.id || s.target === 'iv:' + p.id);
  const fams = (p.fam || []).filter(f => FAM[f]);
  const pu = portrait(p);
  const L = (t, ids) => ids.length ? `<div class="bl"><span>${t}</span><div class="row">${ids.map(mini).join('')}</div></div>` : '';
  return `<div class="person">
  <div class="sec" style="align-content:start">
    <div class="phead">${S.me ? `<label class="portrait addp" title="${pu ? 'Додати ще фото' : 'Додати фото'}${canAdd(p.id) ? '' : ' (з\'явиться після підтвердження Максимом)'}">${pu ? pimg(p, ` data-photo="${esc(p.portrait)}" data-pctx="${p.id}" title="Відкрити фото"`) : esc((p.n || '?')[0])}<span class="addp-l">${pu ? '+ фото' : '+ Додати фото'}</span><input type="file" accept="image/*,application/pdf" multiple data-upload="${p.id}" hidden></label>` : `<div class="portrait">${pu ? pimg(p) : esc((p.n || '?')[0])}</div>`}
      <div><div class="eyebrow">${fams.map(f => esc(FAM[f].title)).join(' · ') || 'Картка'}</div><h1>${esc(full(p))}</h1><div class="relrow">${relBadge(p)}</div>${fixBtn(p.id)}</div></div>
    ${(() => { if (!canEdit()) return ''; const grp = photos.filter(x => x.person !== p.id && !x.pending && x.mime !== 'application/pdf'); const need = grp.find(x => !facesOf(x.id)[p.id]); if (!need || (pu && p.pc)) return ''; return `<button class="btn line small facebtn" data-act="face-tag" data-v="${esc(need.id)}" data-p="${esc(p.id)}" title="${esc(need.caption || '')}">🙂 ${esc(short(p))} є на спільному фото — обвести обличчя</button>`; })()}
    <dl class="facts">
      ${p.b ? `<dt>Народження</dt><dd><span class="mono">${esc(p.b)}</span>${p.bp ? ' · ' + esc(p.bp) : ''}</dd>` : p.bp ? `<dt>Звідки</dt><dd>${esc(p.bp)}</dd>` : ''}
      ${relOf(p).c ? `<dt>Версії</dt><dd class="relc">${RELK.con.i}${esc(relOf(p).c)}</dd>` : ''}
      ${p.d ? `<dt>Смерть</dt><dd><span class="mono">${esc(p.d)}</span>${p.dp ? ' · ' + esc(p.dp) : ''}</dd>` : p.dead || p.dp ? `<dt>Смерть</dt><dd>${p.sex === 'f' ? 'померла' : 'помер'}, дата невідома${p.dp ? ' · ' + esc(p.dp) : ''}</dd>` : ''}
      ${p.war ? `<dt>Війна</dt><dd>${{ ww1: 'Перша світова', ww2: 'Друга світова', other: 'воював' }[p.war.w]} — ${esc({ ret: p.sex === 'f' ? 'повернулася' : 'повернувся', kil: p.sex === 'f' ? 'загинула' : 'загинув', mis: p.sex === 'f' ? 'пропала безвісти' : 'пропав безвісти', unk: 'доля невідома' }[p.war.f])}${p.war.h ? ' <span class="small muted">(Є припущення)</span>' : ''}</dd>` : ''}
      ${p.lp ? `<dt>${p.d ? 'Жив' + (p.sex === 'f' ? 'ла' : '') : 'Живе'}</dt><dd>${esc(p.lp)} <a class="small" href="#/geo" data-act="geo-k" data-k="${esc(placeKey(p.lp))}">на карті</a></dd>` : ''}
    </dl>
    ${p.hyp ? `<div class="hypnote">Гіпотеза: зв'язок поки не підтверджено документами.</div>` : ''}
    ${dupNote(p.id)}
    ${(() => { const w = kinShort(S.me?.person_id, p.id); return w ? `<p class="kinme">Вам: <b>${esc(w)}</b> <a href="#" data-act="kin-go" data-id="${p.id}">як саме?</a></p>` : ''; })()}
    ${socBlock(p)}
    <div class="sec" style="margin-top:18px"><h3>Гілка <span class="small muted" style="text-transform:none;letter-spacing:0">натисніть на людину нижче — відкриється її картка</span></h3>
      <div class="branch">
        ${L('Діди й баби', gp)}${L('Батьки', par)}
        <div class="bl"><span>${esc(p.sex === 'f' ? 'Вона' : p.sex === 'm' ? 'Він' : 'Ця людина')}${sp.length ? ' і подружжя' : ''}</span><div class="row"><span class="focus">${ph(p)}<span><b style="font-family:var(--f-display);font-size:16px">${esc(short(p))}</b><br><em class="mono small muted">${esc(life(p))}</em></span></span>${sp.map(s => mini(s.id) + (ucU(s) ? `<span class="small muted" style="align-self:center">${esc(ucLabel(p.id, s))}</span>` : s.date ? `<span class="small muted mono" style="align-self:center">⚭ ${esc(s.date)}</span>` : '')).join('')}</div></div>
        ${L('Брати й сестри', sib)}${L('Діти', ch)}${L('Онуки', gch)}
        ${canEdit() ? `<div class="addrel"><button class="btn line small" data-add="father">+ батько</button><button class="btn line small" data-add="mother">+ мати</button><button class="btn line small" data-add="spouse">+ чоловік / дружина</button><button class="btn line small" data-add="child">+ дитина</button>${par.length ? `<button class="btn line small" data-add="sibling">+ брат / сестра</button>` : ''}</div>` : ''}
        <div class="btns"><a class="btn line small" href="${href('tree', p.id)}">Дерево предків цієї людини</a></div>
      </div>
    </div>
  </div>
  <div class="sec" style="align-content:start;gap:30px">
    ${(() => { const Q = S.me ? ivQuestions(startId()).filter(q => q.id === p.id && p.id !== startId()) : []; const A = new Set(S.data.stories.filter(s => s.target === 'iv:' + p.id).map(s => (s.text.match(/^«([^»]*)»/) || [])[1])); const O = Q.filter(q => !A.has(q.t)); return O.length ? `<div class="sec ivp"><h3>🎙 Чого ми не знаємо про ${esc(short(p))}</h3><ul>${O.slice(0, 5).map(q => { const key = q.id + ':' + q.k; return `<li><div>${esc(q.t)}</div><div class="ivbtn"><button class="btn line small" data-act="iv-open" data-k="${esc(key)}">✍ Знаю відповідь</button><button class="btn line small" data-act="iv-rec" data-id="${q.id}" data-q="${esc(q.t)}">🎙 Голосом</button></div><div class="ivform" id="ivf-${esc(key)}" hidden><textarea class="in" placeholder="Що знаєте? Хто розповідав?"></textarea><div class="btns"><button class="btn small" data-act="iv-save" data-id="${q.id}" data-k="${esc(key)}" data-q="${esc(q.t)}">Зберегти відповідь</button><span class="msg"></span></div></div></li>`; }).join('')}</ul>${O.length > 5 ? `<a class="small" href="#/iv">Ще ${O.length - 5} питань →</a>` : ''}</div>` : ''; })()}
    <div class="sec"><h3>Про людину <span class="btns" style="gap:6px">${canEdit() ? `<button class="btn line small" data-act="edit">Редагувати</button>` : ''}<button class="btn line small" data-act="q-ask">Запитати</button><button class="btn line small" data-act="fb-open" data-id="${p.id}" title="Сімейна книга (PDF): ця людина, її предки й нащадки — з біографіями, фото й джерелами">📖 Книга</button></span></h3>
      ${childAge(p) && !/малим|малою|немовл/.test(p.note || '') ? `<p class="about kd-line">† ${esc(childAge(p).txt)}</p>` : ''}
      ${birthPara(p, docs)}
      ${p.note ? `<div class="about">${glossify(mdLinks(esc(p.note)))}</div>` : ''}
      ${aboutMore(p, docs)}
      ${!p.note && !docs.length && !ridMentions(p.id).length ? `<p class="muted">Поки нічого не написано.${canEdit() ? ' Натисніть «Редагувати», щоб додати.' : ''}</p>` : ''}
      ${qAboutHtml(p.id)}
      ${p.last?.by ? `<div class="lastedit">Остання зміна: ${esc(who(p.last.by))}, ${esc(when(p.last.at))}${isOwner() ? ` · <a href="#" data-act="history">історія змін</a>` : ''}</div>` : ''}
    </div>
    ${(p.src || []).length ? `<div class="sec"><h3>Джерела в архівах</h3><ul class="srcs">${p.src.map(s => `<li><a href="${esc(s.u)}" target="_blank" rel="noopener noreferrer">${esc(s.t)}</a> <span class="muted small">${esc(srcSite(s.u))}</span></li>`).join('')}</ul></div>` : ''}
    <div class="sec"><h3>Документи ${canEdit() ? `<button class="btn line small" data-act="docform">+ Архівний документ</button>` : ''}</h3>
      ${canEdit() && S.ui.docform ? `<div class="docform"><input class="in" id="dtitle" placeholder="Назва: напр. «Народження Микити Максимовича»"><input class="in" id="ddate" placeholder="Дата, напр. 27.05.1818"><input class="in" id="dsrc" placeholder="Джерело: архів, книга, запис №"><label class="btn line small" style="cursor:pointer">Вибрати скани<input type="file" accept="image/*" multiple data-docup="${p.id}" hidden></label><div class="msg" id="dmsg"></div></div>` : ''}
      ${docs.length ? `<div class="thumbs">${docs.map(docCard).join('')}</div>` : `<p class="muted">Документів поки немає.</p>`}
      ${parDocs(p, docs)}</div>
    <div class="sec"><h3>Фото ${S.me ? `<label class="btn line small" style="cursor:pointer" title="Портрет, родинне фото або скан документа (свідоцтво, лист, довідка)${canAdd(p.id) ? '' : '. Фото з\'явиться на сайті після підтвердження Максимом.'}">Додати фото чи документ<input type="file" accept="image/*,application/pdf" multiple data-upload="${p.id}" hidden></label>` : ''}</h3>
      <div class="msg" id="upmsg"></div>
      ${photos.length ? `<div class="thumbs">${photos.map(x => `${x.pending ? '<div class="phpend">' : ''}<button class="doc" data-photo="${x.id}"><span class="im">${x.mime === 'application/pdf' ? '<span class="ph" style="width:100%;height:100%">PDF</span>' : `<img src="${img('photo=' + x.id, true)}" alt="" loading="lazy">`}</span><span>${x.pending ? '<b class="pend-l">Чекає підтвердження</b><br>' : ''}${p.portrait === x.id ? '<b style="font-size:12px;color:var(--seal)">Головне фото</b><br>' : ''}${esc(x.caption || '')}${x.pending && x.by ? `<br><small class="muted">додав(ла): ${esc(who(x.by))}</small>` : ''}</span></button>${x.pending ? `${isOwner() ? `<div class="btns pend-b"><button class="btn small" data-act="ph-ok" data-id="${x.id}">✓ Показати всім</button><button class="btn line small" data-act="ph-done" data-id="${x.id}" title="Фото вже враховане: ви обробили його й додали самі. Прибрати з черги — без позначки «відхилено»">✓ Вирішено</button><button class="btn line small" data-act="ph-no" data-id="${x.id}">✕ Відхилити</button></div>` : ''}</div>` : ''}`).join('')}</div>` : `<p class="muted">Фото ще немає. Сюди можна додати все: портрет, родинні фото, скани документів (свідоцтва, листи, довідки), PDF. Перше фото стане головним (портретом у дереві); змінити — відкрийте фото → «⋯» → «Зробити головним». Під кожним фото можна написати підпис: хто, коли, де.</p>`}
    </div>
    ${voiceSec(p)}
    <div class="sec"><h3>Спогади</h3>${storiesHtml(stories)}${canAdd(p.id) ? storyForm(p.id) : noAdd}</div>
  </div></div>`;
}
// документи батька й матері під документами людини — згорнуто, з підписом «документи матері: …»
function parDocs(p, own) {
  const ownIds = new Set(own.map(d => d.id));
  return [['f', 'батька'], ['mo', 'матері']].map(([k, t]) => {
    const par = P[p[k]]; if (!par) return '';
    const ds = S.data.documents.filter(d => (d.people || []).includes(par.id) && !ownIds.has(d.id)); if (!ds.length) return '';
    const key = p.id + ':' + k, open = (S.ui.pdOpen || {})[key];
    return `<details class="pdocs" data-pd="${esc(key)}"${open ? ' open' : ''}><summary>Документи ${t} — ${esc(full(par))} <span class="muted small">(${ds.length})</span></summary><div class="thumbs">${ds.map(docCard).join('')}</div></details>`;
  }).join('');
}
document.addEventListener('toggle', e => { const h = e.target; if (h.matches?.('details[data-hs]')) { (S.ui.hsOpen = S.ui.hsOpen || {})[h.dataset.hs] = h.open; const b = document.querySelector('[data-act="hs-all"]'); if (b) { const ds = [...document.querySelectorAll('details.hsec[data-hs]')].filter(x => /^\d+$/.test(x.dataset.hs)); b.textContent = ds.every(x => x.open) ? 'Згорнути все' : 'Читати все'; } } }, true);
document.addEventListener('toggle', e => { const d = e.target; if (d.matches?.('details[data-pd]')) { (S.ui.pdOpen = S.ui.pdOpen || {})[d.dataset.pd] = d.open; } }, true);
/* ── Пояснення старих і архівних слів: слово* + виноска під текстом ── */
const GLOSS = [
  [/«шут(?:ий|а|е|ого|ої)»/i, 'шутий', 'у Грінченка — «той, кому бракує звичного»: безрогий, безвухий; «шутий чоловік» — лисий.'],
  [/нив[а-яіїєґ']* на (?:один|два|три|чотири|п'ять|\d+) д(?:ень|ні|нів)/i, 'нива на … днів', 'ділянка, яку можна було зорати приблизно за стільки днів; міра роботи, а не точна площа.'],
  [/упряж(?:ок|ки|ку|ка|ці)?(?![а-яіїєґ])/i, 'упряж', 'у старих описах землі — ділянка, яку зорювали за один проміжок роботи коней до відпочинку; розмір не сталий.'],
  [/артіл[а-яіїєґ']*/i, 'артіль', 'добровільне об\'єднання селян чи ремісників для спільної роботи; на початку 1930-х так часто називали колгоспи.'],
  [/колгосп[а-яіїєґ']*/i, 'колгосп', 'колективне господарство: селян примушували віддавати землю, худобу й реманент і працювати разом за трудодні.'],
  [/сільрад[а-яіїєґ']*/i, 'сільрада', 'сільська рада — місцева влада в селі за радянських часів; вела записи актів цивільного стану.'],
  [/ЗАГС[а-яіїєґ']*/, 'ЗАГС', 'відділ записів актів громадянського стану (народження, шлюби, смерті); з 1920-х замінив церковні метрики. Тепер — РАЦС.'],
  [/РАЦС[а-яіїєґ']*/, 'РАЦС', 'відділ реєстрації актів цивільного стану — сучасна назва ЗАГСу.'],
  [/метричн[а-яіїєґ']* книг[а-яіїєґ']*|метрик[аиуі](?![а-яіїєґ'])/i, 'метрична книга', 'церковна книга, куди священник записував народження (хрещення), шлюби й смерті парафіян.'],
  [/сповідн[а-яіїєґ']* відомост[а-яіїєґ']*|сповідальн[а-яіїєґ']*/i, 'сповідна відомість', 'щорічний церковний список усіх парафіян по дворах із віком кожного — хто був на сповіді й причасті.'],
  [/ревізьк[а-яіїєґ']* казк[а-яіїєґ']*/i, 'ревізька казка', 'перепис населення Російської імперії для оподаткування (1719–1858): списки родин по дворах.'],
  [/кріпа[кц][а-яіїєґ']*/i, 'кріпак', 'селянин, прикріплений до землі пана: не міг вільно переїхати й мусив працювати на поміщика. Кріпацтво скасували 1861 року.'],
  [/посполит[а-яіїєґ']*/i, 'посполитий', 'селянин (не козак) у Гетьманщині XVII–XVIII ст.'],
  [/сотн[яіюеї](?![а-яіїєґ'])/i, 'сотня', 'адміністративна одиниця козацького полку на Лівобережжі (наприклад, Басанська сотня Переяславського полку).'],
  [/консисторі[а-яіїєґ']*/i, 'консисторія', 'церковна управа єпархії; у її архіві зберігаються копії метричних книг і сповідних відомостей.'],
  [/запасн[а-яіїєґ']* солдат[а-яіїєґ']*|відставн[а-яіїєґ']* солдат[а-яіїєґ']*/i, 'запасний (відставний) солдат', 'чоловік, що відслужив строкову військову службу і був звільнений у запас.'],
  [/хрещен[а-яіїєґ']* (?:батьк|мат)[а-яіїєґ']*|восприємник[а-яіїєґ']*/i, 'хрещені', 'хресні батьки (восприємники), записані в метриці при хрещенні дитини.'],
  [/граф[а-яіїєґ']* Апраксин[а-яіїєґ']*|Апраксин[а-яіїєґ']*/i, 'граф Апраксин', 'граф Олександр Петрович Апраксин (1784–1845) — полковник, учасник війни 1812 року, камергер. По матері — онук останнього гетьмана Кирила Розумовського, якому в 1787 р. належали Вороньки. Є припущення, що маєток перейшов до Апраксиних через матір, Єлизавету Кирилівну Розумовську. Граф помер 1845 р., тому в метриках 1848 р. селяни — кріпаки «спадкоємців покійного графа Апраксина». 1850 р. Вороньки купив Аркадій Кочубей для сина Миколи.'],
  [/Аркаді[а-яіїєґ']* (?:Васильович[а-яіїєґ']* )?Кочубе[а-яіїєґ']*/i, 'Аркадій Кочубей', 'Аркадій Васильович Кочубей (1790–1878) — поміщик, власник Згурівки. 1850 р. купив маєток у Вороньках для сина Миколи. Залишив спогади «Семейная хроника. Записки А. В. Кочубея» (1890).'],
  [/Микол[а-яіїєґ']* (?:Аркадійович[а-яіїєґ']* )?Кочубе[а-яіїєґ']*/i, 'Микола Кочубей', 'Микола Аркадійович Кочубей (нар. 1827) — син Аркадія Кочубея, власник Вороньків. 1858 р. одружився з Оленою Сергіївною Волконською, донькою декабриста; з 1860 р. родина постійно жила у Вороньках. Рік смерті в джерелах різний (1864, 1865 або 1868).'],
  [/Михайл[а-яіїєґ']* (?:Миколайович[а-яіїєґ']* )?Кочубе[а-яіїєґ']*/i, 'Михайло Кочубей', 'Михайло Миколайович Кочубей (1863, Вороньки — 1935) — останній власник Вороньків. Драматург (псевдонім «Вороньчук»), автор комедій «Халепа», «Оксана». 1896–1900 — предводитель дворянства Козелецького повіту. 1908 р. відкрив у Вороньках земську школу. 1918 р. маєток забрали більшовики.'],
  [/Кочубе(?:ї|їв|ям|ями|ях)(?![а-яіїєґ'])/i, 'Кочубеї', 'український дворянський рід. Вороньками володіли з 1850 до 1918 р.: Аркадій Васильович (купив маєток), його син Микола Аркадійович і онук Михайло Миколайович.'],
  [/Мандрик[а-яіїєґ']*/i, 'Мандрика', 'Андрій Мандрика — полковий осавул; за описом 1787 р. разом із гетьманом Кирилом Розумовським володів частиною Вороньків. Рід Мандриків — козацька старшина Лівобережжя.'],
  [/Розумовськ[а-яіїєґ']*/i, 'Розумовські', 'Кирило Григорович Розумовський (1728–1803) — останній гетьман Війська Запорозького (1750–1764), родом із Лемешів на Козелеччині. 1787 р. — співвласник Вороньків. Його донька Єлизавета Кирилівна — мати графа Олександра Апраксина.'],
  [/Волконськ[а-яіїєґ']*/i, 'Волконські', 'декабрист князь Сергій Григорович Волконський і його дружина Марія Миколаївна після повернення із Сибіру жили в маєтку доньки Олени (дружини Миколи Кочубея) у Вороньках; там і поховані (Марія — 1863, Сергій — 1865).'],
  [/Рум[\u02bc'’]?янцевськ[а-яіїєґ']* опис[а-яіїєґ']*|Генеральн[а-яіїєґ']* опис[а-яіїєґ']*/i, 'Рум\u02bcянцевський опис', 'перепис кожного двору Гетьманщини 1765–1769 рр. за наказом Катерини II (ЦДІАК, ф. 57): люди з віком, земля, худоба.'],
  [/ревізі[яїюи](?![а-яіїєґ'])/i, 'ревізія', 'перепис населення для подушного податку; на Лівобережжі — з 1782 р.'],
  [/підсусід[а-яіїєґ']*/i, 'підсусідки', 'бідні селяни без власного двору, що жили «у сусідах» і працювали на господаря.'],
  [/служител[а-яіїєґ']*/i, 'служитель', 'у переписах — наймит або слуга, що жив у чужій родині.'],
  [/урочищ[а-яіїєґ']*/i, 'урочище', 'народна назва місцевості: поле, ліс, могила, балка.'],
  [/погосподарськ[а-яіїєґ']* книг[а-яіїєґ']*/i, 'погосподарська книга', 'облік у сільраді з 1935 р.: хто живе в господарстві, дати народження, смерті, вибуття.'],
  [/пропа(?:в|ла|ли) безвісти/i, 'пропав безвісти', 'доля невідома — не те саме, що загинув; багато таких потрапили в полон або загинули, частина вижила.'],
  [/ЦДІАК/, 'ЦДІАК', 'Центральний державний історичний архів України (Київ): документи до 1917 р.'],
  [/ДАЧО/, 'ДАЧО', 'Державний архів Чернігівської області: метричні книги наших сіл.'],
  [/⚭/, '⚭', 'знак шлюбу: «одружився / одружилася з», далі дата вінчання.'],
];
function glossify(html) { // html уже безпечний (екранований); замінюємо лише текст поза тегами, кожне слово — один раз
  const used = [];
  const out = String(html).split(/(<[^>]+>)/).map(part => {
    if (part.startsWith('<')) return part;
    GLOSS.forEach(([re, key, def]) => { if (used.some(u => u[0] === key)) return; const m = part.match(re); if (!m) return;
      used.push([key, def]); part = part.slice(0, m.index) + m[0] + '\u0001' + (used.length - 1) + '\u0002' + part.slice(m.index + m[0].length); });
    return part; }).join('').replace(/\u0001(\d+)\u0002/g, (_, i) => `<sup class="gl" title="${esc(used[i][0] + ' — ' + used[i][1])}">*</sup>`);
  return out + (used.length ? `<div class="gnotes">${used.map(([k, d]) => `<p><b>* ${esc(k)}</b> — ${esc(d)}</p>`).join('')}<p><a class="small" href="#/terms">Усі пояснення з джерелами →</a></p></div>` : '');
}
const storiesHtml = list => list.map(s => `<div class="story"><div>${glossify(esc(s.text))}</div><div class="m"><span>${esc(who(s.by))} · ${esc(when(s.at))}</span>${isOwner() || s.by === S.me.id ? `<button data-delstory="${s.id}">видалити</button>` : ''}</div></div>`).join('');
const storyForm = target => `<div class="sec" style="gap:8px"><textarea class="in" id="st-${esc(target)}" placeholder="Що ви пам'ятаєте або чули від старших? Хто розповідав, коли це було?"></textarea><div class="btns"><button class="btn" data-story="${esc(target)}">Зберегти спогад</button><span class="msg" id="stm-${esc(target)}"></span></div></div>`;

/* ───── Редагування людини ───── */
function personForm(p, preset = {}) {
  const v = Object.assign({ n: '', pt: '', s: '', m: '', sex: '', b: '', bp: '', d: '', dp: '', lp: '', note: '', f: '', mo: '', hyp: false, fam: [] }, p || {}, preset);
  const opts = (sel, sex) => `<option value="">— невідомо —</option>` + Object.values(P).filter(x => !p || x.id !== p.id).filter(x => !sex || !x.sex || x.sex === sex).sort((a, b) => short(a).localeCompare(short(b), 'uk')).map(x => `<option value="${x.id}"${x.id === sel ? ' selected' : ''}>${esc(full(x))}${life(x) ? ' (' + esc(life(x)) + ')' : ''}</option>`).join('');
  return `<div class="grid2">
    <label class="f">Ім'я<input class="in" id="e-n" value="${esc(v.n)}"></label>
    <label class="f">По батькові<input class="in" id="e-pt" value="${esc(v.pt)}"></label>
    <label class="f">Прізвище<input class="in" id="e-s" value="${esc(v.s)}"></label>
    <label class="f">Дівоче прізвище<input class="in" id="e-m" value="${esc(v.m)}"></label>
    <label class="f">Стать<select class="in" id="e-sex"><option value="">—</option><option value="m"${v.sex === 'm' ? ' selected' : ''}>чоловік</option><option value="f"${v.sex === 'f' ? ' selected' : ''}>жінка</option></select></label>
    <label class="f">Народження (дата або рік)<input class="in" id="e-b" value="${esc(v.b)}" placeholder="напр. 12.03.1911 або ~1910"></label>
    <label class="f">Місце народження<input class="in" id="e-bp" value="${esc(v.bp)}"></label>
    <div class="f"><span>Смерть</span><input class="in" id="e-d" value="${esc(v.d)}" placeholder="дата або рік, якщо відомі"><label class="edead"><input type="checkbox" id="e-dead"${v.dead ? ' checked' : ''}> ${v.sex === 'f' ? 'Померла' : v.sex === 'm' ? 'Помер' : 'Помер(ла)'}, дата невідома</label></div>
    <label class="f">Місце смерті / поховання<input class="in" id="e-dp" value="${esc(v.dp)}"></label>
    <label class="f">Місце проживання (де живе або жив)<input class="in" id="e-lp" value="${esc(v.lp)}" placeholder="Напр.: Київ; Бровари; Вороньки"></label>
    <label class="f">Війна<select class="in" id="e-ww"><option value="">не воював / невідомо</option>${[['ww1', 'Перша світова'], ['ww2', 'Друга світова'], ['other', 'інша війна']].map(([k, t]) => `<option value="${k}"${v.war?.w === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="f">Доля на війні<select class="in" id="e-wf">${[['ret', 'повернувся'], ['kil', 'загинув'], ['mis', 'пропав безвісти'], ['unk', 'невідомо']].map(([k, t]) => `<option value="${k}"${(v.war?.f || 'unk') === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="f" title="Зазвичай рахується сама: є документ → «Підтверджено документом»; припущення → «Потребує перевірки»; зі слів родичів → «Зі спогадів».">Достовірність<select class="in" id="e-rk"><option value="">сама (за документами й описом)</option>${['doc', 'mem', 'chk'].map(k => `<option value="${k}"${v.rel?.k === k ? ' selected' : ''}>${RELK[k].t}</option>`).join('')}</select></label>
    <label class="f" title="Якщо дати, імена чи батьки в різних джерелах розходяться — коротко опишіть, як саме.">Суперечливі версії<input class="in" id="e-rc" value="${esc(v.rel?.c || '')}" placeholder="Напр.: у метриці 1856, у сповідній — 1858"></label>
    <label class="f">Батько<select class="in" id="e-f">${opts(v.f, 'm')}</select></label>
    <label class="f">Мати<select class="in" id="e-mo">${opts(v.mo, 'f')}</select></label>
  </div>
  <label class="f">Про людину: що відомо, звідки, історії<textarea class="in" id="e-note" style="min-height:160px">${esc(v.note)}</textarea></label>
  <div class="grid2"><div class="f">Гілки роду<div class="chips">${S.data.families.map(f => `<label class="small"><input type="checkbox" class="e-fam" value="${f.id}"${(v.fam || []).includes(f.id) ? ' checked' : ''}> ${esc(f.title)}</label>`).join('')}</div></div>
  <label class="small" style="align-self:end"><input type="checkbox" id="e-hyp"${v.hyp ? ' checked' : ''}> Гіпотеза: зв'язок не підтверджено документами</label></div>`;
}
function readForm() {
  const g = id => ($('#e-' + id)?.value || '').trim();
  return { n: g('n'), pt: g('pt'), s: g('s'), m: g('m'), sex: g('sex'), b: g('b'), bp: g('bp'), d: g('d'), dp: g('dp'), lp: g('lp'), f: g('f'), mo: g('mo'), note: g('note'), dead: !!$('#e-dead')?.checked && !g('d'), hyp: !!$('#e-hyp')?.checked, fam: [...document.querySelectorAll('.e-fam:checked')].map(x => x.value), rel: { k: $('#e-rk')?.value || '', c: ($('#e-rc')?.value || '').trim() }, war: $('#e-ww')?.value ? { w: $('#e-ww').value, f: $('#e-wf')?.value || 'unk', ...(P[S.arg]?.war?.h ? { h: true } : {}) } : null };
}
function modal(html) { $('#layer').innerHTML = `<div class="scrim" data-close-scrim><div class="modal" role="dialog" aria-modal="true"><button type="button" class="mx" data-act="close" aria-label="Закрити" title="Закрити (Esc)">×</button>${html}</div></div>`; if (matchMedia('(hover:hover)').matches) setTimeout(() => $('#layer .modal input:not([type=file]), #layer .modal textarea')?.focus(), 30); }
const closeLayer = () => { $('#layer').innerHTML = ''; document.body.classList.remove('noscroll'); };
function openEdit(p) {
  const sp = SPOUSES[p.id] || [];
  modal(`<h2>${esc(full(p))}</h2>${personForm(p)}
    <div class="sec"><h3>Подружжя</h3><div class="row">${sp.map(s => `<span class="mini">${esc(short(P[s.id]))} <input class="in" data-udate="${s.u}" value="${esc(s.date || '')}" placeholder="дата шлюбу" title="Дата шлюбу: ДД.ММ.РРРР (можна й без року — ДД.ММ). Зберігається одразу." style="width:130px;display:inline-block"> <button class="btn line small" data-unlink="${s.u}" title="Прибрати зв'язок">×</button></span>`).join('') || '<span class="muted small">немає</span>'}</div>
      <div class="btns"><select class="in" id="e-sp" style="max-width:320px"><option value="">Додати наявну людину…</option>${Object.values(P).filter(x => x.id !== p.id && !sp.some(s => s.id === x.id)).sort((a, b) => short(a).localeCompare(short(b), 'uk')).map(x => `<option value="${x.id}">${esc(full(x))}</option>`).join('')}</select><input class="in" id="e-spd" placeholder="дата шлюбу" style="max-width:160px"><button class="btn line small" data-act="link-spouse">Додати</button></div></div>
    <div class="btns"><button class="btn" data-act="save">Зберегти</button><button class="btn line" data-act="close">Скасувати</button>${isOwner() && !p.root ? `<button class="btn danger" data-act="delete" style="margin-left:auto">Видалити картку</button>` : ''}<span class="msg" id="emsg"></span></div>
    ${isOwner() && p.id ? `<details class="mergebox"><summary>Ця людина є в дереві двічі? Об'єднати картки</summary>
      <p class="small muted">Оберіть другу картку цієї ж людини. Усе з неї — діти, чоловік/дружина, фото, спогади, документи, акаунт — перейде сюди, порожні поля доповняться, а дубль зникне.</p>
      <div class="btns">${peopleList('mgpeople')}<input class="in" id="mg-p" list="mgpeople" placeholder="Друга картка…" autocomplete="off" style="flex:1;min-width:220px"><button class="btn line" data-act="merge">Об'єднати</button></div></details>` : ''}`);
  S.ui.editing = p.id;
}
// з тексту запитання («Чоловік Митрюк Іван Михайлович 1971, батько Соломії») — підставити ПІБ і рік у форму; решту людина перевіряє сама
function qPrefill(text, kind) {
  const t = String(text || ''); const W = "[А-ЯІЇЄҐ][а-яіїєґ'’ʼ-]+";
  const m = t.match(new RegExp(`(${W})\\s+(${W})(?:\\s+(${W}(?:вич|вна|ич|івна|ївна)))?`));
  const set = (id, v) => { const e = document.getElementById(id); if (e && v && !e.value) e.value = v; };
  const skip = /^(Чоловік|Дружина|Син|Донька|Дочка|Батько|Мати|Брат|Сестра|Його|Її|Він|Вона)$/;
  if (m) { let [, a, b2, c] = m; if (skip.test(a)) { const r = t.slice(t.indexOf(a) + a.length).match(new RegExp(`(${W})\\s+(${W})(?:\\s+(${W}))?`)); if (r) [, a, b2, c] = r; }
    if (c && /(вич|вна|ич)$/.test(c)) { set('e-s', a); set('e-n', b2); set('e-pt', c); } else { set('e-n', a); set('e-s', b2); } }
  const y = t.match(/\b(1[89]\d\d|20[0-2]\d)\b/); if (y) set('e-b', y[1]);
  const note = document.getElementById('e-note'); if (note && !note.value) note.value = 'Зі слів родички (запитання на сайті): ' + t.trim();
}
// «Вже є на сайті»: спершу зареєстровані родичі, яких ще не прив'язано, потім пошук по всіх картках
function linkCands(kind, base) {
  const by = y => +((String(y || '').match(/\d{4}/) || [0])[0]);
  const ok = p => {
    if (p.id === base.id || p.id === base.f || p.id === base.mo) return false;
    if (kind === 'child') { if (base.sex === 'f' ? p.mo : p.f) return false; if (by(base.b) && by(p.b) && by(p.b) < by(base.b) + 12) return false; }
    if (kind === 'father' && p.sex === 'f') return false; if (kind === 'mother' && p.sex === 'm') return false;
    if ((kind === 'father' || kind === 'mother') && by(base.b) && by(p.b) && by(p.b) > by(base.b) - 12) return false;
    if (kind === 'spouse' && (SPOUSES[base.id] || []).some(x => x.id === p.id)) return false;
    if (kind === 'sibling' && (p.f || p.mo)) return false;
    return true;
  };
  const acc = new Set(S.data.accounts || []);
  const L = Object.values(P).filter(ok);
  return [...L.filter(p => acc.has(p.id)), ...L.filter(p => !acc.has(p.id) && !p.f && !p.mo && (p.last?.action === 'create'))].slice(0, 8);
}
function pickExisting(kind, base) {
  const c = linkCands(kind, base), acc = new Set(S.data.accounts || []);
  return `<div class="pickex"><b>Ця людина вже є на сайті?</b> <span class="small muted">Оберіть — і її буде прив'язано (нова картка не потрібна).</span>
    ${c.length ? `<div class="chips">${c.map(p => `<button type="button" class="chip" data-act="lk-pick" data-v="${esc(plabel(p))}">${acc.has(p.id) ? '👤 ' : ''}${esc(plabel(p))}</button>`).join('')}</div>` : ''}
    <div class="btns"><input class="in" id="lk-p" list="lkpeople" placeholder="Почніть вводити ім'я…" autocomplete="off" style="flex:1;min-width:200px"><button class="btn" data-act="lk-do" data-kind="${kind}" data-base="${base.id}">Прив'язати</button></div>
    ${peopleList('lkpeople')}<span class="msg" id="lkmsg"></span>
    <p class="small muted" style="margin:8px 0 0">${c.some(p => acc.has(p.id)) ? '👤 — уже зареєстровані на сайті. ' : ''}Немає в списку — заповніть нову картку нижче.</p></div>`;
}
function openAdd(kind, base) {
  const preset = {}; const link = {};
  const ttl = { father: 'Додати батька', mother: 'Додати матір', spouse: 'Додати чоловіка / дружину', child: 'Додати дитину', sibling: 'Додати брата чи сестру', new: 'Нова людина' }[kind];
  if (kind === 'father') { preset.sex = 'm'; link.parentOf = base.id; preset.s = base.s; preset.fam = base.fam; }
  if (kind === 'mother') { preset.sex = 'f'; link.parentOf = base.id; preset.fam = base.fam; }
  if (kind === 'spouse') { preset.sex = base.sex === 'm' ? 'f' : base.sex === 'f' ? 'm' : ''; link.spouseOf = base.id; preset.fam = base.fam; }
  if (kind === 'child') { const sp = SPOUSES[base.id] || []; if (base.sex === 'f') { preset.mo = base.id; if (sp.length === 1) preset.f = sp[0].id; } else { preset.f = base.id; if (sp.length === 1) preset.mo = sp[0].id; } preset.s = base.sex === 'f' ? (P[preset.f]?.s || base.s) : base.s; preset.fam = base.fam; }
  if (kind === 'sibling') { preset.f = base.f; preset.mo = base.mo; preset.s = base.s; preset.fam = base.fam; }
  modal(`<h2>${ttl}${base ? ' — ' + esc(short(base)) : ''}</h2>${base && kind !== 'new' ? pickExisting(kind, base) : ''}${personForm(null, preset)}
    <div class="btns"><button class="btn" data-act="create">Створити картку</button><button class="btn line" data-act="close">Скасувати</button><span class="msg" id="emsg"></span></div>`);
  S.ui.adding = { link };
}

/* ───── Родини ───── */
function famMembersHtml(f) {
  const set = new Set((f.members || []).filter(id => P[id]));
  Object.values(P).forEach(p => { if ((p.fam || []).includes(f.id)) set.add(p.id); });
  const g = {}; [...set].forEach(id => { const k = GEN[id] ?? 99; (g[k] ||= []).push(id); });
  return Object.keys(g).map(Number).sort((a, b) => b - a).map(k => `<div class="gen"><span>${k === 99 ? 'Зв\'язок ще не встановлено' : GENNAME(k)}</span><div class="chips">${g[k].sort(byBirth).map(mini).join('')}</div></div>`).join('');
}
function vFamilies() {
  const ft = S.ui.ftab || 'rid', tabs = `<div class="seg mtabs"><button type="button" class="${ft === 'rid' ? 'on' : ''}" data-act="fam-tab" data-v="rid">Історія роду</button><button type="button" class="${ft === 'br' ? 'on' : ''}" data-act="fam-tab" data-v="br">Гілки</button></div>`;
  if (ft === 'rid') return `<div class="pghead"><h1 title="Розповідь про родину й гілки — за документами.">Історія</h1>${tabs}<p class="tabnote" title="Що відомо лише з переказів, так і позначено; здогадки — «Є припущення». Імена — посилання на картки.">Що відомо лише з переказів, так і позначено; здогадки — «Є припущення». Імена — посилання на картки.</p></div>${vRid()}`;
  return `<div class="pghead"><h1 title="Розповідь про родину й гілки — за документами.">Історія</h1>${tabs}<p class="tabnote" title="Кожна гілка має своє село та свою історію. Внизу кожної можна дописати спогади — їх побачать усі родичі з доступом.">Кожна гілка має своє село та свою історію. Внизу кожної можна дописати спогади — їх побачать усі родичі з доступом.</p></div>
  <div class="chips stk2 famchips">${S.data.families.map(f => `<a class="btn line small" href="#fam-${f.id}" data-act="fam-jump" data-id="${f.id}">${esc(f.title)}</a>`).join('')}</div>
  <div class="famlist">${S.data.families.map(famBlock).join('')}</div>`;
}
function famBlock(f) {
  return `<article class="fam" id="fam-${f.id}"><div class="sec" style="align-content:start">
    <div><div class="eyebrow">${esc(f.side || '')}</div><h2>${esc(f.title)}</h2><div class="muted small">${esc(f.places || '')}</div></div>
    <div class="famstory">${glossify(f.story || '')}</div>
    ${canEdit() ? `<div><button class="btn line small" data-famedit="${f.id}">Редагувати історію</button></div>` : ''}
    <div class="sec"><h3>Хто в гілці</h3><div class="fammem">${famMembersHtml(f)}</div></div>
    <div class="sec"><h3>Спогади про родину</h3>${storiesHtml(S.data.stories.filter(s => s.target === 'fam:' + f.id))}${canAdd('fam:' + f.id) ? storyForm('fam:' + f.id) : ''}</div>
    <div class="sec"><h3>Голоси роду <button class="btn line small" data-act="v-rec" data-id="fam:${f.id}">🎙 Записати історію</button></h3>${(() => { const vv = voicesOf('fam:' + f.id).filter(x => !x.pending || isOwner() || x.by === S.me.id); return vv.length ? `<div class="vlist">${vv.map(voiceRow).join('')}</div>` : '<p class="small muted">Загальних записів про цей рід ще немає.</p>'; })()}</div>
  </div></article>`;
}
function vFamily() { const f = FAM[S.arg]; if (!f) return vFamilies(); curTarget = 'fam:' + f.id; return `<p><a href="#/families" class="small">← Усі родини</a></p><div class="famlist">${famBlock(f)}</div>`; }

/* ───── Люди ───── */

/* ───── Запитання й уточнення ─────
   Будь-хто з родичів пише: «тут помилка», «що відомо про…» або «знайдіть людину».
   Автор бачить свої запитання й відповіді; Максим (і редактори) — усі, змінює стан і відповідає. */
const QKIND = { find: 'Знайти людину', ask: 'Питання', fix: 'Уточнення / помилка' };
const QSTAT = { new: 'Нове', work: 'Шукаємо', found: 'Знайдено', closed: 'Закрито' };
const qList = () => S.data?.questions || [];
const qSeen = () => { try { return localStorage.getItem('rs_qseen') || ''; } catch { return ''; } };
function qBadge() {
  if (!S.data) return 0;
  if (canEdit()) return qList().filter(q => q.status === 'new').length;
  const seen = qSeen(); return qList().filter(q => q.by === S.me.id && q.updBy && q.updBy !== S.me.id && q.upd > seen).length;
}
function qAboutHtml(pid) {
  const list = qList().filter(q => q.person === pid);
  if (!list.length) return '';
  const open = list.filter(q => q.status === 'new' || q.status === 'work').length;
  return `<p class="small" style="margin:8px 0 0"><a href="${href('q')}">${canEdit() ? 'Запитань про цю людину' : 'Ваших запитань про цю людину'}: ${list.length}${open ? ` (відкритих: ${open})` : ''}</a></p>`;
}
const fixBtn = (id, cls = '') => S.me ? (isOwner() && fixPend(id).length ? `<a class="fxwait" href="#/q">Чекає вашого підтвердження: ${fixPend(id).length} ${fixPend(id).length === 1 ? 'правка' : 'правки'} →</a>` : '') + `<button type="button" class="fixbtn ${cls}" data-act="q-fix" data-id="${esc(id)}" title="Бачите помилку чи знаєте більше? Напишіть — перевіримо й виправимо"><span class="fx-ic">✎</span><span>Внести правку</span></button>` : '';
const FIXK = { n: "Ім'я", pt: 'По батькові', s: 'Прізвище', m: 'Дівоче прізвище', sex: 'Стать', b: 'Народження', bp: 'Місце народження', d: 'Смерть', dp: 'Місце смерті', lp: 'Де жив(-ла) / живе', note: 'Опис' };
const fixPend = pid => (S.data.questions || []).filter(q => q.kind === 'fix' && q.person === pid && (q.patch || q.padd || q.pdup) && q.pst === '');
const FXREL = { spouse: 'чоловік / дружина', son: 'син', daughter: 'донька', father: 'батько', mother: 'мати', brother: 'брат', sister: 'сестра' };
const fxRelRow = p => `<div class="fxrel"><select class="in" data-fr="rel">${Object.entries(FXREL).filter(([k]) => !((k === 'father' && P[p.f]) || (k === 'mother' && P[p.mo]) || ((k === 'brother' || k === 'sister') && !P[p.f] && !P[p.mo]))).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select><input class="in" data-fr="fio" placeholder="Прізвище Ім'я По батькові"><input class="in" data-fr="b" placeholder="рік народж." inputmode="numeric"><button type="button" class="fxx" data-act="q-fxrm" title="Прибрати">×</button></div>`;
function fxForm(p) {
  const own = isOwner(), f = (k, t, ph = '') => `<label class="f">${t}<input class="in" data-fx="${k}" value="${esc(p[k] || '')}" placeholder="${esc(ph)}"></label>`;
  return `<div class="fxform" data-id="${esc(p.id)}">
    <p class="small muted" style="margin:0 0 10px">${own ? 'Ви власник — усе внесеться одразу.' : 'Виправте, що не так, додайте рідних і напишіть, звідки це відомо. Максим перегляне й одним кліком внесе в дерево.'}</p>
    <details class="fxsec" open><summary>Дані картки</summary><div class="grid2">${f('n', "Ім'я")}${f('pt', 'По батькові')}${f('s', 'Прізвище')}${f('m', 'Дівоче прізвище', 'для жінок')}
      ${f('b', 'Дата народження', 'напр. 14.02.1938 або 1938')}${f('bp', 'Місце народження')}${f('d', 'Дата смерті', 'якщо людина померла')}${f('dp', 'Місце смерті / поховання')}
      ${f('lp', 'Де жив(-ла) / живе')}<label class="f">Стать<select class="in" data-fx="sex"><option value=""${!p.sex ? ' selected' : ''}>—</option><option value="m"${p.sex === 'm' ? ' selected' : ''}>чоловік</option><option value="f"${p.sex === 'f' ? ' selected' : ''}>жінка</option></select></label></div>
    <label class="f">Опис<textarea class="in" data-fx="note" rows="4">${esc(p.note || '')}</textarea></label></details>
    <details class="fxsec"${own ? '' : ' open'}><summary>Додати рідних (чоловік / дружина, діти, батьки…)</summary><div id="fxrels">${fxRelRow(p)}</div><button type="button" class="btn line small" data-act="q-fxmore">+ ще одна людина</button></details>
    <details class="fxsec"><summary>Це дублікат — та сама людина вже є в дереві</summary>${peopleList('fxpeople')}<input class="in" id="fx-dup" list="fxpeople" placeholder="Почніть вводити ім'я другої картки…" autocomplete="off"></details>
    ${own ? '' : `<label class="f">Звідки це відомо / коментар<textarea class="in" id="fx-why" rows="2" placeholder="Напр.: так у свідоцтві; або: так казала бабуся"></textarea></label>`}
    <div class="btns"><button class="btn wine" data-act="q-fxsend">${own ? 'Внести' : 'Надіслати'}</button><button class="btn line" data-act="close">Скасувати</button><span class="msg" id="fx-m"></span></div>
  </div>`;
}
function fxDiff(q) {
  const ch = q.patch || {}, ad = q.padd || [], dup = q.pdup || '', rows = [];
  const can = isOwner() && !q.pst, done = k => q.pst === 'ok' && (q.pkeys || []).includes(k), cut = v => v ? (v.length > 400 ? v.slice(0, 400) + '…' : v) : '—', sx = (k, v) => k === 'sex' ? ({ m: 'чоловік', f: 'жінка' }[v] || '—') : cut(v);
  const cb = k => can ? `<td><input type="checkbox" data-fxk="${k}" checked></td>` : '';
  Object.keys(ch).forEach(k => rows.push(`<tr class="${done(k) ? 'ok' : q.pst ? 'no' : ''}">${cb(k)}<td>${esc(FIXK[k] || k)}</td><td class="was">${esc(sx(k, ch[k][0]))}</td><td class="now">${esc(sx(k, ch[k][1]))}</td></tr>`));
  ad.forEach((x, i) => rows.push(`<tr class="${done('add' + i) ? 'ok' : q.pst ? 'no' : ''}">${cb('add' + i)}<td>Додати: ${esc(FXREL[x.rel] || x.rel)}</td><td class="was">—</td><td class="now">${esc([x.n, x.pt, x.s].filter(Boolean).join(' '))}${x.b ? ', н. ' + esc(x.b) : ''}</td></tr>`));
  if (dup) { const a = P[q.person], b = P[dup]; rows.push(`<tr class="${done('dup') ? 'ok' : q.pst ? 'no' : ''}">${cb('dup')}<td>Дублікат</td><td colspan="2">${b ? `та сама людина, що й <a href="${href('p', dup)}">${esc(plabel(b))}</a>` : 'картку вже об’єднано'}${can && a && b ? `<div class="small" style="margin-top:4px">Залишити: <label><input type="radio" name="fxk-${q.id}" value="${a.id}"${!b.portrait || a.portrait ? ' checked' : ''}> ${esc(short(a))}${a.portrait ? ' (з фото)' : ''}</label> · <label><input type="radio" name="fxk-${q.id}" value="${b.id}"${b.portrait && !a.portrait ? ' checked' : ''}> ${esc(short(b))}${b.portrait ? ' (з фото)' : ''}</label></div>` : ''}</td></tr>`); }
  if (!rows.length) return '';
  return `<table class="fxd"><thead><tr>${can ? '<th></th>' : ''}<th>Що</th><th>Було</th><th>Стане</th></tr></thead><tbody>${rows.join('')}</tbody></table>
    ${can ? `<div class="btns"><button class="btn wine small" data-act="q-fxok" data-id="${q.id}">✓ Підтвердити й внести</button><button class="btn line small" data-act="q-fxno" data-id="${q.id}">Відхилити</button><span class="msg" id="fx-qm-${q.id}"></span></div>`
      : q.pst ? `<p class="small ${q.pst === 'ok' ? 'fx-ok' : 'muted'}">${q.pst === 'ok' ? '✓ Внесено в дерево' : 'Не внесено'}</p>` : '<p class="small muted">Чекає підтвердження Максима</p>'}`;
}
const personOpts = () => `<datalist id="qpeople">${Object.values(P).sort((a, b) => full(a).localeCompare(full(b), 'uk')).map(p => `<option value="${esc(full(p) + (life(p) ? ' (' + life(p) + ')' : ''))}"></option>`).join('')}</datalist>`;
// Пошук людей за будь-якими частинами імені: «настя шута», «Іван Пархомович», «1931»
const nrm_ = t => String(t || '').toLowerCase().replace(/[ʼ’'`]/g, '').replace(/ё/g, 'е');
const personFind = (v, n = 8) => { const w = nrm_(v).split(/\s+/).filter(Boolean); if (!w.length) return [];
  return Object.values(P).map(p => { const h = nrm_([p.n, p.s, p.pt, p.m, p.nick, full(p), life(p)].join(' ')); if (!w.every(x => h.includes(x))) return null; const nn = nrm_(p.n || '').split(/\s+/), ns = nrm_([p.s, p.m].filter(Boolean).join(' ')).split(/\s+/); const sc = w.reduce((a, x) => { const e = x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); return a + (nn.includes(x) ? 6 : ns.includes(x) ? 5 : new RegExp('(^|\\s|\\()' + e + '($|\\s|\\))').test(h) ? 3 : new RegExp('(^|\\s|\\()' + e).test(h) ? 2 : 1); }, 0); return [sc, p]; })
    .filter(Boolean).sort((a, b) => b[0] - a[0] || full(a[1]).localeCompare(full(b[1]), 'uk')).slice(0, n).map(x => x[1]); };
const personByLabel = v => { v = String(v || '').trim(); if (!v) return ''; const p = Object.values(P).find(p => full(p) + (life(p) ? ' (' + life(p) + ')' : '') === v) || Object.values(P).find(p => full(p) === v); return p ? p.id : ''; };
function qForm(pid, kind) {
  kind = kind || (pid ? 'ask' : 'find');
  const p = pid && P[pid];
  return `<div class="qform" data-kind="${kind}">
    <div class="seg" role="group" aria-label="Що саме">${Object.entries(QKIND).filter(([k]) => !(p && k !== 'ask') && !(!p && k === 'fix')).map(([k, t]) => `<button type="button" class="${k === kind ? 'on' : ''}" data-act="q-kind" data-v="${k}">${t}</button>`).join('')}</div>
    ${p ? `<input type="hidden" id="qf-person" value="${esc(p.id)}"><p class="small muted" style="margin:0">Про: <b>${esc(full(p))}</b> ${esc(life(p))}</p>`
        : `<label class="f qf-about">Кого шукаємо<input class="in" id="qf-about" maxlength="300" placeholder="Ім'я, прізвище, приблизні роки, село"></label>
           <label class="f qf-person">Про кого з дерева (необов'язково)<input class="in" id="qf-pick" list="qpeople" placeholder="Почніть вводити ім'я…" autocomplete="off"></label>${personOpts()}`}
    <label class="f">${p ? 'Що уточнити або що ви хочете дізнатися' : 'Що відомо і що хочете дізнатися'}<textarea class="in" id="qf-text" maxlength="5000" placeholder="${esc(p ? 'Напр.: бабуся казала, що він народився не в 1905, а в 1907; або: де він похований?' : 'Напр.: брат прадіда, Петро, виїхав у 1930-х на Донбас — хотілося б знайти його нащадків. Хто розповідав, що пам\'ятаєте.')}"></textarea></label>
    <div class="btns"><button class="btn" data-act="q-send">Надіслати</button>${p ? '<button class="btn line" data-act="close">Скасувати</button>' : ''}<span class="msg" id="qf-m"></span></div>
  </div>`;
}
function qItem(q) {
  const p = q.person && P[q.person], mine = q.by === S.me.id;
  const subj = p ? `<a href="${href('p', p.id)}">${esc(full(p))}</a>` : q.about ? `<b>${esc(q.about)}</b>` : '';
  const edit = canEdit();
  return `<article class="qi st-${q.status}">
    <div class="qh"><span class="pill st-${q.status}">${QSTAT[q.status] || q.status}</span><span class="small muted">${esc(QKIND[q.kind] || '')}</span>${subj ? `<span>${subj}</span>` : ''}</div>
    ${(q.patch || q.padd || q.pdup) && q.pst !== undefined ? fxDiff(q) + (q.text.includes('Звідки відомо / коментар: ') ? `<div class="qt">${esc(q.text.slice(q.text.indexOf('Звідки відомо / коментар: '))).replace(/\n/g, '<br>')}</div>` : '') : `<div class="qt">${esc(q.text).replace(/\n/g, '<br>')}</div>`}
    <div class="small muted">${mine ? 'Ви' : esc(who(q.by))}, ${esc(when(q.at))}</div>
    ${q.answer && !edit ? `<div class="qa"><span class="small muted">Відповідь${q.updBy ? ' · ' + esc(who(q.updBy)) : ''}, ${esc(when(q.upd))}</span><div>${glossify(esc(q.answer)).replace(/\n/g, '<br>')}</div></div>` : ''}
    ${edit ? `<div class="qedit">
      <div class="seg small">${Object.entries(QSTAT).map(([k, t]) => `<button type="button" class="${q.status === k ? 'on' : ''}" data-act="q-status" data-id="${q.id}" data-v="${k}">${t}</button>`).join('')}</div>
      <textarea class="in" id="qa-${q.id}" placeholder="Відповідь — її побачить автор запитання">${esc(q.answer)}</textarea>
      ${p && !(q.padd && q.pst === '') ? `<div class="qadd"><span class="small muted">Внести в дерево:</span><button class="btn small" data-act="q-add" data-rel="spouse" data-id="${q.id}">+ чоловік / дружина</button><button class="btn line small" data-act="q-add" data-rel="child" data-id="${q.id}">+ дитина</button><button class="btn line small" data-act="q-add" data-rel="father" data-id="${q.id}">+ батько</button><button class="btn line small" data-act="q-add" data-rel="mother" data-id="${q.id}">+ мати</button><button class="btn line small" data-act="q-add" data-rel="sibling" data-id="${q.id}">+ брат / сестра</button><a class="btn line small" href="${href('p', p.id)}">Відкрити картку</a></div>` : ''}
      <div class="btns"><button class="btn line small" data-act="q-answer" data-id="${q.id}">Зберегти відповідь</button>${isOwner() ? `<button class="btn line small" data-act="q-del" data-id="${q.id}">Видалити</button>` : ''}<span class="msg" id="qa-m-${q.id}"></span></div></div>`
    : mine && q.status === 'new' ? `<div class="btns"><button class="btn line small" data-act="q-del" data-id="${q.id}">Видалити</button></div>` : ''}
  </article>`;
}
function vQuestions() {
  curTarget = 'questions';
  if (!S.data.qReady) return `<div class="sec"><h1>Запитання</h1><p class="muted">${isOwner() ? 'Розділ майже готовий: потрібно один раз виконати SQL-міграцію <span class="mono">002_questions.sql</span> у Supabase (SQL Editor → вставити → Run).' : 'Розділ ще налаштовується. Загляньте трохи пізніше.'}</p></div>`;
  const edit = canEdit(), f = S.ui.qf || (edit ? 'open' : 'all');
  const all = qList(); let list = all;
  const cnt = k => all.filter(q => k === 'all' ? true : k === 'open' ? (q.status === 'new' || q.status === 'work') : q.status === k).length;
  if (edit) list = list.filter(q => f === 'all' ? true : f === 'open' ? (q.status === 'new' || q.status === 'work') : q.status === f);
  const fl = [['open', 'Відкриті'], ['new', 'Нові'], ['work', 'Шукаємо'], ['found', 'Знайдено'], ['closed', 'Закриті'], ['all', 'Усі']];
  // відмітка «переглянуто» — для бейджа відповідей
  try { localStorage.setItem('rs_qseen', new Date().toISOString()); } catch {}
  return `<div class="qpage">
    <div class="sec" style="gap:6px"><h1>Запитання й уточнення</h1>
      <p class="muted" style="margin:0">Бачите помилку, знаєте щось інше або хочете, щоб ми пошукали когось у архівах — напишіть тут. ${edit ? '' : 'Відповідь з\'явиться на цій сторінці.'}</p></div>
    <div class="sec qnew"><h3>Нове запитання</h3>${qForm(null)}</div>
    <div class="sec"><h3>${edit ? 'Усі запитання' : 'Мої запитання'} ${isOwner() && cnt('open') ? `<button class="btn line small" data-act="q-claude">Скопіювати відкриті для Claude</button>` : ''}</h3>
      ${edit ? `<div class="seg qfilter">${fl.map(([k, t]) => `<button type="button" class="${f === k ? 'on' : ''}" data-act="q-filter" data-v="${k}">${t} <span class="muted">${cnt(k)}</span></button>`).join('')}</div>` : ''}
      <div class="qlist">${list.map(qItem).join('') || `<p class="muted">${edit ? 'Тут порожньо.' : 'Ви ще нічого не питали.'}</p>`}</div>
    </div>
  </div>`;
}
function qClaudeText() {
  const open = qList().filter(q => q.status === 'new' || q.status === 'work');
  return 'Запитання родичів із сайту shutyi.com.ua — допоможи пошукати:\n\n' + open.map((q, i) => {
    const p = q.person && P[q.person];
    return `${i + 1}. [${QKIND[q.kind]} · ${QSTAT[q.status]}] ${p ? `${full(p)} ${life(p)} (id: ${p.id})` : q.about}\n   Питає: ${who(q.by)}, ${when(q.at)}\n   ${q.text.replace(/\n/g, '\n   ')}${q.answer ? `\n   Уже відповіли: ${q.answer.replace(/\n/g, ' ')}` : ''}\n   (id запитання: ${q.id})`;
  }).join('\n\n');
}
async function qHandle(act, t, d) {
  if (act === 'q-fix') { const id = d.id || S.arg; if (!P[id]) return true; modal(`<h2>Внести правку — ${esc(short(P[id]))}</h2>${fxForm(P[id])}`); return true; }
  if (act === 'q-fxmore') { const w = $('#fxrels'), id = t.closest('.fxform').dataset.id; if (w && P[id] && w.children.length < 12) w.insertAdjacentHTML('beforeend', fxRelRow(P[id])); return true; }
  if (act === 'q-fxrm') { const r = t.closest('.fxrel'); if (r) { r.querySelectorAll('input').forEach(i => i.value = ''); if (r.parentElement.children.length > 1) r.remove(); } return true; }
  if (act === 'q-fxsend') {
    const f = t.closest('.fxform'), id = f.dataset.id, p = P[id], m = f.querySelector('#fx-m'); if (!p) return true;
    const patch = {}; f.querySelectorAll('[data-fx]').forEach(i => { const k = i.dataset.fx, v = i.value.trim(); if (v !== String(p[k] || '')) patch[k] = v; });
    const add = [...f.querySelectorAll('.fxrel')].map(r => { const o = parseFio(r.querySelector('[data-fr=fio]').value); const b = r.querySelector('[data-fr=b]').value.trim() || o.b; return { rel: r.querySelector('[data-fr=rel]').value, s: o.s, n: o.n, pt: o.pt, m: o.m, b }; }).filter(x => x.n);
    const dv = f.querySelector('#fx-dup').value.trim(), dup = dv ? personByLabel(dv) : '';
    if (dv && !dup) { m.className = 'msg err'; m.textContent = 'Дублікат: оберіть людину зі списку.'; return true; }
    const why = f.querySelector('#fx-why')?.value.trim() || '';
    if (!Object.keys(patch).length && !add.length && !dup && !why) { m.className = 'msg err'; m.textContent = 'Нічого не змінено. Виправте поле, додайте рідних або напишіть, що не так.'; return true; }
    if (t.disabled) return true; t.disabled = true; m.className = 'msg'; m.textContent = 'Надсилаю…';
    try {
      const r = await api('/api/data', { body: { op: 'fix.add', person: id, patch, add, dup, text: why, apply: isOwner() } });
      if (isOwner()) { await load(); closeLayer(); if (r.keep && r.keep !== id) location.hash = href('p', r.keep); toast('Внесено' + (r.made?.length ? ` · нових карток: ${r.made.length}` : '')); return true; }
      (S.data.questions ||= []).unshift(r.question); closeLayer(); S.ui.keepScroll = true; render();
      toast('Дякуємо! Надіслано — з’явиться в дереві після підтвердження. Стан — у розділі «Запитання».');
    } catch (err) { m.className = 'msg err'; m.textContent = errText(err); t.disabled = false; }
    return true;
  }
  if (act === 'q-fxok' || act === 'q-fxno') {
    const it = t.closest('.qi'), m = $('#fx-qm-' + d.id), keys = [...it.querySelectorAll('[data-fxk]')].filter(c => c.checked).map(c => c.dataset.fxk), keep = it.querySelector(`input[name="fxk-${d.id}"]:checked`)?.value || '';
    if (act === 'q-fxok' && !keys.length) { m.className = 'msg err'; m.textContent = 'Позначте хоча б одне поле.'; return true; }
    if (t.disabled) return true; t.disabled = true;
    try {
      const r = await api('/api/data', { body: { op: act === 'q-fxok' ? 'fix.apply' : 'fix.reject', id: d.id, keys, keep, answer: $('#qa-' + d.id)?.value.trim() || '' } });
      const i = S.data.questions.findIndex(q => q.id === d.id); if (i >= 0) S.data.questions[i] = r.question;
      if (act === 'q-fxok') await load(); S.ui.keepScroll = true; render(); toast(act === 'q-fxok' ? 'Внесено в дерево' : 'Відхилено');
    } catch (err) { m.className = 'msg err'; m.textContent = errText(err); t.disabled = false; }
    return true;
  }
  if (act === 'q-ask') { modal(`<h2>Запитати</h2><p class="small muted" style="margin:0 0 8px">Щоб виправити дані чи додати рідних — кнопка «Внести правку».</p>${qForm(S.arg, 'ask')}`); return true; }
  if (act === 'q-kind') { const f = t.closest('.qform'); f.dataset.kind = d.v; f.querySelectorAll('[data-act=q-kind]').forEach(b => b.classList.toggle('on', b === t)); return true; }
  if (act === 'q-filter') { S.ui.qf = d.v; S.ui.keepScroll = true; render(); return true; }
  if (act === 'q-send') {
    const f = t.closest('.qform'), m = f.querySelector('#qf-m'), kind = f.dataset.kind;
    const person = f.querySelector('#qf-person')?.value || personByLabel(f.querySelector('#qf-pick')?.value);
    const pick = f.querySelector('#qf-pick')?.value.trim();
    let about = f.querySelector('#qf-about')?.value.trim() || '';
    if (pick && !person && !about) about = pick; // ввели ім'я, якого немає в дереві
    const text = f.querySelector('#qf-text').value.trim();
    if (!text) { m.textContent = ERR.empty; return true; }
    if (kind === 'find' && !about && !person) { m.textContent = ERR.about; return true; }
    if (t.disabled) return true; t.disabled = true; m.textContent = 'Надсилаю…';
    try {
      const r = await api('/api/data', { body: { op: 'q.add', kind, person, about, text } });
      S.data.questions.unshift(r.question);
      if ($('#layer').innerHTML) closeLayer();
      S.ui.keepScroll = true; render(); toast('Надіслано. Відповідь з\'явиться в розділі «Запитання».');
    } catch (err) { m.textContent = errText(err); t.disabled = false; }
    return true;
  }
  if (act === 'q-add') { const q = (S.data.questions || []).find(x => x.id === t.dataset.id); if (!q || !P[q.person]) return; openAdd(t.dataset.rel, P[q.person]); qPrefill(q.text, t.dataset.rel); return true; }
  if (act === 'q-status' || act === 'q-answer') {
    const body = { op: 'q.update', id: d.id };
    if (act === 'q-status') body.status = d.v; else { body.answer = $('#qa-' + d.id).value; if (body.answer.trim() && qList().find(q => q.id === d.id)?.status === 'new') body.status = 'work'; }
    if (t.disabled) return true; t.disabled = true;
    const r = await api('/api/data', { body });
    const i = S.data.questions.findIndex(q => q.id === d.id); if (i >= 0) S.data.questions[i] = r.question;
    S.ui.keepScroll = true; render(); toast(act === 'q-status' ? 'Стан змінено' : 'Відповідь збережено'); return true;
  }
  if (act === 'q-del') {
    if (t.dataset.armed !== '1') { t.dataset.armed = '1'; t.textContent = 'Точно видалити?'; return true; }
    await api('/api/data', { body: { op: 'q.delete', id: d.id } });
    S.data.questions = S.data.questions.filter(q => q.id !== d.id); S.ui.keepScroll = true; render(); return true;
  }
  if (act === 'q-claude') {
    const txt = qClaudeText();
    try { await navigator.clipboard.writeText(txt); toast('Скопійовано — вставте в чат із Claude'); }
    catch { modal(`<h2>Для Claude</h2><p class="small muted">Виділіть усе й скопіюйте.</p><textarea class="in mono" style="min-height:320px" readonly>${esc(txt)}</textarea><div class="btns"><button class="btn line" data-act="close">Закрити</button></div>`); }
    return true;
  }
  return false;
}


/* ───── Реєстрація за посиланням ?join=<код> ─────
   Людина розповідає про себе й рідних → заявка → Максим прив'язує до картки в дереві й відкриває доступ. */
const kidRow = (k = {}) => `<div class="kidr"><input class="in" data-kf="n" placeholder="Ім'я (і по батькові)" value="${esc(k.n || '')}" maxlength="60"><input class="in" data-kf="b" placeholder="Рік" inputmode="numeric" value="${esc(k.b || '')}" maxlength="20"><select class="in" data-kf="sex"><option value="">син / донька</option><option value="m"${k.sex === 'm' ? ' selected' : ''}>син</option><option value="f"${k.sex === 'f' ? ' selected' : ''}>донька</option></select></div>`;
const readKids = box => [...(box?.querySelectorAll('.kidr') || [])].map(r => Object.fromEntries([...r.querySelectorAll('[data-kf]')].map(i => [i.dataset.kf, i.value.trim()]))).filter(k => k.n);
const RF = (id, label, ph, o = {}) => `<label class="f${o.wide ? ' wide' : ''}">${label}${o.area ? `<textarea class="in" id="rg-${id}" placeholder="${esc(ph)}" maxlength="2000"></textarea>` : `<input class="in" id="rg-${id}" placeholder="${esc(ph)}" maxlength="300"${o.type ? ` type="${o.type}"` : ''}${o.im ? ` inputmode="${o.im}"` : ''}${o.ac ? ` autocomplete="${o.ac}"` : ''}${o.req ? ' required' : ''}>`}</label>`;
function vRegister() {
  return `<div class="gate reg"><div class="card"><h1>Наш родовід</h1><div class="sub gate-sn">${SURN.join(' · ')}</div><div class="sub">Реєстрація в родинному архіві</div><div class="orn">◆ ◆ ◆</div>
  <form id="register" class="sec" autocomplete="on">
    <p style="margin:0">Розкажіть, хто ви і хто ваші рідні — так Максим знайде вас у дереві й відкриє доступ. Пишіть як знаєте: прізвище, ім'я, по батькові й роки (можна приблизно).</p>
    <h3>Про вас</h3>
    <div class="rgrid">
      ${RF('s', 'Прізвище *', 'Шутий', { req: 1, ac: 'family-name' })}${RF('n', "Ім'я *", 'Іван', { req: 1, ac: 'given-name' })}
      ${RF('pt', 'По батькові', 'Петрович', { ac: 'additional-name' })}${RF('m', 'Дівоче прізвище (якщо змінювали)', '')}
      <label class="f">Стать<select class="in" id="rg-sex"><option value="">—</option><option value="m">чоловік</option><option value="f">жінка</option></select></label>
      ${RF('b', 'Дата або рік народження', '1985', { im: 'numeric' })}
      ${RF('bp', 'Де народилися', 'село, район')}${RF('live', 'Де живете зараз', 'місто')}
      ${RF('phone', 'Телефон або Telegram (щоб Максим міг уточнити)', '+380…', { type: 'tel', im: 'tel', ac: 'tel' })}
    </div>
    <h3>Ваші рідні</h3>
    <div class="rgrid">
      ${RF('father', 'Батько *', 'Шутий Петро Іванович, 1960')}${RF('mother', 'Мати *', 'Шута (Галай) Марія Іванівна, 1962')}
      ${RF('gpf', 'Дідусь і бабуся по батькові', 'Шутий Іван Петрович (1930–1995), Ганна Федорівна', { area: 1 })}
      ${RF('gpm', 'Дідусь і бабуся по матері', 'Галай Іван…, …', { area: 1 })}
      ${RF('spouse', 'Чоловік / дружина', "прізвище, ім'я, рік")}${RF('sibs', 'Брати й сестри', 'імена й роки', { area: 1 })}
      <div class="f wide"><span>Діти — кожна дитина окремим рядком (з'явиться в дереві під вами після підтвердження)</span><div id="rg-kids" class="kidl">${kidRow()}</div><button type="button" class="btn line small" data-act="jr-kidadd" style="justify-self:start">+ ще дитина</button></div>
      ${RF('link', 'Як ви пов\'язані з родиною (через кого)', 'напр.: моя бабуся — рідна сестра Василя Шутого з Вороньків', { area: 1, wide: 1 })}
    </div>
    <p class="small muted" style="margin:0">* Обов'язково: прізвище, ім'я і хоча б один із батьків.</p>
    <h3>Вхід</h3>
    <div class="rgrid">
      <label class="f">Пошта (буде логіном) *<input class="in" id="rg-email" type="email" inputmode="email" autocomplete="email" required></label>
      <label class="f">Придумайте пароль (від 8 символів) *<input class="in" id="rg-pass" type="password" autocomplete="new-password" minlength="8" required></label>
    </div>
    <button class="btn" type="submit">Надіслати заявку</button><div class="msg" id="rg-m"></div>
    <p class="small muted" style="margin:0;text-align:center">Дані бачить лише Максим. <a href="#" data-act="to-login">Вже маєте доступ? Увійти</a></p>
  </form></div></div>`;
}
const regDone = () => gate(`<div class="sec" style="text-align:center"><p style="margin:0"><b>Дякуємо! Заявку надіслано.</b></p><p class="muted" style="margin:0">Максим перевірить, хто ви в дереві, і відкриє доступ. Після цього входьте з вашою поштою й паролем на цьому ж сайті.</p><p style="margin:0;padding:10px 12px;border:1px solid var(--wine);border-radius:10px"><b>Щоб доступ відкрили швидше</b> — напишіть Максиму (у Telegram, Viber чи просто подзвоніть), що ви зареєструвалися на сайті родоводу. Тоді він прийме заявку одразу.</p><button class="btn line" data-act="to-login">До входу</button></div>`);

/* Підказки власнику: хто з дерева схожий на написане в заявці */
const nrm = t => String(t || '').toLowerCase().replace(/[ʼ'’`]/g, '').replace(/ё/g, 'е');
function guessPeople(text, max = 3) {
  const words = nrm(text).split(/[^a-zа-яіїєґ0-9]+/).filter(Boolean); if (!words.length) return [];
  const has = (w, min = 4) => { if (!w) return false; w = nrm(w); const root = w.slice(0, Math.max(min, w.length - 2)); return words.some(x => x.startsWith(root) || (x.length >= min && w.startsWith(x.slice(0, Math.max(min, x.length - 2))))); };
  const years = (String(text).match(/\b(1[6-9]\d\d|20\d\d)\b/g) || []);
  return Object.values(P).map(p => {
    let sc = 0;
    if (has(p.s) || has(p.m)) sc += 2;
    if (p.n && has(p.n.replace(/\s*\(.*\)/, ''), 3)) sc += 2;
    if (p.pt) { if (has(p.pt, 5)) sc += 1; else if (words.some(w => /(ович|евич|івна|ївна|овна|евна|ич)$/.test(w))) sc -= 2; } // інше по батькові — мабуть, інша людина
    const y = String(p.b || '').match(/\d{4}/);
    if (y && years.includes(y[0])) sc += 2; else if (y && years.length && years.every(x => Math.abs(x - y[0]) > 3)) sc -= 1;
    return { p, sc };
  }).filter(x => x.sc >= 4).sort((a, b) => b.sc - a.sc).slice(0, max).map(x => x.p);
}
const plabel = p => full(p) + (life(p) ? ' (' + life(p) + ')' : '');
const peopleList = id => `<datalist id="${id}">${Object.values(P).sort((a, b) => full(a).localeCompare(full(b), 'uk')).map(p => `<option value="${esc(plabel(p))}"></option>`).join('')}</datalist>`;
const JRF = [['s', 'Прізвище'], ['n', "Ім'я"], ['pt', 'По батькові'], ['m', 'Дівоче'], ['sex', 'Стать'], ['b', 'Народження'], ['bp', 'Де народ.'], ['live', 'Живе'], ['phone', 'Телефон'], ['father', 'Батько'], ['mother', 'Мати'], ['gpf', 'Діди по батькові'], ['gpm', 'Діди по матері'], ['spouse', 'Подружжя'], ['sibs', 'Брати й сестри'], ['kids', 'Діти'], ['link', "Зв'язок з родом"]];
function jrText(r) { const d = r.data || {}; return `Заявка на реєстрацію: ${r.name} <${r.email}>, ${when(r.at)}\n` + JRF.filter(([k]) => d[k]).map(([k, t]) => `${t}: ${k === 'sex' ? (d[k] === 'f' ? 'жінка' : 'чоловік') : d[k]}`).join('\n') + '\nХто це в нашому дереві?'; }
// діти з анкети: структуровані (нова форма) або розібрані зі старого тексту «Іван 2001, Марія 2005»
function jrKids(d) {
  if (Array.isArray(d.kidsL) && d.kidsL.length) return d.kidsL;
  return jrList(d.kids);
}
function jrList(t) {
  return String(t || '').split(/[;\n]+|,(?!\s*\d)/).map(x => x.trim()).filter(Boolean).map(x => {
    const b = (x.match(/\b(19|20)\d\d\b/) || [''])[0];
    const n = x.replace(/\b(19|20)\d\d\b/, '').replace(/\b(син|донька|дочка|р\.?\s*н\.?|року|р\.)\b/gi, '').replace(/[(),.–—-]+/g, ' ').replace(/\s+/g, ' ').trim();
    const sex = /\b(донька|дочка)\b/i.test(x) ? 'f' : /\b(син)\b/i.test(x) ? 'm' : /[ая]$/i.test(n.split(' ')[0] || '') ? 'f' : 'm';
    return { n, b, sex };
  }).filter(k => k.n && k.n.length < 60);
}
// брати й сестри з анкети: «Юрій(1984),Єва(1981)» → [{n,b,sex}]; стать — за закінченням імені (Юрій, Олег — брат; Єва, Олена — сестра)
const jrSibs = d => jrList(d.sibs).map(k => ({ ...k, sex: /\b(сестра)\b/i.test(k.n) ? 'f' : /\b(брат)\b/i.test(k.n) ? 'm' : k.sex })).map(k => ({ ...k, n: k.n.replace(/\b(брат|сестра)\b/gi, '').trim() })).filter(k => k.n);
const sibHas = (pid, n) => { const p = P[pid]; if (!p) return false; return [p.f, p.mo].filter(Boolean).some(x => kidHas(x, n)); };
function jrSibsBlock(r, pid) {
  const ks = jrSibs(r.data || {}); if (!ks.length) return '';
  const rows = ks.map((k, i) => { const has = pid && sibHas(pid, k.n); return `<label class="kidc${has ? ' has' : ''}"><input type="checkbox" data-kid="${i}"${has ? ' disabled' : ' checked'}><span>${kidRow(k).replace('син / донька', 'брат / сестра').replace('>син<', '>брат<').replace('>донька<', '>сестра<')}</span>${has ? '<em class="small muted">вже є в дереві</em>' : ''}</label>`; }).join('');
  return `<div class="kidbox" id="jsb-${r.id}"><b class="small">Брати й сестри з анкети — додати в дерево під тими ж батьками:</b>${rows}</div>`;
}
const jrSibsRead = id => [...document.querySelectorAll(`#jsb-${id} .kidc`)].filter(l => l.querySelector('[data-kid]')?.checked).map(l => Object.fromEntries([...l.querySelectorAll('[data-kf]')].map(i => [i.dataset.kf, i.value.trim()]))).filter(k => k.n);
const kidHas = (pid, n) => Object.values(P).some(p => (p.f === pid || p.mo === pid) && String(p.n || '').toLowerCase().replace(/\s*\(.*\)/, '').trim() === String(n).toLowerCase().split(' ')[0]);
function jrKidsBlock(r, pid) {
  const ks = jrKids(r.data || {}); if (!ks.length) return '';
  const rows = ks.map((k, i) => { const has = pid && kidHas(pid, k.n); return `<label class="kidc${has ? ' has' : ''}"><input type="checkbox" data-kid="${i}"${has ? ' disabled' : ' checked'}><span>${kidRow(k)}</span>${has ? '<em class="small muted">вже є в дереві</em>' : ''}</label>`; }).join('');
  return `<div class="kidbox" id="jk-${r.id}"><b class="small">Діти з анкети — додати в дерево під цією людиною:</b>${rows}</div>`;
}
const jrKidsRead = id => [...document.querySelectorAll(`#jk-${id} .kidc`)].filter(l => l.querySelector('[data-kid]')?.checked).map(l => Object.fromEntries([...l.querySelectorAll('[data-kf]')].map(i => [i.dataset.kf, i.value.trim()]))).filter(k => k.n);
// «Перчета (Шута) Парасковія Яківна 1946» → {s, m, n, pt, b}
function parseFio(t) {
  t = String(t || ''); const ys = t.match(/\b(1[6-9]\d\d|20\d\d)\b/g) || [], b = ys[0] || '', dd = ys[1] || '';
  const m = ([...t.matchAll(/\(([^)]+)\)/g)].map(x => x[1].trim()).find(x => !/\d/.test(x)) || ''); // у дужках — дівоче прізвище; «(1935-2023)» — роки життя
  const cap = x => x ? x[0].toUpperCase() + x.slice(1).toLowerCase() : '';
  const w = t.replace(/\([^)]*\)/g, ' ').replace(/\b(1[6-9]\d\d|20\d\d)\b/g, ' ').replace(/[,.;:–—]+/g, ' ').split(/\s+/).filter(x => /[a-zа-яіїєґ']/i.test(x)).map(cap);
  const isPt = x => /(вич|ич|вна|івна|ївна)$/i.test(x || ''); let s = '', n = '', pt = '';
  if (w.length >= 3) { if (isPt(w[2])) [s, n, pt] = [w[0], w[1], w.slice(2).join(' ')]; else if (isPt(w[1])) [n, pt, s] = [w[0], w[1], w[2]]; else [s, n] = [w[0], w.slice(1).join(' ')]; }
  else if (w.length === 2) { if (isPt(w[1])) [n, pt] = w; else [s, n] = w; } else n = w[0] || '';
  return { s, m: cap(m), n, pt, b, d: dd };
}
const fioSex = o => /(вна|івна|ївна)$/i.test(o.pt) ? 'f' : /(вич|ич)$/i.test(o.pt) ? 'm' : /[ая]$/i.test(o.n) ? 'f' : '';
const REL = [['F', 'Батько', 'father', 'm'], ['MO', 'Мати', 'mother', 'f'], ['FF', 'Дід (батько батька)', 'gpf', 'm'], ['FM', 'Баба (мати батька)', 'gpf', 'f'], ['MF', 'Дід (батько матері)', 'gpm', 'm'], ['MM', 'Баба (мати матері)', 'gpm', 'f']];
function relTexts(d) { // текст для кожного рядка; діди розкладаються за статтю
  const T = { F: d.father || '', MO: d.mother || '' };
  for (const [k, a, b] of [['gpf', 'FF', 'FM'], ['gpm', 'MF', 'MM']]) {
    const L = String(d[k] || '').split(/\n|;|,/).map(x => x.trim()).filter(Boolean).reduce((a, x) => { if (a.length && !/[a-zа-яіїєґ]{2}/i.test(x)) a[a.length - 1] += ', ' + x; else a.push(x); return a; }, []); const left = [];
    L.forEach(x => { const sx = fioSex(parseFio(x)); if (sx === 'm' && !T[a]) T[a] = x; else if (sx === 'f' && !T[b]) T[b] = x; else left.push(x); });
    left.forEach(x => { if (!T[a]) T[a] = x; else if (!T[b]) T[b] = x; });
  }
  return T;
}
// «Рідні з анкети»: для кожного — обрати з дерева або створити нову картку. pid — картка самої людини (якщо вже є)
function jrRelBlock(r, pid) {
  const d = r.data || {}, T = relTexts(d), me = pid && P[pid];
  const has = { F: me?.f, MO: me?.mo };
  const g = {}; REL.forEach(([k]) => { g[k] = has[k] ? P[has[k]] : T[k] ? guessPeople(T[k], 1)[0] : null; });
  has.FF = g.F?.f; has.FM = g.F?.mo; has.MF = g.MO?.f; has.MM = g.MO?.mo;
  let act = 0;
  const rows = REL.map(([k, t]) => {
    if (has[k] && P[has[k]]) return `<div class="relr"><b class="small">${t}</b> <span class="small">вже в дереві: <a href="${href('p', has[k])}">${esc(short(P[has[k]]))}</a></span></div>`;
    if (!T[k]) return '';
    const gp = g[k]; act++;
    return `<div class="relr" data-relk="${k}"><b class="small">${t}</b> <span class="small muted">в анкеті: «${esc(T[k])}»</span>
      <div class="relc"><input class="in" list="jpeople" data-rk="pick" value="${gp ? esc(plabel(gp)) : ''}" placeholder="вже є в дереві — оберіть" autocomplete="off">
      <label class="small relmk"><input type="checkbox" data-rk="mk"${gp ? '' : ' checked'}> або нова картка:</label><input class="in" data-rk="txt" value="${esc(T[k])}"></div></div>`;
  }).join('');
  if (!act) return '';
  return `<div class="relbox" id="jrel-${r.id}"><b class="small">Батьки й діди з анкети — прив'язати або створити картки (щоб людина з'єдналася з деревом):</b>${rows}</div>`;
}
function jrRelRead(id) {
  const rel = {};
  document.querySelectorAll(`#jrel-${id} .relr[data-relk]`).forEach(el => {
    const k = el.dataset.relk, pick = el.querySelector('[data-rk="pick"]').value.trim(), pid = pick ? personByLabel(pick) : '';
    if (pid) rel[k] = { id: pid };
    else if (el.querySelector('[data-rk="mk"]').checked) { const o = parseFio(el.querySelector('[data-rk="txt"]').value); if (o.n) rel[k] = { make: o }; }
  });
  return rel;
}
function jrCard(r) {
  const d = r.data || {}, id = r.id;
  const self = guessPeople([d.s, d.n, d.pt, d.m, d.b].join(' '));
  const sG = guessPeople(d.spouse, 1)[0];
  // у чоловіка/дружини з анкети вже є картка подружжя («Аня» = «Анна»)? — це, найімовірніше, та сама людина
  if (sG) { const n2 = String(d.n || '').toLowerCase().slice(0, 2); const sp = (S.data.unions || []).filter(u => u.a === sG.id || u.b === sG.id).map(u => u.a === sG.id ? u.b : u.a).map(x => P[x]).filter(q => q && (!d.sex || q.sex === d.sex) && n2 && String(q.n || '').toLowerCase().startsWith(n2) && !self.includes(q)); self.unshift(...sp); }
  const dl = `<dl class="jrd">${JRF.filter(([k]) => d[k] && !['s', 'n', 'pt'].includes(k)).map(([k, t]) => `<dt>${t}</dt><dd>${esc(k === 'sex' ? (d[k] === 'f' ? 'жінка' : 'чоловік') : d[k]).replace(/\n/g, '<br>')}</dd>`).join('')}</dl>`;
  if (r.status !== 'pending') {
    const pid = r.person_id && P[r.person_id] ? r.person_id : '', miss = pid ? jrKids(d).filter(k => !kidHas(pid, k.n)) : [], smiss = pid && (P[pid].f || P[pid].mo) ? jrSibs(d).filter(k => !sibHas(pid, k.n)) : [];
    return `<div class="jr done"><b>${esc(r.name)}</b> · <span class="small muted">${esc(r.email)} · ${r.status === 'approved' ? 'прийнято' : 'відхилено'} ${esc(when(r.decided_at))}${pid ? ` · <a href="${href('p', pid)}">${esc(short(P[pid]))}</a>` : ''}</span>
      ${miss.length ? `${jrKidsBlock(r, pid)}<div class="btns"><button class="btn small" data-act="jr-kids" data-id="${id}">Додати вибраних дітей у дерево</button><span class="msg" id="jr-m-${id}"></span></div>` : ''}
      ${smiss.length ? `${jrSibsBlock(r, pid)}<div class="btns"><button class="btn small" data-act="jr-sibs" data-id="${id}">Додати вибраних братів і сестер у дерево</button><span class="msg" id="jr-sm-${id}"></span></div>` : ''}
      ${pid && r.status === 'approved' && (!P[pid].f || !P[pid].mo) && jrRelBlock(r, pid) ? `${jrRelBlock(r, pid)}<div class="btns"><button class="btn small" data-act="jr-par" data-id="${id}">Додати батьків і дідів у дерево</button><span class="msg" id="jr-pm-${id}"></span></div>` : ''}</div>`;
  }
  return `<article class="jr" data-jr="${id}">
    <div class="qh"><span class="pill st-new">Нова заявка</span><b style="font-family:var(--f-display);font-size:19px">${esc([d.s, d.n, d.pt].filter(Boolean).join(' '))}</b><span class="small muted">${esc(r.email)} · ${esc(when(r.at))}</span></div>
    ${dl}
    <div class="jact">
      <div class="small"><b>Хто це в дереві?</b> ${self.length ? 'Схоже на: ' + self.map(p => `<button type="button" class="chip" data-act="jr-pick" data-id="${id}" data-v="${esc(plabel(p))}">${esc(plabel(p))}</button>`).join(' ') : '<span class="muted">збігів за іменем не знайдено — мабуть, людини ще немає в дереві</span>'}</div>
      <label class="f">Вже є в дереві — оберіть картку (щоб не було двох однакових)<input class="in" id="jp-${id}" list="jpeople" placeholder="Почніть вводити ім'я…" autocomplete="off" value="${self[0] ? esc(plabel(self[0])) : ''}"></label>
      <details${self.length ? '' : ' open'}><summary class="small">Або створити нову картку з даних заявки й прив'язати до рідних</summary>
        <div class="grid2" style="margin-top:8px">
          <label class="f">Чоловік / дружина<input class="in" id="js-${id}" list="jpeople" value="${sG ? esc(plabel(sG)) : ''}" placeholder="з дерева" autocomplete="off"></label>
        </div><p class="small muted" style="margin:4px 0 0">Підставлено найсхожіших — перевірте. Порожнє поле = не прив'язувати.</p></details>
      ${jrRelBlock(r, self[0]?.id || '')}
      ${jrKidsBlock(r, self[0]?.id || '')}
      ${jrSibsBlock(r, self[0]?.id || '')}
      <div class="btns"><label class="f" style="margin:0">Права<select class="in" id="jr-role-${id}" style="width:auto"><option value="viewer">глядач — дивиться, доповнює свою гілку</option><option value="editor">редактор — змінює картки</option></select></label></div>
      <div class="btns"><button class="btn" data-act="jr-ok" data-id="${id}">Прийняти й відкрити доступ</button><button class="btn line" data-act="jr-no" data-id="${id}">Відхилити</button><button class="btn line small" data-act="copy" data-v="${esc(jrText(r))}">Скопіювати для Claude</button><span class="msg" id="jr-m-${id}"></span></div>
    </div>
  </article>`;
}
function joinBlock() {
  const a = S.admin;
  if (a.joinErr) return `<div class="sec"><h3>Реєстрація за посиланням</h3><p class="muted">Потрібно один раз виконати SQL-міграцію <span class="mono">003_join.sql</span> у Supabase.</p></div>`;
  if (!a.join) return '';
  const link = location.origin + '/?join=' + a.join.code;
  const reqs = a.reqs || [], pend = reqs.filter(r => r.status === 'pending'), done = reqs.filter(r => r.status !== 'pending').slice(0, 20);
  return `<div class="sec"><h3>Посилання для реєстрації</h3>
    ${a.join.on ? `<div class="btns"><input class="in mono" value="${esc(link)}" readonly style="max-width:460px"><button class="btn line small" data-act="copy" data-v="${esc(link)}">Скопіювати</button><button class="btn line small" data-act="jl-rotate">Нове посилання</button><button class="btn line small" data-act="jl-off">Вимкнути</button></div>
      <p class="small muted">Надішліть родичам (у групу чи особисто). Людина заповнює, хто вона і хто її рідні, — і чекає, поки ви приймете заявку. Без вашого «Прийняти» вона нічого не бачить. «Нове посилання» — старе перестає працювати.</p>`
    : `<p class="muted">Реєстрацію вимкнено. <button class="btn line small" data-act="jl-on">Увімкнути</button></p>`}
    </div>
    <div class="sec" style="margin-top:22px"><h3>Заявки${pend.length ? ` <b class="nb">${pend.length}</b>` : ''}</h3>
      ${reqs.length ? peopleList('jpeople') : ''}${pend.length ? pend.map(jrCard).join('') : '<p class="muted">Нових заявок немає.</p>'}
      ${done.length ? `<details style="margin-top:10px"><summary class="small">Розглянуті (${done.length})</summary>${done.map(jrCard).join('')}</details>` : ''}
    </div>`;
}
async function joinHandle(act, t, d) {
  if (act === 'to-register') { S.gate = vRegister; render(); return true; }
  if (act === 'to-login') { S.gate = null; render(); return true; }
  if (act === 'jl-rotate' || act === 'jl-off' || act === 'jl-on') {
    if (act !== 'jl-on' && t.dataset.armed !== '1') { t.dataset.armed = '1'; t.textContent = act === 'jl-off' ? 'Точно вимкнути?' : 'Старе перестане працювати. Так?'; return true; }
    S.admin.join = await api('/api/admin?a=join_link', { body: { do: act.slice(3) } }); S.ui.keepScroll = true; render(); toast(act === 'jl-rotate' ? 'Нове посилання готове' : act === 'jl-off' ? 'Реєстрацію вимкнено' : 'Реєстрацію увімкнено'); return true;
  }
  if (act === 'jr-pick') { $('#jp-' + d.id).value = d.v; return true; }
  if (act === 'jr-kidadd') { $('#rg-kids').insertAdjacentHTML('beforeend', kidRow()); $('#rg-kids .kidr:last-child input')?.focus(); return true; }
  if (act === 'jr-par') {
    const rel = jrRelRead(d.id), m = $('#jr-pm-' + d.id); if (!Object.keys(rel).length) { m.className = 'msg err'; m.textContent = 'Нічого не вибрано.'; return true; }
    if (t.disabled) return true; t.disabled = true;
    const r = await api('/api/admin?a=parents', { body: { id: d.id, rel } }); await load(); S.ui.keepScroll = true; await loadAdmin(); toast(r.made ? `Створено нових карток: ${r.made}; людину з'єднано з деревом` : 'Людину з\'єднано з рідними в дереві'); return true;
  }
  if (act === 'jr-sibs') {
    const sibs = jrSibsRead(d.id); if (!sibs.length) return true; if (t.disabled) return true; t.disabled = true;
    const r = await api('/api/admin?a=sibs', { body: { id: d.id, sibs } }); await load(); S.ui.keepScroll = true; await loadAdmin(); toast(r.sibs ? `Додано в дерево братів і сестер: ${r.sibs}` : 'Вони вже є в дереві (або в людини ще немає батьків у дереві)'); return true;
  }
  if (act === 'jr-kids') {
    const kids = jrKidsRead(d.id); if (!kids.length) return true; if (t.disabled) return true; t.disabled = true;
    const r = await api('/api/admin?a=kids', { body: { id: d.id, kids } }); await load(); S.ui.keepScroll = true; await loadAdmin(); toast(r.kids ? `Додано в дерево дітей: ${r.kids}` : 'Ці діти вже є в дереві'); return true;
  }
  if (act === 'jr-ok' || act === 'jr-no') {
    const m = $('#jr-m-' + d.id);
    if (act === 'jr-no') { if (t.dataset.armed !== '1') { t.dataset.armed = '1'; t.textContent = 'Точно відхилити?'; return true; } await api('/api/admin?a=reject', { body: { id: d.id } }); }
    else {
      const pick = $('#jp-' + d.id).value.trim(), person_id = personByLabel(pick);
      if (pick && !person_id) { m.className = 'msg err'; m.textContent = 'Оберіть людину зі списку-підказки (або очистіть поле, щоб створити нову картку).'; return true; }
      const bad = [...document.querySelectorAll(`#jrel-${d.id} .relr[data-relk]`)].find(el => { const v = el.querySelector('[data-rk="pick"]').value.trim(); return v && !personByLabel(v); });
      if (bad) { m.className = 'msg err'; m.textContent = `«${bad.querySelector('b').textContent}»: оберіть людину зі списку або очистіть поле.`; bad.querySelector('[data-rk="pick"]').focus(); return true; }
      const body = { id: d.id, role: $('#jr-role-' + d.id).value, kids: jrKidsRead(d.id), sibs: jrSibsRead(d.id), rel: jrRelRead(d.id) };
      const gap = (body.rel.MF || body.rel.MM) && !body.rel.MO ? 'матері' : (body.rel.FF || body.rel.FM) && !body.rel.F ? 'батька' : '';
      if (gap && t.dataset.armed !== 'gap') { t.dataset.armed = 'gap'; m.className = 'msg err'; m.textContent = `Не вказано ${gap} (ні з дерева, ні «нова картка») — діди з цього боку будуть окремо від людини. Натисніть ще раз, якщо так і треба.`; return true; }
      if (person_id) body.person_id = person_id;
      else {
        const g = k => { const v = $(`#j${k}-${d.id}`).value.trim(); return v ? personByLabel(v) : ''; };
        body.create = { spouse: g('s') };
        if (!body.rel.F && !body.rel.MO && t.dataset.armed !== '1') { t.dataset.armed = '1'; t.textContent = 'Без батьків картка буде окремо. Прийняти?'; return true; }
      }
      if (t.disabled) return true; t.disabled = true;
      const r = await api('/api/admin?a=approve', { body });
      if (body.create || r.kids || r.sibs || Object.keys(body.rel).length) await load();
    }
    S.admin.reqs = (await api('/api/admin?a=requests')).requests; S.admin.members = null; S.data.joinPending = S.admin.reqs.filter(r => r.status === 'pending').length;
    S.ui.keepScroll = true; await loadAdmin(); toast(act === 'jr-ok' ? 'Доступ відкрито. Людина вже може увійти зі своєю поштою й паролем.' : 'Заявку відхилено'); return true;
  }
  return false;
}


/* ───── Старі карти сіл ─────
   Карта — документ з type:'map'. Якщо є прив'язка geo (контрольні точки [x, y, широта, довгота] у пікселях зображення),
   її можна «накласти» на сучасну карту (OpenStreetMap або супутник) з прозорістю. */
const mapsList = () => S.data.documents.filter(d => d.type === 'map').sort((a, b) => (a.year || 0) - (b.year || 0) || String(a.title).localeCompare(String(b.title), 'uk'));
/* ── Історія сіл (зі старих видань і довідників; припущення позначено) ── */
const VHIST_INTRO = 'Вороньки й Веприк — сусідні села колишнього Козелецького повіту (тепер Новобасанська громада Ніжинського району Чернігівської області). У Гетьманщині обидва належали до Басанської сотні Переяславського полку. До Вороньківської волості входили також Свидовець і хутір Пустотин; поруч — Лідин (на карті Шуберта «Лыгинъ»; тепер Бобровицька громада).';
const VHIST = [
  ['XV ст.', 'Веприк, за радянським виданням «Історія міст і сіл УРСР», заснований у другій половині XV століття (документа не названо).', 'Історія міст і сіл УРСР. Чернігівська обл. (1972)'],
  ['XVI ст.', 'Вороньки відомі з початку XVI ст. Назва — від річечки Вороници (є й народна версія — від «конокрадів»).', 'Історія міст і сіл УРСР (1972), с. 211'],
  ['XVII–XVIII ст.', 'Вороньки й Веприк — села Басанської сотні Переяславського полку. Населення — козаки й посполиті.', 'Переяславський полк (перелік сіл Басанської сотні)'],
  ['1781–82', 'Після ліквідації полків села відійшли до Козелецького повіту Київського намісництва.', 'voronky.blogspot.com'],
  ['1787', 'Опис Київського намісництва: у Вороньках — козаки і володільці гетьман граф Кирило Розумовський та полковий осавул Андрій Мандрика.', 'Описи Київського намісництва'],
  ['1802', 'Козелецький повіт увійшов до Чернігівської губернії. Відтоді метрики й сповідні відомості Вороньків — у Чернігівській духовній консисторії (ДАЧО, ф. 679).', ''],
  ['1843–1848', 'У метриках селяни Веприка й Вороньків — кріпаки графа Апраксина, а з 1848 р. — «наследников умершего графа Апраксина».', 'метрики Покровської церкви (FamilySearch)'],
  ['1850', 'Аркадій Васильович Кочубей купив маєток у Вороньках для сина Миколи. Кочубеї володіли Вороньками до 1918 р.', 'Гетьманська столиця: виставка «Кочубеї»'],
  ['1859', 'Близько 2000 жителів, 236 дворів; через Вороньки проходив шлях Козелець — Ніжин.', 'Список населених місць Чернігівської губ. (дані 1859 р.)'],
  ['1859–1865', 'У маєтку доньки й зятя (Миколи Кочубея) жили декабрист Сергій Волконський і його дружина Марія; обоє померли й поховані у Вороньках.', ''],
  ['1861–1862', 'Скасування кріпацтва. У березні 1862 р. селяни Вороньків відмовилися підписувати уставні грамоти (умови викупу землі).', 'Історія міст і сіл УРСР (1972)'],
  ['1863', 'У Вороньках народився Михайло Миколайович Кочубей — останній власник маєтку, драматург.', 'Енциклопедія сучасної України'],
  ['1870–1900-ті', 'Майстерні архітектора О. Ягна: близько 300 селянських дітей училися виготовляти кахлі, черепицю, різьбити.', 'voronky.blogspot.com'],
  ['1885', 'Вороньки — «колишнє власницьке містечко», Веприк — «колишнє державне та власницьке село», Пустотин — власницький хутір.', 'Волости и важнейшие селения (1885)'],
  ['1904–1905', 'За проєктом Ягна збудовано Миколаївську церкву-усипальницю Кочубеїв (закрита 1918, розібрана в 1930-х).', 'voronky.blogspot.com'],
  ['1908', 'Михайло Кочубей відкрив у Вороньках 4-класну земську школу (близько 80 учнів).', 'Гетьманська столиця'],
  ['1918', 'Більшовики забрали маєток, родина Кочубеїв виїхала, маєток зруйновано.', 'Історія міст і сіл УРСР; kotchoubey.com'],
  ['1927–1933', 'Січень 1927 — колгосп «Праця». 1932–33 — Голодомор: у селі загинули сотні людей (точних цифр для Вороньків не знайдено).', ''],
  ['1941–1943', 'Війна. З Вороньків воювали близько 600 жителів, загинули 345; з Веприка — 600, загинули 248.', 'Історія міст і сіл УРСР (1972)'],
  ['1972–2001', 'Населення Вороньків: 1972 — 2237 (793 двори), 1989 — 1534, 2001 — 1110. Веприк 1972 — 1589 (542 двори).', ''],
];
const VHIST_ASK = ['ЦДІАК України, ф. 57 — Генеральний (Румянцевський) опис 1765–69 рр. по Басанській сотні: поіменно всі двори Вороньків і Веприка.', 'ЦДІАК, ф. 51 — Генеральне слідство про маєтності Переяславського полку 1729–31 рр.: хто володів селами раніше.', 'ЦДІАК, ф. 127 — метрики й сповідні Вороньків і Веприка 1782–1797 рр. (коли повіт був у Київському намісництві).', 'ДАЧО — ревізькі казки 1795–1858 рр. по Козелецькому повіту; клірові відомості Покровської церкви (історія храму й священики).'];
/* ── Великі тексти з сервера (історія роду, історія сіл) ── */
const TXT = {};
const TXT_T = {};
const TXT_PAGE = { history: 'families', villages: 'villages', hyps: 'hyp' };
function loadText(k, quiet) { // порожній результат не кешуємо назавжди: через 15 с спробуємо ще (текст міг щойно імпортуватись)
  if (k in TXT && !(TXT[k] === null && Date.now() - (TXT_T[k] || 0) > 15000)) return TXT[k];
  TXT[k] = undefined; TXT_T[k] = Date.now();
  api('/api/data?text=' + k).then(r => { TXT[k] = r.text || null; TXT_T[k] = Date.now(); if (k === 'history') BOOK.key = ''; if (quiet && S.view !== TXT_PAGE[k] && S.view !== 'hyp' && !(k === 'hyps' && S.view === 'home')) return; S.ui.keepScroll = true; render(); }).catch(() => { TXT[k] = null; TXT_T[k] = Date.now(); });
  return undefined;
}
async function syncNow() { // нові матеріали з репозиторію сервер вносить сам; сайт лише «будить» його при кожному відкритті
  let ok = 0; try { for (let k = 0; k < 25; k++) { const x = await api('/api/setup?a=sync', { body: {}, noRedirect: true }); ok += (x.result || []).filter(r => / ok/.test(r)).length; if (!x.more) break; } } catch {}
  if (ok) { delete TXT.history; delete TXT.villages; BOOK.key = ''; await load(); S.ui.keepScroll = true; render(); }
  return ok;
}
function mdLinks(h) { // [[p:id|Ім'я]] → посилання на картку; [[d:id|текст]] → відкрити документ
  return h.replace(/\[\[([pd]):([a-z0-9_-]+)\|([^\]]+)\]\]/gi, (m, t, id, label) => t === 'p' ? (P[id] ? `<a href="${href('p', id)}">${label}</a>` : label) : (S.data.documents.some(d => d.id === id) ? `<a href="#" class="doclink" data-doc="${id}">${label}</a>` : label));
}
function md(src) {
  const inl = t => mdLinks(esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>'));
  const out = []; let para = [], list = [];
  const flush = () => { if (para.length) out.push(`<p>${inl(para.join(' '))}</p>`); para = []; if (list.length) out.push(`<ul>${list.map(x => `<li>${inl(x)}</li>`).join('')}</ul>`); list = []; };
  for (const line of String(src || '').split('\n')) {
    const l = line.trim(); let m;
    if (!l) { flush(); continue; }
    if (/^-{3,}$/.test(l)) { flush(); out.push('<hr>'); continue; }
    if ((m = l.match(/^(#{1,4})\s+(.*)$/))) { flush(); const lv = Math.min(4, m[1].length + 1); const id = 'h-' + out.length; out.push(`<h${lv} id="${id}">${inl(m[2])}</h${lv}>`); continue; }
    if ((m = l.match(/^[-*]\s+(.*)$/))) { if (para.length) { out.push(`<p>${inl(para.join(' '))}</p>`); para = []; } list.push(m[1]); continue; }
    if (list.length) { out.push(`<ul>${list.map(x => `<li>${inl(x)}</li>`).join('')}</ul>`); list = []; }
    para.push(l);
  }
  flush(); return out.join('');
}
/* ───── «Історія роду» як стара книга: гортання сторінок, музика й звуки ───── */
const SND = {
  on: (() => { try { return localStorage.getItem('rs_snd') !== '0'; } catch { return true; } })(),
  music: null, fx: {},
  play(name, vol = 0.6) { if (!this.on) return; try { const a = (this.fx[name] ||= new Audio('/audio/' + name + '.mp3')); const c = a.cloneNode(); c.volume = vol; c.play().catch(() => {}); } catch {} },
  page() { this.play('page' + Math.floor(Math.random() * 3), 0.55); },
  startMusic() {
    if (!this.on) return;
    if (!this.music) { this.music = new Audio('/audio/music.mp3'); this.music.loop = true; this.music.volume = 0; }
    const m = this.music; if (!m.paused && m.volume > 0.05) return;
    m.play().then(() => { clearInterval(this._f); this._f = setInterval(() => { m.volume = Math.min(0.32, m.volume + 0.02); if (m.volume >= 0.32) clearInterval(this._f); }, 120); }).catch(() => {});
  },
  stopMusic() { const m = this.music; if (!m || m.paused) return; clearInterval(this._f); this._f = setInterval(() => { m.volume = Math.max(0, m.volume - 0.03); if (m.volume <= 0.01) { clearInterval(this._f); m.pause(); } }, 60); },
  toggle() { this.on = !this.on; try { localStorage.setItem('rs_snd', this.on ? '1' : '0'); } catch {} if (this.on) this.startMusic(); else this.stopMusic(); },
};
const BOOK = { key: '', pages: [], chapters: [], spread: true, busy: false };
const bkFs = () => { let v = 0; try { v = +localStorage.getItem('rs_bkfs') || 0; } catch {} return Math.max(-2, Math.min(4, v)); };
const bkFsPx = (d, single) => (single ? 16 : 16.5) + d.fs * 1.5;
const bkAnchor = () => { const p = BOOK.pages[S.ui.bkPos || 0] || BOOK.pages[(S.ui.bkPos || 0) + 1]; return p?.html ? p.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) : null; };
function bookShell() {
  return `<div class="bk" id="bk">
    <div class="bk-bar">
      <button class="bk-b" data-bk="toc" title="Зміст" aria-label="Зміст">☰ <span>Зміст</span></button>
      <button class="bk-b" data-bk="prev" title="Попередня сторінка (←)" aria-label="Попередня">‹</button>
      <button type="button" class="bk-n bk-pg mono" id="bk-n" data-bk="pg" title="Перейти на сторінку"></button>
      <button class="bk-b" data-bk="next" title="Наступна сторінка (→)" aria-label="Наступна">›</button>
      <button class="bk-b bk-dk" data-bk="fs-" title="Менший шрифт" aria-label="Менший шрифт">A−</button><button class="bk-b bk-dk" data-bk="fs+" title="Більший шрифт" aria-label="Більший шрифт">A+</button>
      <button class="bk-b" data-bk="snd" id="bk-snd" title="${SND.on ? 'Вимкнути звук' : 'Увімкнути звук'}" aria-label="Звук">${SND.on ? '🔊' : '🔇'}</button>
      <button class="bk-b txt bk-dk" data-bk="plain" title="Читати звичайним текстом">Текстом</button>
      <button class="bk-b bk-fullb" data-bk="full" id="bk-full" title="На весь екран — лише книга" aria-label="На весь екран">⛶</button>
    </div>
    <div class="bk-toc" id="bk-toc" hidden></div>
    <div class="bk-stage" id="bk-stage"><div class="bk-book" id="bk-book"></div></div>
    <p class="bk-hint small">Гортайте: клік по краю сторінки, стрілки ← → або свайп. Імена — посилання на картки людей.</p>
  </div>`;
}
function bookDims() {
  const st = document.getElementById('bk-stage'); const W = st.clientWidth, vh = document.documentElement.clientHeight;
  const spread = W >= 860;
  let pw, ph;
  const full = document.documentElement.classList.contains('bk-full'); // режим «лише книга»: без шапок і меню
  if (spread) { pw = Math.min((W - 48) / 2, full ? 640 : 520, (vh - (full ? 90 : 210)) / 1.42); ph = pw * 1.42; }
  else { const mob = innerWidth <= 820;
    // телефон: книга вміщається між шапкою сторінки й панеллю гортання + нижнім меню — щоб «Читати далі» на обкладинці було видно одразу
    const top = mob && !full ? Math.max(0, st.getBoundingClientRect().top + scrollY) : 0, bars = mob ? ((document.querySelector('.bk-bar')?.offsetHeight || 60) + (document.querySelector('.bnav')?.offsetHeight || 64) + 14) : 0;
    const avail = full ? vh - 84 : mob ? Math.max(380, vh - top - bars) : vh - 190;
    pw = Math.min(W - 16, full ? Math.min(560, innerWidth - 20) : 460, avail / 1.5); ph = pw * 1.5; } // телефон: шапка 52 + панель книги 56 + нижнє меню 64
  return { spread, pw: Math.floor(pw), ph: Math.floor(ph), fs: bkFs() };
}
function bookPaginate(html, d) {
  // розкладаємо текст по сторінках: міряємо в прихованій сторінці такого самого розміру
  const meas = document.createElement('div'); meas.className = 'bk-page bk-meas'; meas.style.width = d.pw + 'px'; meas.style.height = d.ph + 'px'; meas.style.setProperty('--pw', d.pw + 'px'); meas.style.fontSize = bkFsPx(d, !d.spread) + 'px';
  meas.innerHTML = '<div class="bk-body"></div>'; document.body.appendChild(meas);
  const body = meas.firstChild, src = document.createElement('div'); src.innerHTML = html;
  const pages = [], chapters = []; let cur = [], chapter = '';
  const fits = () => body.scrollHeight <= body.clientHeight + 1;
  const used = () => { const l = body.lastElementChild; return l ? l.offsetTop + l.offsetHeight - body.offsetTop : 0; };
  const flush = () => { if (!cur.length) return; pages.push({ html: cur.map(n => n.outerHTML).join(''), chapter }); cur = []; body.innerHTML = ''; };
  const push = n => { body.appendChild(n); cur.push(n); };
  const blocks = [...src.children];
  for (let i = 0; i < blocks.length; i++) {
    let n = blocks[i].cloneNode(true);
    if (n.tagName === 'HR') continue;
    if (n.tagName === 'H3') { flush(); chapter = n.textContent; chapters.push({ title: chapter, page: pages.length }); n.classList.add('ch'); }
    push(n);
    if (fits()) continue;
    body.removeChild(n); cur.pop();
    if ((n.tagName === 'P' || n.tagName === 'UL') && used() < body.clientHeight * 0.9) {
      // ділимо абзац/список: беремо скільки влазить
      if (n.tagName === 'UL') {
        const items = [...n.children], part = n.cloneNode(false); push(part); let k = 0;
        for (; k < items.length; k++) { part.appendChild(items[k].cloneNode(true)); if (!fits()) { part.removeChild(part.lastChild); break; } }
        if (!part.children.length) { body.removeChild(part); cur.pop(); } else { const rest = n.cloneNode(false); items.slice(k).forEach(x => rest.appendChild(x.cloneNode(true))); flush(); if (rest.children.length) { blocks.splice(i + 1, 0, rest); } continue; }
      } else {
        const words = n.innerHTML.split(/(?<=\s)(?![^<]*>)/); const part = n.cloneNode(false); push(part);
        let lo = 0, hi = words.length;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; part.innerHTML = words.slice(0, mid).join(''); if (fits()) lo = mid; else hi = mid - 1; }
        if (lo >= 4) { part.innerHTML = words.slice(0, lo).join(''); const rest = n.cloneNode(false); rest.innerHTML = words.slice(lo).join(''); rest.classList.add('cont'); flush(); blocks.splice(i + 1, 0, rest); continue; }
        body.removeChild(part); cur.pop();
      }
    }
    if (!cur.length) { push(n); flush(); continue; } // блок більший за порожню сторінку — кладемо як є
    // не залишати заголовок самотнім унизу сторінки
    const moved = []; while (cur.length > 1 && /^H[2-4]$/.test(cur[cur.length - 1].tagName)) { moved.unshift(cur.pop()); }
    moved.forEach(m => body.removeChild(m));
    flush(); moved.forEach(push); i--; // повторюємо цей блок на новій сторінці
  }
  flush(); meas.remove();
  return { pages, chapters };
}
function bookBuild(d) {
  const t = TXT.history; if (!t) return false;
  const key = [d.pw, d.ph, d.spread, d.fs, (t.md || '').length, t.updated].join('|');
  if (BOOK.key === key) return true;
  const html = glossify(md(t.md || t)).replace(/<div class="gnotes">([\s\S]*?)<\/div>\s*$/, (m, inner) => '<h3>Пояснення старих слів</h3>' + inner.replace(/<p>/g, '<p class="gl-n">'));
  const { pages, chapters } = bookPaginate(html, d);
  const title = { kind: 'title' }, toc = { kind: 'toc' }, end = { kind: 'end' };
  const off = 2; chapters.forEach(c => { c.page += off; });
  const list = [title, toc, ...pages, end];
  if (d.spread) { list.unshift({ kind: 'paper' }); if (list.length % 2) list.push({ kind: 'paper' }); chapters.forEach(c => { c.page += 1; }); }
  BOOK.key = key; BOOK.pages = list; BOOK.chapters = chapters; BOOK.spread = d.spread; BOOK.d = d; BOOK.updated = t.updated;
  return true;
}
function bookPageHtml(i) {
  const p = BOOK.pages[i]; if (!p) return '<div class="bk-page blank"></div>';
  const num = BOOK.spread ? i : i + 1;
  if (p.kind === 'paper') return `<div class="bk-page paper"><div class="bk-orn big">❦</div></div>`;
  if (p.kind === 'title') return `<div class="bk-page title"><div class="bk-tp"><div class="bk-orn">✥</div><div class="small caps">Родинний літопис</div><h2>Історія<br>нашого роду</h2><div class="bk-rule"></div><p>Вороньки · Веприк · Лідин<br>Розкошівка · Ємилівка</p><p class="small">з 1791 року до наших днів</p><div class="bk-orn">❧</div><p class="small muted">Записано за метричними книгами, сповідними відомостями, записами ЗАГС і спогадами родини.${BOOK.updated ? ' Редакція ' + esc(BOOK.updated) + '.' : ''}</p></div></div>`;
  if (p.kind === 'toc') return `<div class="bk-page"><div class="bk-body"><h3 class="ch">Зміст</h3><ol class="bk-tocl">${BOOK.chapters.map(c => `<li><a href="#" data-bkgo="${c.page}"><span>${esc(c.title)}</span><i></i><b>${BOOK.spread ? c.page : c.page + 1}</b></a></li>`).join('')}</ol></div><div class="bk-foot">${num}</div></div>`;
  if (p.kind === 'end') return `<div class="bk-page title"><div class="bk-tp"><div class="bk-orn">❦</div><p><i>Історія роду пишеться далі.</i></p><p class="small">Знаєте більше — напишіть спогад на картці людини або натисніть «Уточнити / запитати».</p><div class="bk-orn">✥</div></div></div>`;
  return `<div class="bk-page"><div class="bk-head">${esc(p.chapter || '')}</div><div class="bk-body">${p.html}</div><div class="bk-foot">${num}</div></div>`;
}
function bookCoverHtml() {
  return `<div class="bk-cover" data-bk="open" role="button" aria-label="Відкрити книгу"><div class="bk-cv-in"><div class="bk-orn">✥</div><div class="caps">Родинний літопис</div><h2>Історія<br>нашого роду</h2><div class="bk-rule"></div><div class="caps small">1791 — 2025</div><div class="bk-by">Зібрав і записав<br><b>Максим Шутий</b></div><button class="bk-open" data-bk="open">${bkHasMark() ? 'Читати далі' : 'Відкрити книгу'}</button>${bkHasMark() ? '<div class="bk-mk small">🔖 відкриється там, де ви зупинились</div>' : ''}</div></div>`;
}
function bookRender() {
  const book = document.getElementById('bk-book'); if (!book) return;
  const d = BOOK.d, open = S.ui.bkOpen; let i = Math.max(0, Math.min(S.ui.bkPos || 0, BOOK.pages.length - 1));
  if (BOOK.spread && i % 2) i--; S.ui.bkPos = i;
  book.style.setProperty('--pw', d.pw + 'px'); book.style.setProperty('--ph', d.ph + 'px'); book.style.setProperty('--bkfs', bkFsPx(d, !BOOK.spread) + 'px');
  book.className = 'bk-book ' + (BOOK.spread ? 'spread' : 'single') + (open ? ' open' : ' closed');
  if (!open) book.innerHTML = `<div class="bk-side r">${bookCoverHtml()}</div>`;
  else if (BOOK.spread) book.innerHTML = `<div class="bk-side l" data-bk="prev">${bookPageHtml(i)}</div><div class="bk-side r" data-bk="next">${bookPageHtml(i + 1)}</div><div class="bk-spine"></div>`;
  else book.innerHTML = `<div class="bk-side r" data-bk="next">${bookPageHtml(i)}</div>`;
  const n = document.getElementById('bk-n'), N = BOOK.pages.length;
  bookCounter();
  const toc = document.getElementById('bk-toc');
  if (toc) toc.innerHTML = `<div class="bk-tset"><span>Шрифт</span><button class="bk-b" data-bk="fs-" aria-label="Менший шрифт">A−</button><button class="bk-b" data-bk="fs+" aria-label="Більший шрифт">A+</button><button class="bk-b txt" data-bk="plain">Читати текстом</button></div>` + BOOK.chapters.map(c => `<a href="#" data-bkgo="${c.page}">${esc(c.title)} <span class="mono">${BOOK.spread ? c.page : c.page + 1}</span></a>`).join('');
}
// закладка: де людина зупинилась (у цьому браузері) — за текстом сторінки, тож переживає зміну шрифту, екрана й нові розділи
const bkHasMark = () => { try { return !!localStorage.getItem('rs_bkmark'); } catch { return false; } };
function bkMarkSave() { if (!S.ui.bkOpen || !BOOK.pages.length) return; const i = S.ui.bkPos || 0; try { if (i < 2) { if (BOOK.markOk) localStorage.removeItem('rs_bkmark'); } else localStorage.setItem('rs_bkmark', JSON.stringify({ a: bkAnchor(), f: i / BOOK.pages.length })); } catch {} }
function bkMarkFind() { let m = null; try { m = JSON.parse(localStorage.getItem('rs_bkmark') || 'null'); } catch {} if (!m) return 0;
  const tx = p => p.html ? p.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') : ''; let k = -1;
  for (const L of [40, 24, 14]) { if (!m.a || k >= 0) break; const q = m.a.slice(0, L); k = BOOK.pages.findIndex(p => tx(p).includes(q)); }
  if (k < 0) k = Math.round((m.f || 0) * BOOK.pages.length);
  k = Math.max(0, Math.min(k, BOOK.pages.length - 1)); if (BOOK.spread && k % 2) k--; return k; }
function bookCounter() {
  const n = document.getElementById('bk-n'), N = BOOK.pages.length, i = S.ui.bkPos || 0; bkMarkSave();
  if (n && !n.querySelector('input')) n.textContent = (!S.ui.bkOpen ? 'обкладинка' : BOOK.spread ? `стор. ${i}–${i + 1} з ${N - 1}` : `стор. ${i + 1} з ${N}`) + ' ▾';
}
function bookFlip(dir, target) {
  if (BOOK.busy) return; const book = document.getElementById('bk-book'); if (!book) return;
  const step = BOOK.spread ? 2 : 1, N = BOOK.pages.length, i = S.ui.bkPos || 0;
  if (!S.ui.bkOpen) { if (dir > 0) bookOpen(); return; }
  let j = target != null ? target : i + dir * step; if (BOOK.spread && j % 2) j--;
  if (j === i) return;
  if (j < 0) { bookClose(); return; }
  if (j >= N) return;
  dir = j > i ? 1 : -1; BOOK.busy = true; SND.page(); const fid = BOOK.fid = (BOOK.fid || 0) + 1;
  const leaf = document.createElement('div'); leaf.className = 'bk-leaf ' + (dir > 0 ? 'fwd' : 'back') + (BOOK.spread ? '' : ' one');
  if (BOOK.spread) {
    if (dir > 0) { leaf.innerHTML = `<div class="bk-face front">${bookPageHtml(i + 1)}</div><div class="bk-face backf">${bookPageHtml(j)}</div>`; book.querySelector('.bk-side.r').innerHTML = bookPageHtml(j + 1); }
    else { leaf.innerHTML = `<div class="bk-face front">${bookPageHtml(i)}</div><div class="bk-face backf">${bookPageHtml(j + 1)}</div>`; book.querySelector('.bk-side.l').innerHTML = bookPageHtml(j); }
  } else {
    if (dir > 0) { leaf.innerHTML = `<div class="bk-face front">${bookPageHtml(i)}</div><div class="bk-face backf"><div class="bk-page paper"></div></div>`; book.querySelector('.bk-side.r').innerHTML = bookPageHtml(j); }
    else { leaf.className += ' in'; leaf.innerHTML = `<div class="bk-face front">${bookPageHtml(j)}</div><div class="bk-face backf"><div class="bk-page paper"></div></div>`; }
  }
  book.appendChild(leaf);
  requestAnimationFrame(() => requestAnimationFrame(() => leaf.classList.add('go')));
  const done = () => { if (BOOK.fid !== fid || !leaf.isConnected) return; BOOK.fid++; S.ui.bkPos = j;
    const l = book.querySelector('.bk-side.l'), r = book.querySelector('.bk-side.r');
    if (BOOK.spread) { if (dir > 0) l.innerHTML = bookPageHtml(j); else r.innerHTML = bookPageHtml(j + 1); }
    else if (dir < 0) r.innerHTML = bookPageHtml(j);
    leaf.remove(); BOOK.busy = false; bookCounter(); };
  leaf.addEventListener('transitionend', e => { if (e.target === leaf) done(); }); setTimeout(done, 1300);
}
function bookOpen() {
  if (BOOK.busy) return; const book = document.getElementById('bk-book'); if (!book) return;
  BOOK.busy = true; SND.play('creak', 0.5); SND.startMusic();
  const stg = document.getElementById('bk-stage');
  if (stg) { // телефон: книга одразу під шапкою, щоб сторінка вміщалась між шапкою і панеллю гортання
    const hh = innerWidth <= 820 ? (document.querySelector('.top')?.offsetHeight || 52) : 0, t = stg.getBoundingClientRect().top;
    if (hh ? Math.abs(t - hh) > 6 : t > window.innerHeight * 0.35) window.scrollTo({ top: scrollY + t - hh, behavior: 'smooth' });
  }
  const i = 0; S.ui.bkPos = 0;
  if (BOOK.spread) {
    book.className = book.className.replace('closed', 'open');
    book.innerHTML = `<div class="bk-side l">${bookPageHtml(i)}</div><div class="bk-side r">${bookPageHtml(i + 1)}</div><div class="bk-spine"></div>`;
    const leaf = document.createElement('div'); leaf.className = 'bk-leaf fwd cover'; leaf.innerHTML = `<div class="bk-face front">${bookCoverHtml()}</div><div class="bk-face backf"><div class="bk-page endp"></div></div>`;
    book.appendChild(leaf); requestAnimationFrame(() => requestAnimationFrame(() => leaf.classList.add('go')));
    const k = bkMarkFind(); let fin = false;
    const done = () => { if (fin) return; fin = true; S.ui.bkOpen = true; BOOK.busy = false; S.ui.bkPos = 0; bookRender(); if (k > 0) setTimeout(() => { BOOK.markOk = true; bookFlip(0, k); }, 150); else BOOK.markOk = true; };
    leaf.addEventListener('transitionend', done, { once: true }); setTimeout(done, 1700);
  } else { S.ui.bkOpen = true; BOOK.busy = false; S.ui.bkPos = bkMarkFind(); BOOK.markOk = true; bookRender(); }
}
function bookClose() { SND.play('thud', 0.5); S.ui.bkOpen = false; S.ui.bkPos = 0; bookRender(); }
function bookMount() {
  const st = document.getElementById('bk-stage'); if (!st) return;
  if (document.fonts && document.fonts.status !== 'loaded' && !BOOK.fontWait) { BOOK.fontWait = true; document.fonts.ready.then(() => { BOOK.key = ''; bookMount(); }); }
  if (TXT.history === undefined) return; // ще вантажиться — render() викличе знову
  const d = bookDims(); if (!bookBuild(d)) { st.innerHTML = `<div class="bk-empty"><p>Історію роду ще не написано.</p></div>`; return; }
  BOOK.d = d; bookRender();
  if (S.ui.bkOpen) SND.startMusic();
}
// події книги
document.addEventListener('click', e => {
  const g = e.target.closest('[data-bkgo]'); if (g) { e.preventDefault(); const t = +g.dataset.bkgo; const tc = document.getElementById('bk-toc'); if (tc) tc.hidden = true; if (!S.ui.bkOpen) { S.ui.bkOpen = true; SND.startMusic(); S.ui.bkPos = t; bookRender(); } else bookFlip(0, t); return; }
  const tcO = document.getElementById('bk-toc'); // відкритий зміст закривається дотиком поза ним
  if (tcO && !tcO.hidden && !e.target.closest('#bk-toc,[data-bk="toc"]')) { tcO.hidden = true; if (e.target.closest('#bk-stage')) return; }
  const b = e.target.closest('[data-bk]'); if (!b || !document.getElementById('bk')) return;
  if (e.target.closest('a') && !e.target.closest('[data-bk="toc"]')) return; // посилання всередині сторінки працюють як звичайно
  const a = b.dataset.bk;
  if (a === 'pg') { if (e.target.closest('input')) return; const N = BOOK.pages.length, max = BOOK.spread ? N - 1 : N, cur = S.ui.bkOpen ? (BOOK.spread ? S.ui.bkPos || 1 : (S.ui.bkPos || 0) + 1) : 1;
    b.innerHTML = `стор. <input type="number" class="bk-pgin" min="1" max="${max}" value="${cur}" inputmode="numeric" aria-label="Номер сторінки"> з ${max}`; const inp = b.querySelector('input'); inp.focus(); inp.select(); return; }
  if (Date.now() - (BOOK.swiped || 0) < 400) return; // клік одразу після свайпу не рахуємо
  if (a === 'next' && !BOOK.spread && b.classList.contains('bk-side') && e.clientX < b.getBoundingClientRect().left + b.offsetWidth * 0.33) return bookFlip(-1);
  if (a === 'next') return bookFlip(1);
  if (a === 'prev') return bookFlip(-1);
  if (a === 'open') return bookOpen();
  if (a === 'fs-' || a === 'fs+') { const v = Math.max(-2, Math.min(4, bkFs() + (a === 'fs+' ? 1 : -1))); try { localStorage.setItem('rs_bkfs', String(v)); } catch {} bookReflow(true); return; }
  if (a === 'toc') { const tc = document.getElementById('bk-toc'); tc.hidden = !tc.hidden; return; }
  if (a === 'snd') { SND.toggle(); b.textContent = SND.on ? '🔊' : '🔇'; b.title = SND.on ? 'Вимкнути звук' : 'Увімкнути звук'; return; }
  if (a === 'plain') { bkFull(false); S.ui.ridPlain = true; SND.stopMusic(); render(); return; }
  if (a === 'full') { bkFull(!document.documentElement.classList.contains('bk-full')); return; }
});
// «На весь екран»: ховаємо шапки, меню й підказки — лишається тільки книга (+ справжній повноекранний режим, де браузер дозволяє)
function bkFull(on) {
  const r = document.documentElement; if (r.classList.contains('bk-full') === on) return;
  r.classList.toggle('bk-full', on); const b = document.getElementById('bk-full');
  if (b) { b.textContent = on ? '✕' : '⛶'; b.title = on ? 'Вийти з повноекранного читання' : 'На весь екран — лише книга'; }
  try { if (on && r.requestFullscreen && !document.fullscreenElement) r.requestFullscreen().catch(() => {}); if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch {}
  setTimeout(() => bookReflow(true), 60);
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.documentElement.classList.contains('bk-full')) bkFull(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.documentElement.classList.contains('bk-full')) bkFull(false); });
addEventListener('hashchange', () => bkFull(false));
document.addEventListener('keydown', e => {
  if (!document.getElementById('bk') || document.querySelector('.pv, .modal') || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); bookFlip(1); } if (e.key === 'ArrowLeft') { e.preventDefault(); bookFlip(-1); }
});
(() => { let sx = null, sy = 0; const act = new Set(); const zoomed = () => (window.visualViewport?.scale || 1) > 1.05;
  document.addEventListener('pointerdown', e => { if (e.isPrimary) act.clear(); act.add(e.pointerId); if (act.size > 1) { sx = null; return; } if (e.target.closest('#bk-stage') && !e.target.closest('button')) { sx = e.clientX; sy = e.clientY; } else sx = null; });
  document.addEventListener('pointerup', e => { act.delete(e.pointerId); if (sx == null) return; const dx = e.clientX - sx, dy = e.clientY - sy; sx = null; if (zoomed()) return; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { BOOK.swiped = Date.now(); bookFlip(dx < 0 ? 1 : -1); } });
  document.addEventListener('pointercancel', e => { act.delete(e.pointerId); sx = null; }); })();
function bookReflow(force) { if (!document.getElementById('bk') || BOOK.busy) return; const d = bookDims(); if (!force && d.pw === BOOK.d?.pw && d.ph === BOOK.d?.ph && d.spread === BOOK.spread) return;
  const a = bkAnchor(), frac = (S.ui.bkPos || 0) / Math.max(1, BOOK.pages.length); BOOK.key = ''; if (!bookBuild(d)) return; BOOK.d = d;
  const tx = p => p.html ? p.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') : ''; let k = -1;
  for (const L of [40, 24, 14]) { if (!a || k >= 0) break; const q = a.slice(0, L); k = BOOK.pages.findIndex(p => tx(p).includes(q)); }
  if (k < 0) k = Math.round(frac * BOOK.pages.length);
  S.ui.bkPos = k; bookRender(); }
let bkRs; window.addEventListener('resize', () => { clearTimeout(bkRs); bkRs = setTimeout(() => bookReflow(false), 300); });

function vRid() {
  const t = loadText('history');
  if (t === undefined) return '<p class="muted">Завантажую…</p>';
  if (!t) return '<p class="muted">Історію роду ще не написано.</p>';
  if (!S.ui.ridPlain) return bookShell();
  const html = md(t.md || t);
  const toc = [...html.matchAll(/<h3 id="(h-\d+)">(.*?)<\/h3>/g)].map(m => `<a href="#" data-toh="${m[1]}">${m[2].replace(/<[^>]+>/g, '')}</a>`).join('');
  return `<p><button class="btn line small" data-act="ridbook">📖 Відкрити як книгу</button></p><div class="rid">${toc ? `<nav class="rid-toc">${toc}</nav>` : ''}<div class="rid-body">${glossify(html)}</div>${t.updated ? `<p class="small muted">Текст оновлено: ${esc(t.updated)}. Помітили помилку — натисніть «Уточнити / запитати» на картці людини.</p>` : ''}</div>`;
}
function vHistory() {
  const v = loadText('villages');
  if (v && v.sections) {
    const src = l => (l || []).map(x => x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.name)}</a>` : esc(x.name)).join(' · ');
    const O = S.ui.hsOpen || {}, all = v.sections.length && v.sections.every((_, i) => O[i]);
    const det = (k, title, n, body) => `<details class="hsec" data-hs="${k}"${O[k] ? ' open' : ''}><summary><span class="hs-t">${title}</span><span class="hs-n">${n}</span></summary>${body}</details>`;
    return `<div class="hist">${glossify(`<p>${esc(v.intro || '')}</p><p class="hs-all"><button type="button" class="btn line small" data-act="hs-all">${all ? 'Згорнути все' : 'Читати все'}</button></p>` + v.sections.map((sec, i) => det(i, esc(sec.title), `${sec.items.length} ${sec.items.length === 1 ? 'подія' : sec.items.length < 5 ? 'події' : 'подій'}`, `<div class="hl">${sec.items.map(it => `<div class="hr"><span class="mono">${esc(it.y || '')}</span><span>${esc(it.t)}${it.src?.length ? `<span class="hsrc">Джерело: ${src(it.src)}</span>` : ''}</span></div>`).join('')}</div>`)).join(''))}
      ${v.ask?.length ? det('ask', 'Що варто замовити в архівах', v.ask.length, `<ul class="small">${v.ask.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`) : ''}
      ${v.sources?.length ? det('src', 'Усі джерела', v.sources.length, `<ol class="small hsrcs">${v.sources.map(x => `<li>${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.name)}</a>` : esc(x.name)}</li>`).join('')}</ol>`) : ''}</div>`;
  }
  return vHistoryOld();
}
function vHistoryOld() {
  return `<div class="hist">${glossify(`<p>${esc(VHIST_INTRO)}</p><div class="hl">` + VHIST.map(([y, t, src]) => `<div class="hr"><span class="mono">${esc(y)}</span><span>${esc(t)}${src ? ` <i class="small muted">— ${esc(src)}</i>` : ''}</span></div>`).join('') + '</div>')}
  <h3>Шутих у цих джерелах поки не знайдено</h3><p class="small">Найдавніший відомий запис — сповідна відомість 1834 р. Щоб піти глибше, варто замовити:</p><ul class="small">${VHIST_ASK.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
  <p class="small muted">Є припущення, що назва «Веприк» — від «вепр» (дикий кабан), як в інших селах з такою назвою; джерела для нашого Веприка не знайдено.</p></div>`;
}
function vVillages() { curTarget = 'villages'; return `<div class="pghead"><h1 title="Історія Вороньків, Веприка й сусідніх сіл — з посиланнями на джерела.">Історія сіл</h1><p class="tabnote">Вороньки, Веприк і сусідні села — від найдавніших згадок до наших днів, з джерелом біля кожного факту.</p></div>${vHistory()}`; }
function vMaps() {
  curTarget = 'maps';
  const all = mapsList(), vs = [...new Set(all.flatMap(m => m.villages || []))].sort((a, b) => a.localeCompare(b, 'uk'));
  const f = S.ui.mapv || '', list = f ? all.filter(m => (m.villages || []).includes(f)) : all;
  if (S.ui.mtab === 'hist') { S.ui.mtab = ''; location.hash = href('villages'); }
  return `<a class="rtlink" href="#/routes">${MI.routes}<span><b>Сімейні маршрути</b><i>Прогулянка місцями родини: дім, школа, робота, кладовище — з історіями біля кожної точки</i></span><em>→</em></a><div class="pghead"><h1 title="Старі карти наших сіл.">Старі карти</h1><p class="tabnote" title="Як виглядали наші села 100–150 років тому. Карту з позначкою «прив'язана» можна накласти на сучасну карту чи супутниковий знімок.">Як виглядали наші села 100–150 років тому. Карту з позначкою «прив'язана» можна накласти на сучасну карту чи супутниковий знімок.</p></div>
  <div class="tbar mapbar">${vs.length > 1 ? `<div class="seg"><button type="button" class="${!f ? 'on' : ''}" data-act="map-v" data-v="">Усі (${all.length})</button>${vs.map(v => `<button type="button" class="${f === v ? 'on' : ''}" data-act="map-v" data-v="${esc(v)}">${esc(v)}</button>`).join('')}</div>` : ''}
    ${canEdit() ? `<button class="btn line small" data-act="map-form">+ Додати карту</button>` : ''}</div>
  ${canEdit() && S.ui.mapform ? `<div class="docform"><input class="in" id="mtitle" placeholder="Назва: напр. «Вороньки на карті РККА»"><input class="in" id="myear" inputmode="numeric" placeholder="Рік (напр. 1941)"><input class="in" id="mvil" placeholder="Села через кому: Вороньки, Веприк"><input class="in" id="msrc" placeholder="Джерело: звідки карта"><label class="btn line small" style="cursor:pointer">Вибрати зображення<input type="file" accept="image/*" multiple data-mapup="1" hidden></label><div class="msg" id="mmsg"></div></div>` : ''}
  <div class="maps">${list.map(m => `<article class="mapc">
    <button class="mapim" data-doc="${m.id}" title="Відкрити карту">${m.pages ? `<img src="${img('doc=' + m.id + '&page=0', true)}" alt="" loading="lazy">` : '<span class="ph">зображення ще немає</span>'}</button>
    <div class="mapt"><b>${esc(m.title)}</b><span class="mono small">${esc(m.date || m.year || '')}</span>
      ${(m.villages || []).length ? `<span class="small muted">${m.villages.map(esc).join(' · ')}</span>` : ''}
      ${m.text ? `<p class="small">${glossify(mdLinks(esc(m.text)))}</p>` : ''}
      ${m.src ? `<p class="small muted">${esc(m.src)}${m.url ? ` <a href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">оригінал</a>` : ''}</p>` : ''}
      <div class="btns"><button class="btn line small" data-doc="${m.id}">Відкрити</button>${m.pages && (m.geo || []).length >= 3 ? `<button class="btn small" data-act="map-over" data-id="${m.id}">Накласти на сучасну карту</button><span class="small muted">прив'язана</span>` : `<span class="small muted">ще не прив'язана до сучасної карти</span>`}</div></div>
  </article>`).join('') || '<p class="muted">Карт поки немає.</p>'}</div>`;
}
async function uploadMap(files) {
  const m = $('#mmsg'), v = id => ($('#' + id)?.value || '').trim();
  if (!v('mtitle')) { m.className = 'msg err'; m.textContent = 'Вкажіть назву карти.'; return; }
  const meta = { type: 'map', title: v('mtitle'), date: v('myear'), year: Number(v('myear')) || undefined, src: v('msrc'), villages: v('mvil').split(',').map(x => x.trim()).filter(Boolean) };
  const id = 'map' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); let n = 0;
  for (const f of files) {
    try {
      m.className = 'msg'; m.textContent = `Завантажую ${n + 1} з ${files.length}…`;
      let full = await toJpeg(f, 4000, 0.86); if (full.size > 4e6) full = await toJpeg(f, 3000, 0.82); if (full.size > 4e6) full = await toJpeg(f, 2400, 0.8);
      const r = await api(`/api/upload?doc=${id}${n ? '' : '&meta=' + encodeURIComponent(JSON.stringify(meta))}`, { raw: full });
      await api(`/api/upload?doc=${id}&kind=thumb&page=${r.page}`, { raw: await toJpeg(f, 420, 0.78) }).catch(() => {});
      n++;
    } catch (err) { m.className = 'msg err'; m.textContent = `«${f.name}»: ${errText(err)}`; }
  }
  if (n) { S.ui.mapform = false; await load(); S.ui.keepScroll = true; render(); toast('Карту додано'); }
}

/* Накладання на сучасну карту: власна проста «карта» з плиток OSM / супутника (без бібліотек) */
const BASES = {
  osm: { name: 'Схема', url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`, attr: '© учасники OpenStreetMap', max: 19 },
  sat: { name: 'Супутник', url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`, attr: 'Знімок: Esri, Maxar, Earthstar Geographics', max: 18 },
};
const merc = (lat, lon) => { const s = Math.sin(lat * Math.PI / 180); return [(lon + 180) / 360 * 256, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256]; };
function fitAffine(pts) { // пікселі зображення -> «світові» пікселі (зум 0), найменші квадрати
  const solve = (M, v) => { const a = M.map((r, i) => [...r, v[i]]); for (let i = 0; i < 3; i++) { let p = i; for (let j = i + 1; j < 3; j++) if (Math.abs(a[j][i]) > Math.abs(a[p][i])) p = j; [a[i], a[p]] = [a[p], a[i]]; for (let j = 0; j < 3; j++) if (j !== i) { const k = a[j][i] / a[i][i]; for (let c = i; c < 4; c++) a[j][c] -= k * a[i][c]; } } return a.map((r, i) => r[3] / r[i]); };
  const N = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bx = [0, 0, 0], by = [0, 0, 0];
  for (const [ix, iy, lat, lon] of pts) { const [wx, wy] = merc(lat, lon), r = [ix, iy, 1]; for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) N[i][j] += r[i] * r[j]; bx[i] += r[i] * wx; by[i] += r[i] * wy; } }
  const [A, B, C] = solve(N, bx), [D, E, F] = solve(N, by); return { A, B, C, D, E, F };
}
function openOverlay(id) {
  const geoMaps = mapsList().filter(x => x.pages && (x.geo || []).length >= 3);
  let m = S.data.documents.find(d => d.id === id); if (!m || (m.geo || []).length < 3) return;
  const mkT = mm => { const t = fitAffine(mm.geo); if (mm.shift) { t.C += mm.shift[0]; t.F += mm.shift[1]; } return t; };
  let T = mkT(m), adj = false, adjStart = null;
  ev('open', 'map', 'map:' + id);
  const L = $('#layer'); document.body.classList.add('noscroll');
  let base = S.ui.mbase || 'sat', op = S.ui.mop ?? 0.7, show = true;
  L.innerHTML = `<div class="ov" role="dialog" aria-modal="true" aria-label="${esc(m.title)}">
    <div class="ov-map"><div class="ov-tiles"></div><img class="ov-old" alt="" draggable="false"></div>
    <div class="ov-top"><select class="ov-sel" aria-label="Яку стару карту накласти">${geoMaps.map(x => `<option value="${x.id}"${x.id === m.id ? ' selected' : ''}>${esc((x.year ? x.year + ' · ' : '') + x.title)}</option>`).join('')}</select><button class="pv-ic" data-ov="close" title="Закрити (Esc)" aria-label="Закрити">${ICO.x}</button></div>
    <div class="ov-ctl">
      <div class="seg">${Object.entries(BASES).map(([k, b]) => `<button type="button" data-ov="base" data-v="${k}" class="${k === base ? 'on' : ''}">${b.name}</button>`).join('')}</div>
      <label class="ov-op"><span>Стара</span><input type="range" min="0" max="100" value="${Math.round(op * 100)}" aria-label="Прозорість старої карти"></label>
      <button class="btn small line" data-ov="toggle">Сховати</button>
      <button class="btn small line" data-ov="zin" aria-label="Збільшити">+</button><button class="btn small line" data-ov="zout" aria-label="Зменшити">−</button>
      <a class="btn small line" data-ov="gmaps" target="_blank" rel="noopener noreferrer">Google Maps ↗</a>
      ${canEdit() ? `<button class="btn small line" data-ov="adj" title="Тягніть стару карту, щоб точніше суміщалася з сучасною">Підігнати</button>` : ''}
    </div>
    <div class="ov-attr"></div></div>`;
  const root = L.querySelector('.ov'), box = root.querySelector('.ov-map'), tiles = root.querySelector('.ov-tiles'), old = root.querySelector('.ov-old'), attr = root.querySelector('.ov-attr');
  old.src = img('doc=' + id + '&page=0'); old.style.opacity = op;
  const W = () => box.clientWidth, H = () => box.clientHeight;
  // початковий вигляд — уся стара карта
  let cx, cy, z;
  const fitOld = () => { const w = old.naturalWidth || 2000, h = old.naturalHeight || 1500; const cs = [[0, 0], [w, 0], [0, h], [w, h]].map(([x, y]) => [T.A * x + T.B * y + T.C, T.D * x + T.E * y + T.F]); const xs = cs.map(c => c[0]), ys = cs.map(c => c[1]); cx = (Math.min(...xs) + Math.max(...xs)) / 2; cy = (Math.min(...ys) + Math.max(...ys)) / 2; z = Math.log2(Math.min(W() / (Math.max(...xs) - Math.min(...xs)), H() / (Math.max(...ys) - Math.min(...ys)))); z = Math.min(17, Math.max(3, z)); draw(); };
  let raf = 0; const draw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(paint); };
  const cache = new Map();
  function paint() {
    const B = BASES[base], zt = Math.max(0, Math.min(B.max, Math.round(z))), S2 = 2 ** z, ts = 256 * 2 ** (z - zt), n = 2 ** zt;
    const x0 = (cx - W() / 2 / S2) / 256 * n, y0 = (cy - H() / 2 / S2) / 256 * n, x1 = (cx + W() / 2 / S2) / 256 * n, y1 = (cy + H() / 2 / S2) / 256 * n;
    const want = new Set();
    for (let ty = Math.floor(y0); ty <= Math.floor(y1); ty++) for (let tx = Math.floor(x0); tx <= Math.floor(x1); tx++) {
      if (ty < 0 || ty >= n) continue; const wx = ((tx % n) + n) % n, key = base + '/' + zt + '/' + tx + '/' + ty; want.add(key);
      let el = cache.get(key); if (!el) { el = new Image(); el.referrerPolicy = 'strict-origin-when-cross-origin'; el.alt = ''; el.onerror = () => { el.style.visibility = 'hidden'; }; el.draggable = false; el.src = B.url(zt, wx, ty); cache.set(key, el); tiles.appendChild(el); }
      el.style.transform = `translate(${(tx * 256 / n - cx) * S2 + W() / 2}px,${(ty * 256 / n - cy) * S2 + H() / 2}px) scale(${ts / 256})`;
    }
    for (const [k, el] of cache) if (!want.has(k)) { el.remove(); cache.delete(k); }
    old.style.transform = `matrix(${T.A * S2},${T.D * S2},${T.B * S2},${T.E * S2},${(T.C - cx) * S2 + W() / 2},${(T.F - cy) * S2 + H() / 2})`;
    attr.textContent = B.attr + ' · Стара карта: ' + (m.src || '').split('.')[0];
  }
  const zoomAt = (nz, sx, sy) => { nz = Math.min(BASES[base].max + 1, Math.max(3, nz)); const S1 = 2 ** z, S2 = 2 ** nz; const wx = cx + (sx - W() / 2) / S1, wy = cy + (sy - H() / 2) / S1; cx = wx - (sx - W() / 2) / S2; cy = wy - (sy - H() / 2) / S2; z = nz; draw(); };
  const close = () => { cancelAnimationFrame(raf); document.removeEventListener('keydown', key, true); removeEventListener('resize', draw); closeLayer(); };
  const key = e => { if (!L.contains(root)) { document.removeEventListener('keydown', key, true); return; } if (e.key === 'Escape') { e.stopPropagation(); close(); } if (e.key === '+' || e.key === '=') zoomAt(z + 1, W() / 2, H() / 2); if (e.key === '-') zoomAt(z - 1, W() / 2, H() / 2); };
  document.addEventListener('keydown', key, true); addEventListener('resize', draw);
  root.querySelector('input[type=range]').addEventListener('input', e => { op = e.target.value / 100; S.ui.mop = op; old.style.opacity = show ? op : 0; });
  root.querySelector('.ov-sel').addEventListener('change', e => { m = S.data.documents.find(d => d.id === e.target.value); T = mkT(m); old.onload = draw; old.src = img('doc=' + m.id + '&page=0'); attr.textContent = ''; draw(); });
  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-ov]'); if (!b) return; const a = b.dataset.ov;
    if (a === 'close') return close();
    if (a === 'adj') {
      if (!adj) { adj = true; b.textContent = 'Зберегти суміщення'; b.classList.remove('line'); toast('Тягніть стару карту, поки дороги й річки не збіжуться'); return; }
      adj = false; b.textContent = 'Підігнати'; b.classList.add('line');
      const base0 = fitAffine(m.geo), dx = T.C - base0.C, dy = T.F - base0.F;
      try { await api('/api/data', { body: { op: 'doc.geoshift', id: m.id, dx, dy } }); m.shift = [dx, dy]; toast('Суміщення збережено для всіх'); } catch (err) { toast(errText(err)); }
      return;
    }
    if (a === 'base') { base = S.ui.mbase = b.dataset.v; root.querySelectorAll('[data-ov=base]').forEach(x => x.classList.toggle('on', x === b)); cache.forEach(el => el.remove()); cache.clear(); draw(); }
    if (a === 'toggle') { show = !show; old.style.opacity = show ? op : 0; b.textContent = show ? 'Сховати' : 'Показати'; }
    if (a === 'zin') zoomAt(z + 1, W() / 2, H() / 2);
    if (a === 'zout') zoomAt(z - 1, W() / 2, H() / 2);
    if (a === 'gmaps') { const lon = cx / 256 * 360 - 180, lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * cy / 256))) * 180 / Math.PI; b.href = `https://www.google.com/maps/@${lat.toFixed(5)},${lon.toFixed(5)},${Math.round(z)}z`; }
  });
  // жести: тягнути, колесо, два пальці
  const pts = new Map(); let st = null, pin = null;
  box.addEventListener('pointerdown', e => { pts.set(e.pointerId, [e.clientX, e.clientY]); box.setPointerCapture?.(e.pointerId); if (pts.size === 1) st = { x: e.clientX, y: e.clientY, cx, cy }; if (pts.size === 2) { const [[x1, y1], [x2, y2]] = [...pts.values()]; const r = box.getBoundingClientRect(); pin = { d: Math.hypot(x2 - x1, y2 - y1), z, mx: (x1 + x2) / 2 - r.left, my: (y1 + y2) / 2 - r.top }; } });
  box.addEventListener('pointermove', e => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]); if (adj && st && pts.size === 1) { const S1 = 2 ** z; adjStart ||= { C: T.C, F: T.F }; T.C = adjStart.C + (e.clientX - st.x) / S1; T.F = adjStart.F + (e.clientY - st.y) / S1; draw(); return; } if (pin && pts.size >= 2) { const [[x1, y1], [x2, y2]] = [...pts.values()]; zoomAt(pin.z + Math.log2(Math.hypot(x2 - x1, y2 - y1) / pin.d), pin.mx, pin.my); return; } if (st) { const S1 = 2 ** z; cx = st.cx - (e.clientX - st.x) / S1; cy = st.cy - (e.clientY - st.y) / S1; draw(); } });
  const up = e => { adjStart = null; pts.delete(e.pointerId); if (pts.size < 2) pin = null; if (!pts.size) st = null; else { const [[x, y]] = [...pts.values()]; st = { x, y, cx, cy }; } };
  box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
  box.addEventListener('wheel', e => { e.preventDefault(); const r = box.getBoundingClientRect(); zoomAt(z - e.deltaY / 300, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  if (old.complete && old.naturalWidth) fitOld(); else { old.onload = fitOld; old.onerror = fitOld; }
}

function vPeople() {
  const q = (S.ui.q || '').toLowerCase();
  const famT = p => (p.fam || []).map(x => FAM[x]?.title).filter(Boolean).join(', ');
  const list = Object.values(P).filter(p => !q || [full(p), p.m, p.bp, famT(p)].join(' ').toLowerCase().includes(q)).sort((a, b) => (a.s || 'я').localeCompare(b.s || 'я', 'uk') || byBirth(a.id, b.id));
  return `<div class="lede"><div class="eyebrow">Покажчик</div><h1>Усі родичі</h1><p class="small muted">${Object.keys(P).length} людей у дереві</p>${relLegend()}</div>
  <div class="btns plbar" style="margin-bottom:6px"><input class="in search" id="q" type="search" value="${esc(S.ui.q || '')}" placeholder="Пошук: ім'я, прізвище, село" aria-label="Пошук">${canEdit() ? `<button class="btn line" data-add="new" style="margin-bottom:18px">+ Нова<span class="hm"> людина</span></button>` : ''}</div>
  <div class="tablebox"><table class="t plist"><thead><tr><th>Ім'я</th><th>Роки</th><th>Місце</th><th>Гілка</th></tr></thead><tbody>
  ${list.map(p => `<tr class="click" data-go="${p.id}"><td><b style="font-family:var(--f-display);font-size:15.5px">${esc(full(p))}</b>${p.hyp ? '<span class="badge">гіпотеза</span>' : ''}</td><td class="mono small">${esc(life(p))}</td><td class="small">${esc(p.bp || '')}</td><td class="small">${esc(famT(p))}</td></tr>`).join('') || `<tr><td colspan="4" class="muted">Нікого не знайдено.</td></tr>`}
  </tbody></table></div>`;
}

/* ───── Документи ───── */
// Кілька сторінок документа (бланк і його зворот, розворот книги) — видно одразу: мініатюри поруч і «2 стор.»
const pgWord = n => n > 1 ? n + ' стор.' : '';
const docThumbs = d => d.pages > 1 ? `<span class="dthumbs">${Array.from({ length: Math.min(d.pages, 3) }, (_, k) => `<img src="${img('doc=' + d.id + '&page=' + k, true)}" alt="" loading="lazy">`).join('')}<em>${d.pages} стор.</em></span>` : `<img src="${img('doc=' + d.id + '&page=0', true)}" alt="" loading="lazy">`;
const docCard = d => `<button class="doc" data-doc="${d.id}"><span class="im">${d.pages ? docThumbs(d) : '<span class="ph" style="width:100%;height:100%">скан ще не додано</span>'}</span><b>${esc(d.title)}</b><span class="mono">${esc(d.date || '')}${d.place ? ' · ' + esc(d.place) : ''}</span></button>`;
function vDocs() {
  const s = S.data.documents.filter(d => d.type !== 'map').sort((a, b) => yearOf(a.date).localeCompare(yearOf(b.date)));
  return `<div class="lede"><div class="eyebrow">Архів</div><h1>Документи</h1><p>Метричні книги Покровської церкви села Вороньки, записи ЗАГС і сімейні документи. Під кожним указано, яка саме строчка стосується нашої родини.</p></div>
  ${canEdit() && s.some(d => !d.pages) ? `<div class="docform" style="max-width:none"><b>Документи без сканів: ${s.filter(d => !d.pages).length}</b><span class="small muted">Виберіть файли, назви яких починаються з коду документа (напр. «fs1834-dvir240.jpg»), — сайт сам розкладе їх по документах.</span><label class="btn line small" style="cursor:pointer;justify-self:start">Вибрати скани<input type="file" accept="image/*" multiple data-docbulk="1" hidden></label><div class="msg" id="dmsg"></div></div>` : ''}
  <div class="docs">${s.filter(d => !d.maybe).map(docCard).join('')}</div>
  ${s.some(d => d.maybe) ? `<h2 class="dbl" style="margin:40px 0 18px">Можлива рідня</h2><div class="docs">${s.filter(d => d.maybe).map(docCard).join('')}</div>` : ''}`;
}
/* ───── Перегляд фото й сканів ─────
   Клік по мініатюрі — відкрито; клік по фото чи темному тлу — закрито (✕ і Esc теж).
   Збільшити: подвійний клік / подвійний дотик, кнопка 🔍, колесо, два пальці; збільшене тягнеться пальцем чи мишею.
   Кілька сторінок: стрілки ‹ ›, клавіші ← →, свайп убік. Свайп униз — закрити. */
// Якщо сторінку на телефоні випадково збільшили (щипком чи подвійним дотиком) — повертаємо звичайний масштаб,
// інакше у переглядачі фото кнопки «⋯» і «✕» опиняються за краєм екрана
function unzoomPage() { const vv = window.visualViewport; if (!vv || vv.scale <= 1.01) return; const m = document.querySelector('meta[name=viewport]'); if (!m) return; const c = m.content; m.content = c.replace(/,?\s*maximum-scale=[\d.]+/, '') + ',maximum-scale=1.0001'; setTimeout(() => { m.content = c; }, 60); }
const pvPeople = ids => ids.filter(x => P[x]).map(x => `<a href="${href('p', x)}" data-pv="go">${ph(P[x])}<span>${esc(short(P[x]))}</span></a>`).join('');
// [[p:id|Ім'я]] / [[d:id|текст]] у підписі скану → посилання (у вікні перегляду: закрити вікно й перейти)
const pvLinks = t => esc(t).replace(/\[\[([pd]):([a-z0-9_-]+)\|([^\]]+)\]\]/gi, (m, k, id, label) => k === 'p' ? (P[id] ? `<a href="${href('p', id)}" data-pv="go">${label}</a>` : label) : (S.data.documents.some(d => d.id === id) ? `<a href="#" class="doclink" data-doc="${id}">${label}</a>` : label));
function viewer({ title, pages, thumbs, line, text, src, people, photoId, docId, marks, items, startAt }) {
  const canPhoto = !!(items ? items.some(x => x.photoId) : photoId); let i = startAt || 0, sc = 1, tx = 0, ty = 0, mk = (marks || []).slice(), draw = null, cut = null, vOrig = false;
  const L = $('#layer');
  document.body.classList.add('noscroll'); unzoomPage();
  const who_ = (people || []).filter(x => P[x]);
  L.innerHTML = `<div class="pv" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="pv-top"><div class="pv-t"><b>${esc(title)}</b>${pages.length > 1 ? `<span class="mono pv-n"></span>` : ''}</div>
      ${pages.length ? `<button class="pv-ic" data-pv="dl" title="Завантажити скан (з рамкою «наш запис»)" aria-label="Завантажити">${ICO.dl}</button>` : ''}
      <button class="pv-ic" data-pv="zoom" title="Збільшити (або двічі клацніть по фото)" aria-label="Збільшити">${ICO.zoom}</button>
      ${canPhoto || (docId && canEdit()) ? `<button class="pv-ic" data-pv="more" title="Ще" aria-label="Ще дії">${ICO.more}</button>` : ''}
      <button class="pv-ic" data-pv="close" title="Закрити (Esc)" aria-label="Закрити">${ICO.x}</button></div>
    <div class="pv-menu" hidden>
      ${docId && canEdit() ? `<label class="pv-mi">+ Додати сторінку<input type="file" accept="image/*" multiple data-docpage="${docId}" hidden></label><button class="pv-mi" data-pv="mkdraw">Обвести наш запис рамкою</button><button class="pv-mi" data-pv="mkclear">Прибрати рамки з цієї сторінки</button>` : ''}
      ${docId && isOwner() ? `<button class="pv-mi danger" data-pv="docdel">Видалити документ з сайту</button>` : ''}
      ${canPhoto && canEdit() ? `<button class="pv-mi" data-portrait="${photoId || ''}">Зробити головним фото</button><button class="pv-mi" data-phask="${photoId || ''}">${(CFG_().photoAsk || {})[photoId] ? 'Прибрати з «Хто на фото?»' : '«Хто на фото?» — попросити родичів упізнати'}</button>` : ''}
      ${photoId && canEdit() ? `<a class="pv-mi" data-pvdl href="${img('photo=' + photoId)}${verOf(photoId)?.orig ? '&v=orig' : ''}&dl=1" download>⬇ Завантажити оригінал</a>` : ''}
      ${canPhoto && canEdit() ? `<label class="pv-mi pv-ed">🖼 Замінити на оброблену версію<input type="file" accept="image/jpeg,image/png,image/webp" data-pvrep hidden></label><button class="pv-mi pv-ed" data-pv="rotl">⟲ Повернути ліворуч</button><button class="pv-mi pv-ed" data-pv="rotr">⟳ Повернути праворуч</button><button class="pv-mi pv-ed" data-pv="crop">✂ Обрізати</button><button class="pv-mi pv-ed" data-pv="split">Розрізати на окремі фото</button>` : ''}
      ${canPhoto ? `<button class="pv-mi" data-pv="who">👥 Хто на фото — позначити людей</button><button class="pv-mi" data-pv="cap">Змінити підпис</button>${isOwner() ? `<button class="pv-mi danger" data-delphoto="${photoId || ''}">Видалити фото</button>` : ''}` : ''}
    </div>
    <div class="pv-stage">${pages.length ? `<img class="pv-img" alt="${esc(title)}" draggable="false"><div class="pv-marks" aria-hidden="true"></div><div class="pv-hint" hidden>Проведіть по скану, щоб обвести запис. <button data-pv="mkcancel">Скасувати</button></div><div class="pv-cut" hidden></div>` : '<p class="pv-empty">Скан ще не додано.</p>'}
      ${pages.length > 1 ? `<button class="pv-nav prev" data-pv="prev" aria-label="Попередня">${ICO.l}</button><button class="pv-nav next" data-pv="next" aria-label="Наступна">${ICO.r}</button>` : ''}
      <div class="pv-load"></div></div>
    <div class="pv-cap">
      ${pages.length > 1 && !items ? `<div class="pv-pgs" role="tablist" aria-label="Сторінки">${pages.map((_, k) => `<button type="button" class="pv-pg" data-pv="pg" data-k="${k}" aria-label="Сторінка ${k + 1}">${thumbs?.[k] ? `<img src="${thumbs[k]}" alt="" loading="lazy">` : ''}<span>${k + 1}</span></button>`).join('')}</div>` : ''}
      <button class="pv-find" data-pv="tomark" hidden>⌕ Показати наш запис</button>
      ${line || text ? glossify((line ? `<div class="pv-line">${pvLinks(line)}</div>` : '') + (text ? `<div class="pv-text">${pvLinks(text)}</div>` : '')) : ''}${src ? `<div class="pv-src">${pvLinks(src)}</div>` : ''}${line || text || src ? `<button class="pv-copy" data-pv="copy" type="button">⧉ Скопіювати текст</button>` : ''}
      <div class="pv-verl" hidden></div>
      <div class="pv-people">${pvPeople(who_)}</div>${canPhoto ? `<button class="pv-who" data-pv="who"${photoId || items ? '' : ' hidden'}>👥 Хто на фото? — позначити людей</button>` : ''}
      ${canPhoto ? `<div class="pv-capedit" hidden><input class="in" id="cap-in" value="${esc(title === short(P[people?.[0]] || {}) ? '' : title)}" placeholder="Хто на фото, рік, звідки"><button class="btn small" data-pv="capsave">Зберегти</button></div>` : ''}
    </div></div>`;
  const root = L.querySelector('.pv'), stage = root.querySelector('.pv-stage'), im = root.querySelector('.pv-img'), menu = root.querySelector('.pv-menu'), mkEl = root.querySelector('.pv-marks');
  const setT = (tr, anim) => { for (const el of [im, mkEl]) { if (!el) continue; el.style.transition = anim ? 'transform .22s ease' : 'none'; el.style.transform = tr; } };
  // Рамки «наш запис»: шар точно над зображенням, з тим самим масштабом і зсувом
  const pageMarks = () => mk.filter(m => (m.p || 0) === i);
  const placeMarks = () => { if (!im || !mkEl) return; Object.assign(mkEl.style, { left: im.offsetLeft + 'px', top: im.offsetTop + 'px', width: im.offsetWidth + 'px', height: im.offsetHeight + 'px' });
    mkEl.innerHTML = pageMarks().map(m => `<div class="pv-mark" style="left:${m.x * 100}%;top:${m.y * 100}%;width:${m.w * 100}%;height:${m.h * 100}%"></div>`).join('') + (draw?.box ? `<div class="pv-mark draft" style="left:${draw.box.x * 100}%;top:${draw.box.y * 100}%;width:${draw.box.w * 100}%;height:${draw.box.h * 100}%"></div>` : '')
      + (cut ? [...(cut.mode === 'crop' && cut.box ? [] : cut.boxes), ...(cut.box ? [cut.box] : [])].map((m, k) => `<div class="pv-mark draft cut${cut.mode === 'crop' ? ' dim' : ''}" style="left:${m.x * 100}%;top:${m.y * 100}%;width:${m.w * 100}%;height:${m.h * 100}%">${cut.mode === 'split' ? `<span>${k + 1}</span>` : ''}</div>`).join('') : '');
    const fb = root.querySelector('.pv-find'); if (fb) fb.hidden = !pageMarks().length; };
  const toMark = () => { const m = pageMarks()[0]; if (!m || !im) return; const W = im.offsetWidth, H = im.offsetHeight, r = stage.getBoundingClientRect();
    sc = Math.min(6, Math.max(1.6, Math.min(r.width * 0.9 / (m.w * W), r.height * 0.6 / (m.h * H)))); tx = -((m.x + m.w / 2) - 0.5) * W * sc; ty = -((m.y + m.h / 2) - 0.5) * H * sc; clamp(); apply(true); };
  const saveMarks = async () => { try { const r = await api('/api/data', { body: { op: 'doc.marks', id: docId, marks: mk } }); mk = r.marks; const d = S.data.documents.find(x => x.id === docId); if (d) d.marks = mk; placeMarks(); toast(mk.length ? 'Рамку збережено' : 'Рамки прибрано'); } catch (err) { toast(errText(err)); } };
  const apply = (anim) => { if (!im) return; setT(`translate(${tx}px,${ty}px) scale(${sc})`, anim); root.classList.toggle('zoomed', sc > 1.01); const zb = root.querySelector('[data-pv=zoom]'); zb.innerHTML = sc > 1.01 ? ICO.unzoom : ICO.zoom; zb.title = sc > 1.01 ? 'Зменшити' : 'Збільшити (або двічі клацніть по фото)'; };
  const clamp = () => { if (!im) return; const r = stage.getBoundingClientRect(), w = im.offsetWidth * sc, h = im.offsetHeight * sc; const mx = Math.max(0, (w - r.width) / 2), my = Math.max(0, (h - r.height) / 2); tx = Math.min(mx, Math.max(-mx, tx)); ty = Math.min(my, Math.max(-my, ty)); };
  const zoomTo = (ns, cx, cy, anim = true) => { // cx, cy — точка відносно центру сцени, яка лишається під пальцем
    ns = Math.min(6, Math.max(1, ns)); const k = ns / sc; tx = cx - (cx - tx) * k; ty = cy - (cy - ty) * k; sc = ns; if (sc <= 1.01) { sc = 1; tx = ty = 0; } clamp(); apply(anim);
  };
  const rel = (x, y) => { const r = stage.getBoundingClientRect(); return [x - r.left - r.width / 2, y - r.top - r.height / 2]; };
  // Версії фото: рядок «оброблено: хто, коли» + перемикач «Оригінал / Оброблене»; «вирізано з фото від …»
  const curId = () => items ? (items[i]?.id || null) : photoId;
  const verLine = () => { const el = root.querySelector('.pv-verl'); if (!el) return; const id = curId(), v = verOf(id); el.hidden = !v; if (!v) { el.innerHTML = ''; return; }
    const src = v.from ? S.data.photos.find(y => y.id === v.from) : null;
    el.innerHTML = [v.from ? `вирізано з фото${src ? ' від ' + esc(dayOf(src.at)) : ''}` : '', v.orig ? `оброблено: ${esc(who(v.by))}, ${esc(dayOf(v.at))} <button type="button" class="pv-vt" data-pv="vorig" aria-pressed="${vOrig}">${vOrig ? 'Показати оброблене' : 'Показати оригінал'}</button>` : ''].filter(Boolean).join(' · ');
    if (vOrig && v.orig) el.insertAdjacentHTML('afterbegin', '<b>Оригінал.</b> '); };
  const cutBar = () => { const el = root.querySelector('.pv-cut'); if (!el) return; el.hidden = !cut; if (!cut) return; const n = cut.boxes.length;
    el.innerHTML = cut.mode === 'crop' ? `<span>${n ? 'Можна обвести інакше — рамка заміниться.' : 'Обведіть рамкою частину, яку треба залишити.'}</span><span class="pv-cutb">${n ? '<button class="ok" data-pv="cutsave">Зберегти обрізане</button>' : ''}<button data-pv="cutcancel">Скасувати</button></span>`
      : `<span>${n ? `Обведено: ${n}. Обведіть ще або створіть фото.` : 'Обведіть рамкою кожне фото, яке треба зробити окремим.'}</span><span class="pv-cutb">${n ? `<button class="ok" data-pv="cutsave">Створити ${n} фото</button><button data-pv="cutundo">Прибрати останню</button>` : ''}<button data-pv="cutcancel">Скасувати</button></span>`; };
  const cutEnd = () => { cut = null; root.classList.remove('drawing'); cutBar(); placeMarks(); };
  const busy = (on, t) => { root.classList.toggle('loading', on); root.querySelectorAll('.pv-cut button,[data-pv=more]').forEach(b => { b.disabled = on; }); if (t) toast(t); };
  // після заміни — оновлюємо дані й відкриваємо те саме фото знову (з новою адресою)
  const reopen = async (id, msg) => { close(); await load(); S.ui.keepScroll = true; render(); openPhoto(id, S.ui.phCtx); if (msg) toast(msg); };
  const doReplace = async (id, blob, msg) => { busy(true, 'Зберігаю…'); try { await photoReplace(id, blob); await reopen(id, msg); } catch (err) { busy(false); toast(errText(err)); } };
  root.querySelector('[data-pvrep]')?.addEventListener('change', async e => { const f = e.target.files?.[0]; e.target.value = ''; menu.hidden = true; const id = photoId; if (!f || !id) return; doReplace(id, f, 'Оброблену версію збережено. Оригінал лишився — «Показати оригінал».'); });
  const show = () => {
    if (!im) return; sc = 1; tx = ty = 0; apply(false);
    root.classList.add('loading'); im.onload = () => root.classList.remove('loading'); im.onerror = () => root.classList.remove('loading');
    im.onload = () => { root.classList.remove('loading'); placeMarks(); }; placeMarks();
    if (items) { const it = items[i] || {}; photoId = it.photoId || null; title = it.title || ''; root.querySelector('.pv-t b').textContent = title; const tEl = root.querySelector('.pv-text'); if (tEl) tEl.textContent = it.text || '';
      root.querySelectorAll('.pv-ed').forEach(b => { b.hidden = !photoId; }); { const dl = root.querySelector('[data-pvdl]'); if (dl) { dl.hidden = !photoId; if (photoId) dl.href = img('photo=' + photoId) + (verOf(photoId)?.orig ? '&v=orig' : '') + '&dl=1'; } }
      root.querySelectorAll('[data-portrait],[data-delphoto]').forEach(b => { if ('portrait' in b.dataset) b.dataset.portrait = photoId || ''; else b.dataset.delphoto = photoId || ''; b.hidden = !photoId; }); root.querySelectorAll('[data-phask]').forEach(b => { b.dataset.phask = photoId || ''; b.hidden = !photoId; b.textContent = (CFG_().photoAsk || {})[photoId] ? 'Прибрати з «Хто на фото?»' : '«Хто на фото?» — попросити родичів упізнати'; }); root.querySelectorAll('[data-pv=cap],[data-pv=who]').forEach(b => { b.hidden = !photoId; }); const pp_ = root.querySelector('.pv-people'); if (pp_ && it.people) pp_.innerHTML = pvPeople(it.people);
      const ci = root.querySelector('#cap-in'); if (ci) ci.value = it.caption || ''; const ce = root.querySelector('.pv-capedit'); if (ce) ce.hidden = true; }
    vOrig = false; verLine();
    im.src = pages[i]; const n = root.querySelector('.pv-n'); if (n) n.textContent = `сторінка ${i + 1} з ${pages.length}`;
    root.querySelectorAll('.pv-pg').forEach(b => b.classList.toggle('on', +b.dataset.k === i));
    if (pages.length > 1) { new Image().src = pages[(i + 1) % pages.length]; new Image().src = pages[(i - 1 + pages.length) % pages.length]; } // сусідні вантажаться заздалегідь
  };
  let sliding = false; // плавне гортання: поточне фото від'їжджає вбік, нове заїжджає з іншого боку
  const go = (d, fromDx = 0) => {
    if (pages.length < 2 || sliding) return;
    i = (i + d + pages.length) % pages.length;
    if (!im || matchMedia('(prefers-reduced-motion: reduce)').matches) { show(); return; }
    sliding = true; const W = stage.getBoundingClientRect().width || innerWidth;
    const els = [im, mkEl].filter(Boolean), ease = 'transform .26s cubic-bezier(.2,.7,.3,1), opacity .26s';
    els.forEach(el => { el.style.transition = ease; el.style.transform = `translateX(${-d * W * 0.6}px)`; el.style.opacity = '0'; });
    setTimeout(() => {
      const pre = new Image(); pre.src = pages[i];
      const enter = () => { show(); els.forEach(el => { el.style.transition = 'none'; el.style.transform = `translateX(${d * W * 0.6}px)`; el.style.opacity = '0'; });
        requestAnimationFrame(() => requestAnimationFrame(() => { els.forEach(el => { el.style.transition = ease; el.style.transform = 'translateX(0)'; el.style.opacity = '1'; }); setTimeout(() => { sliding = false; els.forEach(el => { el.style.transition = 'none'; }); }, 280); })); };
      if (pre.complete) enter(); else { let done = false; const f = () => { if (!done) { done = true; enter(); } }; pre.onload = f; pre.onerror = f; setTimeout(f, 400); }
    }, 200);
  };
  const onRs = () => placeMarks(); window.addEventListener('resize', onRs);
  const close = () => { document.body.classList.remove('noscroll'); document.removeEventListener('keydown', key, true); window.removeEventListener('resize', onRs); closeLayer(); };
  const key = e => { if (!L.contains(root)) { document.removeEventListener('keydown', key, true); return; } if (e.target.tagName === 'INPUT') return; if (e.key === 'Escape' && cut) { e.stopPropagation(); cutEnd(); return; } if (e.key === 'Escape') { e.stopPropagation(); close(); } if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); if (e.key === '+' || e.key === '=') zoomTo(sc * 1.5, 0, 0); if (e.key === '-') zoomTo(sc / 1.5, 0, 0); };
  document.addEventListener('keydown', key, true);

  // Кнопки
  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-pv]'); if (!b) { if (!menu.hidden && !e.target.closest('.pv-menu')) menu.hidden = true; return; }
    const a = b.dataset.pv; e.stopPropagation();
    if (a === 'close') return close();
    if (a === 'go') { e.preventDefault(); const h = b.getAttribute('href'); close(); location.hash = h; return; }
    if (a === 'pg') { const k = +b.dataset.k; if (k !== i) go(k - i); return; }
    if (a === 'prev') return go(-1);
    if (a === 'next') return go(1);
    if (a === 'zoom') return sc > 1.01 ? zoomTo(1, 0, 0) : (pageMarks().length ? toMark() : zoomTo(2.5, 0, 0));
    if (a === 'tomark') return toMark();
    if (a === 'copy') { const t_ = [line, text, src].filter(Boolean).map(plainLinks).join('\n\n'); try { await navigator.clipboard.writeText(t_); toast('Текст скопійовано'); } catch { const r = document.createRange(); r.selectNodeContents(root.querySelector('.pv-cap')); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast('Текст виділено — скопіюйте (⌘C)'); } return; }
    if (a === 'dl') { if (!im) return; b.disabled = true; toast('Готую файл…');
      try { const u = im.currentSrc || im.src; const r = await fetch(u, { credentials: 'same-origin' }); if (!r.ok) throw new Error('http_' + r.status); const bm = await createImageBitmap(await r.blob());
        const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const g = c.getContext('2d'); g.drawImage(bm, 0, 0); const W = bm.width, H = bm.height; bm.close?.();
        const lw = Math.max(3, Math.round(Math.max(W, H) / 450)), off = lw * 2; g.strokeStyle = '#E8361E'; g.lineWidth = lw; g.lineJoin = 'round';
        for (const m of vOrig ? [] : pageMarks()) { const x = m.x * W - off, y = m.y * H - off, w = m.w * W + off * 2, h = m.h * H + off * 2, rr = Math.min(off * 2, w / 4, h / 4); g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, rr) : g.rect(x, y, w, h); g.stroke(); }
        const bl = await canvasJpeg(c, 0.92); const name = (String(title || 'скан').replace(/[\\/:*?"<>|«»]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 90) || 'скан') + (pages.length > 1 ? ` — с. ${i + 1}` : '') + '.jpg';
        const href_ = URL.createObjectURL(bl), aEl = document.createElement('a'); aEl.href = href_; aEl.download = name; document.body.appendChild(aEl); aEl.click(); aEl.remove(); setTimeout(() => URL.revokeObjectURL(href_), 4000);
        ev('open', 'doc', 'download:' + (docId ? 'doc:' + docId : photoId ? 'photo:' + photoId : '')); }
      catch (err) { toast(errText(err)); } b.disabled = false; return; }
    if (a === 'docdel') { if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Точно видалити? Натисніть ще раз'; return; } await api('/api/data', { body: { op: 'doc.delete', id: docId } }); close(); await load(); render(); toast('Документ прибрано з сайту'); return; }
    if (a === 'mkdraw') { menu.hidden = true; zoomTo(1, 0, 0, false); draw = { box: null }; root.classList.add('drawing'); root.querySelector('.pv-hint').hidden = false; return; }
    if (a === 'mkcancel') { draw = null; root.classList.remove('drawing'); root.querySelector('.pv-hint').hidden = true; placeMarks(); return; }
    if (a === 'mkclear') { menu.hidden = true; mk = mk.filter(m => (m.p || 0) !== i); return saveMarks(); }
    if (a === 'more') { menu.hidden = !menu.hidden; return; }
    if (a === 'vorig') { const id = curId(); if (!id || !im) return; vOrig = !vOrig; im.src = vOrig ? img('photo=' + id + '&v=orig') : pages[i]; verLine(); return; }
    if (a === 'rotl' || a === 'rotr') { menu.hidden = true; const id = photoId; if (!id) return; busy(true, 'Повертаю…'); try { const bm = await photoBitmap(id); const c = document.createElement('canvas'); c.width = bm.height; c.height = bm.width; const g = c.getContext('2d'); g.translate(c.width / 2, c.height / 2); g.rotate((a === 'rotr' ? 1 : -1) * Math.PI / 2); g.drawImage(bm, -bm.width / 2, -bm.height / 2); bm.close?.(); await doReplace(id, await canvasJpeg(c), 'Фото повернуто. Оригінал лишився.'); } catch (err) { busy(false); toast(errText(err)); } return; }
    if (a === 'crop' || a === 'split') { menu.hidden = true; if (!photoId || !im) return; if (vOrig) { vOrig = false; im.src = pages[i]; verLine(); } zoomTo(1, 0, 0, false); cut = { mode: a, boxes: [], box: null, a: null }; root.classList.add('drawing'); cutBar(); placeMarks(); return; }
    if (a === 'cutcancel') return cutEnd();
    if (a === 'cutundo') { if (cut) { cut.boxes.pop(); cutBar(); placeMarks(); } return; }
    if (a === 'cutsave') { if (!cut?.boxes.length || !photoId) return; const id = photoId, mode = cut.mode, boxes = cut.boxes.slice(); busy(true, mode === 'crop' ? 'Обрізаю…' : 'Створюю фото…');
      try { const bm = await photoBitmap(id);
        if (mode === 'crop') { await doReplace(id, await canvasJpeg(cropCanvas(bm, boxes[0])), 'Фото обрізано. Оригінал лишився.'); bm.close?.(); return; }
        const src = S.data.photos.find(y => y.id === id), ids = [];
        for (const b of boxes) { const blob = await canvasJpeg(cropCanvas(bm, b)); const full = await bestPhoto(blob); const r = await api(`/api/upload?splitFrom=${encodeURIComponent(id)}`, { raw: full }); await api(`/api/upload?kind=thumb&photo=${encodeURIComponent(r.id)}`, { raw: await toJpeg(blob, 420, 0.78) }).catch(() => {}); ids.push(r.id); }
        bm.close?.(); cut = null; close(); await load(); S.ui.keepScroll = true; render(); toast(`Створено фото: ${ids.length}. Автор — той, хто додав початкове фото.`);
        photoTag(ids, 0, src?.person || null, { title: 'Що на цій частині?' });
      } catch (err) { busy(false); toast(errText(err)); } return; }
    if (a === 'who') { const id = photoId; if (!id) return; const x = S.data.photos.find(y => y.id === id); close(); photoTag([id], 0, P[x?.person] ? x.person : null, { reopen: true }); return; }
    if (a === 'cap') { menu.hidden = true; const c = root.querySelector('.pv-capedit'); c.hidden = false; c.querySelector('input').focus(); return; }
    if (a === 'capsave') { try { const v = $('#cap-in').value; await api('/api/data', { body: { op: 'photo.caption', id: photoId, caption: v } }); const x = S.data.photos.find(y => y.id === photoId); if (x) x.caption = v; if (items?.[i]) items[i].caption = v; root.querySelector('.pv-t b').textContent = v || title; root.querySelector('.pv-capedit').hidden = true; toast('Підпис збережено'); } catch (err) { toast(errText(err)); } }
  });

  // Жести: один дотик/клік — закрити (якщо не збільшено), подвійний — збільшити, тягнути — пан/свайп, два пальці — масштаб
  if (!pages.length) { stage.addEventListener('click', e => { if (e.target === stage) close(); }); return; }
  const pts = new Map(); let start = null, moved = false, pinch = null;
  const frac = e => { const r = im.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]; };
  stage.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    if (draw) { e.preventDefault(); stage.setPointerCapture?.(e.pointerId); draw.a = frac(e); draw.box = null; return; }
    if (cut) { if (e.target.closest('.pv-cut')) return; e.preventDefault(); stage.setPointerCapture?.(e.pointerId); cut.a = frac(e); cut.box = null; return; }
    pts.set(e.pointerId, [e.clientX, e.clientY]); stage.setPointerCapture?.(e.pointerId);
    if (pts.size === 1) { start = { x: e.clientX, y: e.clientY, tx, ty, t: Date.now() }; moved = false; }
    if (pts.size === 2) { const [[x1, y1], [x2, y2]] = [...pts.values()]; pinch = { d: Math.hypot(x2 - x1, y2 - y1), sc, c: rel((x1 + x2) / 2, (y1 + y2) / 2), tx, ty }; moved = true; }
  });
  stage.addEventListener('pointermove', e => {
    if (draw) { if (!draw.a) return; const [x, y] = frac(e), [x0, y0] = draw.a; draw.box = { x: Math.min(x, x0), y: Math.min(y, y0), w: Math.abs(x - x0), h: Math.abs(y - y0) }; placeMarks(); return; }
    if (cut) { if (!cut.a) return; const [x, y] = frac(e), [x0, y0] = cut.a; cut.box = { x: Math.min(x, x0), y: Math.min(y, y0), w: Math.abs(x - x0), h: Math.abs(y - y0) }; placeMarks(); return; }
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && pts.size >= 2) { const [[x1, y1], [x2, y2]] = [...pts.values()]; const ns = Math.min(6, Math.max(1, pinch.sc * Math.hypot(x2 - x1, y2 - y1) / pinch.d)); const k = ns / pinch.sc; const c = rel((x1 + x2) / 2, (y1 + y2) / 2); tx = c[0] - (pinch.c[0] - pinch.tx) * k; ty = c[1] - (pinch.c[1] - pinch.ty) * k; sc = ns; clamp(); apply(false); return; }
    if (!start) return; const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!moved && Math.hypot(dx, dy) < 8) return; moved = true;
    if (sc > 1.01) { tx = start.tx + dx; ty = start.ty + dy; clamp(); apply(false); }
    else { setT(Math.abs(dy) > Math.abs(dx) ? `translateY(${Math.max(0, dy)}px)` : `translateX(${pages.length > 1 ? dx : dx / 4}px)`, false); root.style.backgroundColor = `rgba(14,12,10,${Math.abs(dy) > Math.abs(dx) ? Math.max(.35, 1 - Math.max(0, dy) / 500) : 1})`; }
  });
  const up = e => {
    if (cut) { if (!cut.a) return; const b = cut.box; cut.a = null; cut.box = null; if (b && b.w > 0.02 && b.h > 0.02) { if (cut.mode === 'crop') cut.boxes = [b]; else cut.boxes.push(b); } cutBar(); placeMarks(); return; }
    if (draw) { if (!draw.a) return; const b = draw.box; draw.a = null; if (b && b.w > 0.01 && b.h > 0.005) { mk.push({ p: i, ...b }); draw = null; root.classList.remove('drawing'); root.querySelector('.pv-hint').hidden = true; saveMarks(); } return; }
    if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId);
    if (pinch) { if (pts.size < 2) { pinch = null; if (sc <= 1.01) zoomTo(1, 0, 0); start = null; } return; }
    if (!start) return; const dx = e.clientX - start.x, dy = e.clientY - start.y, st = start; start = null;
    root.style.backgroundColor = '';
    if (moved) {
      if (sc > 1.01) return;
      if (dy > 110 && dy > Math.abs(dx)) return close();
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) && pages.length > 1) return go(dx < 0 ? 1 : -1);
      apply(true); return;
    }
    // дотик без руху: по скану — збільшити в цьому місці (вдруге — зменшити); по темному фону — закрити
    const ir = im?.getBoundingClientRect(), onImg = !!(ir && e.clientX >= ir.left && e.clientX <= ir.right && e.clientY >= ir.top && e.clientY <= ir.bottom), [cx, cy] = rel(e.clientX, e.clientY); // з захопленням вказівника ціль — сцена, тому перевіряємо координати
    if (!menu.hidden) { menu.hidden = true; return; }
    if (sc > 1.01) return zoomTo(1, 0, 0);
    if (onImg) return zoomTo(2.5, cx, cy);
    close();
  };
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', e => { pts.delete(e.pointerId); pinch = null; start = null; apply(true); });
  stage.addEventListener('wheel', e => { e.preventDefault(); const [cx, cy] = rel(e.clientX, e.clientY); zoomTo(sc * (e.deltaY < 0 ? 1.2 : 1 / 1.2), cx, cy, false); }, { passive: false });
  show();
}
const ICO = {
  dl: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 19h14"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  zoom: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M11 8v6M8 11h6"/></svg>',
  unzoom: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M8 11h6"/></svg>',
  more: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  l: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  r: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
};
function openDoc(id) { const d = S.data.documents.find(x => x.id === id); if (!d) return; ev('open', 'doc', 'doc:' + id); viewer({ title: d.title, marks: d.marks, pages: Array.from({ length: d.pages || 0 }, (_, k) => img(`doc=${d.id}&page=${k}`)), thumbs: Array.from({ length: d.pages || 0 }, (_, k) => img(`doc=${d.id}&page=${k}`, true)), line: d.line ? 'Наша строчка: ' + d.line : '', text: d.text, src: [d.src, d.place].filter(Boolean).join(' · '), people: d.people, docId: d.id }); }
/* Головне фото: виділити обличчя квадратною рамкою (кадр зберігається в картці як pc, саме фото не змінюється) */
function cropPortrait(photoId, pid) {
  const p = P[pid]; if (!p) return; const old = p.pc && p.pc.id === photoId ? p.pc : null;
  modal(`<h2>Головне фото: ${esc(short(p))}</h2><p class="muted small">Перетягніть рамку на обличчя ${esc(short(p))}. Розмір — повзунком або коліщатком миші.</p>
    <div class="crp" id="crp"><img src="${img('photo=' + photoId)}" alt="" draggable="false"><div class="crp-b" id="crp-b"></div></div>
    <label class="crp-z">Розмір рамки <input type="range" id="crp-z" min="5" max="100" value="40"></label>
    <div class="crp-pv">${['big', '', 'sm'].map(c => `<span class="av ${c}"><img src="${img('photo=' + photoId)}" alt=""></span>`).join('')}<span class="muted small">так виглядатиме</span></div>
    <div class="btns"><button class="btn" id="crp-ok">Зберегти</button><button class="btn line" id="crp-all">Все фото, без рамки</button><button class="btn line" data-act="close">Скасувати</button><span class="msg" id="crp-m"></span></div>`);
  const box = $('#crp'), im = box.querySelector('img'), b = $('#crp-b'), z = $('#crp-z');
  const c = { x: 0, y: 0, s: .4, r: 1 };
  const fit = () => { const W = im.clientWidth, H = im.clientHeight; if (!W || !H) return; c.s = Math.max(.05, Math.min(c.s, 1, H / W)); c.x = Math.max(0, Math.min(c.x, 1 - c.s)); c.y = Math.max(0, Math.min(c.y, 1 - c.s * c.r));
    b.style.cssText = `left:${c.x * W}px;top:${c.y * H}px;width:${c.s * W}px;height:${c.s * W}px`; z.value = Math.round(c.s / Math.min(1, H / W) * 100);
    $('#layer').querySelectorAll('.crp-pv .av img').forEach(e => { const st = pcStyle(c).match(/style="([^"]*)"/)[1]; e.className = 'pcrop'; e.setAttribute('style', st); }); };
  const init = () => { c.r = im.naturalHeight / im.naturalWidth || 1; if (old) Object.assign(c, { x: old.x, y: old.y, s: old.s }); else { c.s = Math.min(1, 1 / c.r) * .45; c.x = (1 - c.s) / 2; c.y = Math.max(0, (1 - c.s * c.r) / 2 - .12); } fit(); };
  if (im.complete && im.naturalWidth) init(); else im.onload = init;
  let drag = null;
  b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); drag = { px: e.clientX, py: e.clientY, x: c.x, y: c.y }; });
  b.addEventListener('pointermove', e => { if (!drag) return; c.x = drag.x + (e.clientX - drag.px) / im.clientWidth; c.y = drag.y + (e.clientY - drag.py) / im.clientHeight; fit(); });
  b.addEventListener('pointerup', () => { drag = null; }); b.addEventListener('pointercancel', () => { drag = null; });
  box.addEventListener('pointerdown', e => { if (e.target === b) return; const R = im.getBoundingClientRect(); c.x = (e.clientX - R.left) / R.width - c.s / 2; c.y = (e.clientY - R.top) / R.height - c.s * c.r / 2; fit(); });
  const resize = ns => { const cx = c.x + c.s / 2, cy = c.y + c.s * c.r / 2; c.s = ns; c.x = cx - c.s / 2; c.y = cy - c.s * c.r / 2; fit(); };
  z.addEventListener('input', () => resize(z.value / 100 * Math.min(1, 1 / c.r)));
  box.addEventListener('wheel', e => { e.preventDefault(); resize(c.s * (e.deltaY > 0 ? 1.08 : 1 / 1.08)); }, { passive: false });
  const save = async pc => { $('#crp-m').textContent = 'Зберігаю…'; try { const r = await api('/api/data', { body: { op: 'person.portrait', id: pid, photo: photoId, ...(pc ? { pc } : {}) } }); Object.keys(P[pid]).forEach(k => { if (k === 'pc') delete P[pid].pc; }); Object.assign(P[pid], r.person); closeLayer(); S.ui.keepScroll = true; render(); toast('Головне фото змінено'); } catch (er) { $('#crp-m').textContent = 'Не вдалося зберегти'; } };
  $('#crp-ok').onclick = () => save({ x: c.x, y: c.y, s: c.s, r: c.r });
  $('#crp-all').onclick = () => save(null);
}
function openPhoto(id, pctx) { const x = S.data.photos.find(y => y.id === id) || (S.admin?.pph || []).find(y => y.id === id); if (!x) return; if (isVoice(x)) { modal(`<h2>${esc(x.caption || 'Голосовий спогад')}</h2><div class="vlist">${voiceRow({ ...x, pending: false, by: S.data.photos.find(y => y.id === id)?.by || '' })}</div><div class="btns"><button class="btn line" data-act="close">Закрити</button></div>`); return; } if (x.mime === 'application/pdf') { window.open(img('photo=' + id), '_blank', 'noopener'); return; }
  const ctx = [pctx, S.view === 'p' ? S.arg : null].find(z => z && P[z] && photoOf(x, z)) || x.person; // фото саме цієї людини (власні + де її позначено)
  S.ui.phCtx = ctx;
  const list = S.data.photos.filter(y => photoOf(y, ctx) && y.mime !== 'application/pdf' && !isVoice(y)), k = Math.max(0, list.findIndex(y => y.id === id));
  const items = list.map(y => ({ id: y.id, photoId: (canEdit() || y.by === S.me.id) ? y.id : null, title: y.caption || short(P[y.person] || {}), caption: y.caption || '', people: [y.person, ...tagsOf(y.id)].filter(z => P[z]), text: `Додав(ла): ${who(y.by)}, ${when(y.at)}` }));
  viewer({ title: items[k].title, pages: list.map(y => img('photo=' + y.id)), text: items[k].text, people: [x.person, ...tagsOf(x.id)].filter(y => P[y]), photoId: items[k].photoId, items, startAt: k }); }

/* ───── Власнику: аналітика, доступи, історія ───── */
const fmtT = ms => { const m = Math.round((ms || 0) / 60000); return m < 60 ? `${m} хв` : `${Math.floor(m / 60)} год ${m % 60} хв`; };
const delta = (a, b) => { if (!b) return a ? '<em class="up">нове</em>' : '<em class="muted">—</em>'; const d = Math.round((a - b) / b * 100); return `<em class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${d}%</em>`; };
const PERIODS = [['7', '7 днів'], ['30', '30 днів'], ['90', '3 місяці'], ['365', 'Рік'], ['all', 'Весь час']];
function periodRange() { const a = S.admin; if (a.period === 'custom' && a.from) return { from: a.from, to: a.to || new Date().toISOString().slice(0, 10) }; const n = a.period === 'all' ? 3650 : Number(a.period || 30); const to = new Date(); const from = new Date(to - n * 864e5); return { from: from.toISOString(), to: new Date(to.getTime() + 60000).toISOString() }; }
async function loadAdmin() {
  const a = S.admin; a.tab ||= (S.data?.joinPending || S.data?.photoPending ? 'access' : 'stats'); a.period ||= '30';
  try {
    if (a.tab === 'stats') { const { from, to } = periodRange(); a.stats = await api(`/api/admin?a=stats&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`); if (a.member) a.log = await api(`/api/admin?a=log&id=${a.member}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`); }
    if (a.tab === 'access') { a.pph = (await api('/api/admin?a=photos_pending').catch(() => ({ photos: [] }))).photos; a.members = await api('/api/admin?a=members'); try { a.join = await api('/api/admin?a=join_link'); a.reqs = (await api('/api/admin?a=requests')).requests; a.joinErr = false; } catch { a.joinErr = true; } }
    if (a.tab === 'history') a.revs = await api('/api/admin?a=revisions');
    if (a.tab === 'backup') a.bk = true;
  } catch (e) { a.err = errText(e); }
  render();
}
function chartDaily(daily, from, to) {
  const days = []; const d0 = new Date(String(from).slice(0, 10)), d1 = new Date(String(to).slice(0, 10));
  for (let d = new Date(d0); d <= d1 && days.length < 400; d = new Date(d.getTime() + 864e5)) days.push(d.toISOString().slice(0, 10));
  const vals = days.map(d => Object.values(daily[d] || {}).reduce((s, x) => s + x, 0) / 60000);
  const max = Math.max(10, ...vals); const W = 900, H = 170, pad = 28, bw = (W - pad) / Math.max(1, days.length);
  const ticks = [0, max / 2, max].map(v => Math.round(v));
  return `<svg class="chart" viewBox="0 0 ${W} ${H + 18}" preserveAspectRatio="none" role="img" aria-label="Хвилини на сайті по днях">
    ${ticks.map(t => { const y = H - (t / max) * (H - 10); return `<line x1="${pad}" x2="${W}" y1="${y}" y2="${y}" stroke="var(--rule)" stroke-width="1"/><text x="0" y="${y + 3}">${t}</text>`; }).join('')}
    ${vals.map((v, i) => { const h = (v / max) * (H - 10); return `<rect x="${pad + i * bw + 1}" y="${H - h}" width="${Math.max(1, bw - 2)}" height="${h}" fill="var(--accent)"><title>${days[i]}: ${Math.round(v)} хв</title></rect>`; }).join('')}
    ${days.length ? `<text x="${pad}" y="${H + 14}">${days[0]}</text><text x="${W}" y="${H + 14}" text-anchor="end">${days[days.length - 1]}</text>` : ''}
  </svg>`;
}
function sortRows(rows, key) { const k = S.admin.sort || key; const dir = S.admin.dir || -1; return rows.sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * dir); }
function phPendBlock(list) {
  if (!list?.length) return '';
  const dupOf = x => x.size && list.find(y => y !== x && y.byId === x.byId && y.size === x.size && y.at < x.at);
  return `<div class="sec pendsec"><h3>Нові фото від родичів <span class="small muted" style="text-transform:none;letter-spacing:0">з'являться для всіх лише після вашого підтвердження</span></h3><div class="thumbs">${list.map(x => `<div class="phpend"><button class="doc" data-photo="${x.id}"><span class="im">${isVoice(x) ? '<span class="ph" style="width:100%;height:100%">🎙 голос</span>' : x.mime === 'application/pdf' ? '<span class="ph" style="width:100%;height:100%">PDF</span>' : `<img src="${img('photo=' + x.id, true)}" alt="" loading="lazy">`}</span><span><b>${P[x.person] ? esc(full(P[x.person])) : x.person === '_ask' ? '«Хто на фото?» — без картки' : String(x.person || '').startsWith('fam:') && FAM[x.person.slice(4)] ? esc(FAM[x.person.slice(4)].title) : ''}</b>${x.person === '_ask' ? '<br><small class="muted">Автор не знає, хто на фото, і просить родичів упізнати. Після «Показати всім» фото з\'явиться на Головній у «Хто на фото?»; людей можна позначити, відкривши фото → «⋯» → «Хто на фото».</small>' : ''}<br>${esc(x.caption || '') || '<i class="muted">без підпису</i>'}<br><small class="muted">додав(ла): ${esc(x.by)}, ${esc(when(x.at))}</small>${dupOf(x) ? '<br><b class="dupw">⚠ Схоже, повтор: той самий файл від цього ж автора вже є в черзі</b>' : ''}</span></button><div class="btns pend-b"><button class="btn small" data-act="ph-ok" data-id="${x.id}">✓ Показати всім</button><button class="btn line small" data-act="ph-done" data-id="${x.id}" title="Фото вже враховане: ви обробили його й додали самі. Прибрати з черги — без позначки «відхилено»">✓ Вирішено</button><button class="btn line small" data-act="ph-no" data-id="${x.id}">✕ Відхилити</button>${isVoice(x) ? '' : `<a class="btn line small" href="${img('photo=' + x.id)}${x.ver?.orig ? '&v=orig' : ''}&dl=1" download>⬇ Оригінал</a>`}${P[x.person] ? `<a class="btn line small" href="${href('p', x.person)}">Картка</a>` : ''}</div></div>`).join('')}</div></div>`;
}
function vAdmin() {
  if (!isOwner()) return '<p>Немає доступу.</p>';
  const a = S.admin;
  const tabs = `<div class="tabs2">${[['stats', 'Аналітика'], ['access', 'Доступи'], ['history', 'Історія змін'], ['backup', 'Резервна копія']].map(([k, t]) => `<button aria-pressed="${a.tab === k}" data-atab="${k}">${t}</button>`).join('')}</div>`;
  let body = '<p class="muted">Завантаження…</p>';
  if (a.err) body = `<p class="msg err">${esc(a.err)}</p>`;
  else if (a.tab === 'stats' && a.stats) {
    const st = a.stats; const sum = (o, k) => Object.values(o).reduce((s, x) => s + (x[k] || 0), 0);
    const names = Object.fromEntries(st.members.map(m => [m.id, m.name || 'Без імені']));
    const rows = sortRows(st.members.map(m => { const c = st.cur[m.id] || {}, p = st.prev[m.id] || {}; return { id: m.id, name: names[m.id], role: m.role, time: c.time || 0, ptime: p.time || 0, opens: c.opens || 0, days: c.days || 0, sessions: c.sessions || 0, edits: c.edits || 0, last: c.last || '' }; }), 'time');
    const active = Object.values(st.cur).filter(x => x.time || x.opens).length, pactive = Object.values(st.prev).filter(x => x.time || x.opens).length;
    const viewsName = { tree: 'Дерево', p: 'Картки людей', person: 'Картки людей', families: 'Родини', fam: 'Родини', people: 'Покажчик', docs: 'Документи', maps: 'Старі карти', villages: 'Історія сіл', q: 'Запитання', admin: 'Панель власника' };
    const views = {}; Object.entries(st.views || {}).forEach(([k, v]) => { if (k === 'admin') return; const n = viewsName[k] || k; views[n] = (views[n] || 0) + v; });
    body = `<div class="bar1"><div class="seg">${PERIODS.map(([k, t]) => `<button aria-pressed="${a.period === k}" data-per="${k}">${t}</button>`).join('')}<button aria-pressed="${a.period === 'custom'}" data-per="custom">Свій</button></div>
      ${a.period === 'custom' ? `<input type="date" class="in" id="pf" value="${esc((a.from || '').slice(0, 10))}" style="width:auto"><input type="date" class="in" id="pt" value="${esc((a.to || '').slice(0, 10))}" style="width:auto"><button class="btn line small" data-act="per-apply">Показати</button>` : ''}
      <span class="small muted">порівняння з попереднім таким самим періодом</span></div>
      <div class="kpis">
        <div class="kpi"><span>Активних родичів</span><b>${active}</b>${delta(active, pactive)}</div>
        <div class="kpi"><span>Час на сайті</span><b>${fmtT(sum(st.cur, 'time'))}</b>${delta(sum(st.cur, 'time'), sum(st.prev, 'time'))}</div>
        <div class="kpi"><span>Відкрито карток і документів</span><b>${sum(st.cur, 'opens')}</b>${delta(sum(st.cur, 'opens'), sum(st.prev, 'opens'))}</div>
        <div class="kpi"><span>Внесено змін</span><b>${sum(st.cur, 'edits')}</b>${delta(sum(st.cur, 'edits'), sum(st.prev, 'edits'))}</div>
      </div>
      <div class="sec"><h3>Хвилини на сайті по днях</h3>${chartDaily(st.daily, st.from, st.to)}</div>
      <div class="sec" style="margin-top:26px"><h3>Родичі <span class="small muted" style="text-transform:none;letter-spacing:0">натисніть рядок — повний журнал</span></h3><div class="tablebox"><table class="t"><thead><tr>
        <th data-k="name">Хто</th><th data-k="time">Час</th><th data-k="ptime">Попередній період</th><th data-k="opens">Відкрив</th><th data-k="days">Днів</th><th data-k="sessions">Сеансів</th><th data-k="edits">Змін</th><th data-k="last">Востаннє</th></tr></thead><tbody>
        ${rows.map(r => `<tr class="click" data-member="${r.id}"${a.member === r.id ? ' style="background:var(--sheet)"' : ''}><td><b>${esc(r.name)}</b> <span class="badge role">${r.role === 'owner' ? 'власник' : r.role === 'editor' ? 'редактор' : 'глядач'}</span></td><td class="num">${fmtT(r.time)}</td><td class="num muted">${fmtT(r.ptime)}</td><td class="num">${r.opens}</td><td class="num">${r.days}</td><td class="num">${r.sessions}</td><td class="num">${r.edits}</td><td class="num small">${esc(when(r.last))}</td></tr>`).join('')}
      </tbody></table></div></div>
      ${a.member && a.log ? memberLog(names[a.member], a.log) : ''}
      <div class="grid2" style="margin-top:26px;align-items:start;gap:30px">
        <div class="sec"><h3>Що дивилися найбільше</h3><div class="tablebox"><table class="t"><thead><tr><th>Картка / документ</th><th>Відкриттів</th><th>Час</th><th>Людей</th></tr></thead><tbody>${st.top.map(t => `<tr><td>${t.key.startsWith('person:') ? `<a href="${href('p', t.key.slice(7))}">${esc(t.label)}</a>` : esc(t.label)}</td><td class="num">${t.opens}</td><td class="num">${fmtT(t.time)}</td><td class="num">${t.people}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Ще немає даних.</td></tr>'}</tbody></table></div></div>
        <div class="sec"><h3>Час за розділами</h3><div class="tablebox"><table class="t"><tbody>${Object.entries(views).sort((x, y) => y[1] - x[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${fmtT(v)}</td></tr>`).join('') || '<tr><td class="muted">Ще немає даних.</td></tr>'}</tbody></table></div></div>
      </div>`;
  } else if (a.tab === 'access' && a.members) {
    const m = a.members;
    body = phPendBlock(a.pph) + joinBlock() + `<div class="sec" style="margin-top:26px"><h3>Запросити родича особисто</h3>
      <div class="grid2"><label class="f">Ім'я<input class="in" id="iv-name" placeholder="напр. Тетяна Іванівна"></label><label class="f" title="Якщо пошти немає — придумайте короткий логін, можна українськими літерами, напр. василь">Пошта або логін<input class="in" id="iv-email" type="text" inputmode="email" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="пошта або логін, напр. василь"></label>
      <label class="f">Права<select class="in" id="iv-role"><option value="editor">Редактор — додає й змінює картки</option><option value="viewer">Глядач — лише дивиться і пише спогади</option></select></label>
      <label class="f">Хто це в дереві<select class="in" id="iv-person"><option value="">—</option>${Object.values(P).sort((x, y) => short(x).localeCompare(short(y), 'uk')).map(x => `<option value="${x.id}">${esc(full(x))}</option>`).join('')}</select></label></div>
      <label class="f" title="Якщо заповнити — акаунт створиться одразу, без посилання; логін і пароль передасте людині самі">Пароль (необов'язково — якщо хочете створити акаунт одразу)<div class="btns" style="flex-wrap:nowrap"><input class="in mono" id="iv-pw" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="від 8 символів"><button type="button" class="btn line small" data-act="iv-gen">Придумати</button></div></label>
      <div class="btns"><button class="btn" data-act="invite">Створити запрошення</button><button class="btn line" data-act="create-acc">Створити акаунт одразу</button><span class="msg" id="ivmsg"></span></div>
      <div id="ivlink"></div>
      <p class="small muted">Посилання одноразове і діє 7 днів. Надішліть його особисто (Viber, Telegram). Родич відкриває його, вигадує пароль і далі входить з поштою та паролем.</p></div>
      <div class="sec" style="margin-top:26px"><h3>Учасники</h3><div class="tablebox"><table class="t"><thead><tr><th>Хто</th><th>Права</th><th>Пристроїв</th><th>Востаннє</th><th></th></tr></thead><tbody>
      ${m.members.map(x => `<tr><td class="mcell">${x.id === S.me.id ? '' : `<button class="medit" data-act="medit" data-id="${x.id}" title="Редагувати: ім'я, логін, пароль" aria-label="Редагувати">✎</button>`}<b>${esc(x.name || '—')}</b><br><span class="small muted">${esc(x.email)}</span>${!x.active ? ' <span class="badge">вимкнено</span>' : ''}</td>
        <td>${x.id === S.me.id ? 'власник' : `<select class="in" data-role="${x.id}" style="width:auto;font-size:14px"><option value="editor"${x.role === 'editor' ? ' selected' : ''}>редактор</option><option value="viewer"${x.role === 'viewer' ? ' selected' : ''}>глядач</option><option value="owner"${x.role === 'owner' ? ' selected' : ''}>власник</option></select>`}</td>
        <td class="num"><button class="btn line small" data-act="devs" data-id="${x.id}" title="Показати пристрої">${x.sessions.n} ${S.ui.devs === x.id ? '▴' : '▾'}</button></td><td class="num small">${esc(when(x.sessions.last))}</td>
        <td>${x.id === S.me.id ? '' : `<div class="btns"><button class="btn line small" data-reset="${x.id}">Новий пароль</button><button class="btn line small" data-revoke="${x.id}">Вийти з усіх пристроїв</button><button class="btn ${x.active ? 'danger' : 'line'} small" data-active="${x.id}" data-v="${!x.active}">${x.active ? 'Вимкнути доступ' : 'Увімкнути'}</button>${x.role !== 'owner' ? `<button class="btn danger small" data-act="mdel" data-id="${x.id}">Видалити акаунт</button>` : ''}</div>`}</td></tr>${S.ui.devs === x.id ? devRows(x) : ''}`).join('')}
      </tbody></table></div>
      <p class="small muted">«Вимкнути доступ» — тимчасово: людина не зможе зайти, доки не ввімкнете знову. «Видалити акаунт» — назавжди: вхід стерто, з усіх пристроїв вийде одразу; її спогади й запитання лишаться в архіві з позначкою «видалено».${m.deleted ? ` Видалених акаунтів: ${m.deleted}.` : ''}</p></div>
      ${m.invites.length ? `<div class="sec" style="margin-top:26px"><h3>Очікують</h3>${m.invites.map(i => `<div class="small">${esc(i.name || i.email)} · ${esc(i.email)} · ${i.purpose === 'reset' ? 'новий пароль' : 'запрошення'} · діє до ${esc(when(i.expires_at))}</div>`).join('')}</div>` : ''}`;
  } else if (a.tab === 'backup') {
    const D = S.data, nPh = D.photos.filter(x => !isVoice(x)).length, nV = D.photos.filter(isVoice).length, nPg = D.documents.reduce((n, d) => n + (d.pages || 0), 0);
    body = `<div class="sec bkup"><h2>Резервна копія всього архіву</h2>
      <p>Один файл <b>.zip</b> на ваш комп'ютер — щоб родовід зберігся незалежно від сайту. Усередині:</p>
      <ul><li><b>rodovid.ged</b> — дерево у форматі <b>GEDCOM</b> (відкривають MyHeritage, Ancestry, FamilySearch, Gramps, GEDCOM-переглядачі): ${Object.keys(P).length} людей, шлюби, дати, місця, описи, джерела, посилання на фото;</li>
      <li><b>photos/</b> — ${nPh} фото в найкращій якості; <b>voices/</b> — ${nV} голосових записів;</li>
      <li><b>docs/</b> — ${nPg} сторінок архівних документів (${D.documents.length} документів) з описом, який рядок наш;</li>
      <li><b>texts/</b> — «Історія роду», «Історія сіл», «Припущення»; <b>data.json</b> — усі дані сайту повністю; <b>ЧИТАЙТЕ.txt</b> — що де лежить.</li></ul>
      <p class="small muted">Файл великий (може бути сотні МБ) — завантаження займе кілька хвилин, не закривайте сторінку. Робіть копію раз на місяць і зберігайте на диску чи в хмарі.</p>
      <div class="btns"><button class="btn" data-act="bk-run">⬇ Завантажити резервну копію</button><button class="btn line" data-act="bk-ged">Лише дерево (.ged)</button></div>
      <div class="upprog" id="bk-g" hidden><div class="upbar"><i></i></div><span></span></div><div id="bk-m" class="small"></div></div>`;
  } else if (a.tab === 'history' && a.revs) {
    body = `<p class="small muted">Усі зміни в дереві. Будь-яку можна відкотити: попередній стан повернеться, а сам відкат теж запишеться в історію.</p>${revList(a.revs.revisions)}`;
  }
  return `<div class="pghead"><h1 title="Аналітика, доступи родичів та історія змін.">Власнику</h1>${tabs}</div>${body}`;
}
const ENT = { person: 'Картка', union: 'Подружжя', family: 'Родина', story: 'Спогад', photo: 'Фото', member: 'Доступ', seed: 'Імпорт', question: 'Запитання' };
const ACT = { create: 'створено', replace: 'замінено обробленою версією', update: 'змінено', delete: 'видалено', restore: 'відкат', invite: 'запрошення', reset: 'новий пароль' };
const FIELD = { n: "ім'я", pt: 'по батькові', s: 'прізвище', m: 'дівоче', b: 'народження', d: 'смерть', bp: 'місце народження', dp: 'місце смерті', note: 'опис', f: 'батько', mo: 'мати', sex: 'стать', hyp: 'гіпотеза', fam: 'гілки', portrait: 'головне фото', story: 'історія', text: 'текст', caption: 'підпис', status: 'стан', answer: 'відповідь' };
function diff(b, a) {
  if (!b || !a || typeof b !== 'object') return '';
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter(k => JSON.stringify(b[k] ?? '') !== JSON.stringify(a[k] ?? ''));
  const v = (k, x) => (k === 'f' || k === 'mo') && P[x] ? short(P[x]) : Array.isArray(x) ? x.join(', ') : String(x ?? '').slice(0, 140);
  return keys.slice(0, 8).map(k => `<div class="diff">${esc(FIELD[k] || k)}: <del>${esc(v(k, b[k]))}</del> → <ins>${esc(v(k, a[k]))}</ins></div>`).join('');
}
const revName = r => r.entity === 'person' ? (P[r.entity_id] ? `<a href="${href('p', r.entity_id)}">${esc(short(P[r.entity_id]))}</a>` : esc((r.after || r.before || {}).n || r.entity_id)) : esc((r.after || r.before || {}).email || (r.after || r.before || {}).title || '');
const revList = list => `<div class="log">${list.map(r => `<div><span class="mono">${esc(when(r.at))}</span><span><b>${esc(who(r.by))}</b> · ${esc(ENT[r.entity] || r.entity)} ${esc(ACT[r.action] || r.action)}: ${revName(r)}${r.action === 'update' ? diff(r.before, r.after) : ''}${['person', 'family', 'union', 'story', 'photo'].includes(r.entity) && r.action !== 'restore' ? ` <button class="btn line small" data-revert="${r.id}">Відкотити</button>` : ''}</span></div>`).join('') || '<p class="muted">Змін ще немає.</p>'}</div>`;
function memberLog(name, log) {
  const VN = { tree: 'Дерево', p: 'Картка', families: 'Родини', fam: 'Родина', people: 'Покажчик', docs: 'Документи', admin: 'Панель' };
  const lbl = e => { const t = e.target || ''; if (t.startsWith('person:')) return P[t.slice(7)] ? short(P[t.slice(7)]) : t; if (t.startsWith('doc:')) return S.data.documents.find(d => d.id === t.slice(4))?.title || t; if (t.startsWith('fam:')) return FAM[t.slice(4)]?.title || t; return t; };
  // пульси згортаємо в «сеанси на картці»
  const items = []; for (const e of log.events) { const last = items[items.length - 1]; if (e.type === 'beat' && last && last.type === 'beat' && last.target === e.target && last.view === e.view) { last.ms += e.ms; last.at0 = e.at; continue; } items.push({ ...e }); }
  return `<div class="sec" style="margin-top:26px"><h3>Журнал: ${esc(name)} <button class="btn line small" data-member="">Закрити</button></h3><div class="log">
    ${items.slice(0, 400).map(e => `<div><span class="mono">${esc(when(e.at))}</span><span>${e.type === 'login' ? '<b>Увійшов</b>' : e.type === 'beat' ? `Переглядав ${esc(VN[e.view] || e.view || '')}${e.target ? ': ' + esc(lbl(e)) : ''} — <b>${fmtT(e.ms)}</b>` : e.type === 'open' ? `Відкрив ${esc(lbl(e))}` : e.type === 'edit' ? `Зміна (${esc(e.view)}) ${esc(lbl(e))}` : `${esc(VN[e.view] || e.view || '')} ${esc(lbl(e))}`}</span></div>`).join('') || '<p class="muted">За цей період нічого.</p>'}
  </div>${log.revisions.length ? `<h3 style="margin-top:14px">Зміни</h3>${revList(log.revisions)}` : ''}</div>`;
}

/* ───── Вхід, запрошення, перше налаштування ───── */
const INTRO = [
  'Кожен із нас — продовження когось.',
  'Хліборобів, що століттями орали землю у Вороньках і Веприку. Солдатів, що поверталися додому. Матерів, що ростили по вісім дітей.',
  'Ба́тьків рід — із Вороньків, мамин — із Веприку й Лідина. Їхні імена століттями лежали в церковних книгах. Тепер ми повертаємо їх родині.',
  'Знати свій рід — значить знати, звідки ти і куди йдеш.'
];
const QUOTE = { t: 'Учітеся, читайте,<br>І чужому научайтесь,<br>Й свого не цурайтесь:<br>Бо хто матір забуває,<br>Того Бог карає…', a: 'Тарас Шевченко, «І мертвим, і живим, і ненарожденним…», 1845' };
const introHtml = btn => `<div class="intro">${INTRO.map((l, i) => `<p class="il" style="animation-delay:${0.4 + i * 1.3}s">${l}</p>`).join('')}
  <blockquote class="iq" style="animation-delay:${0.6 + INTRO.length * 1.3}s"><p>${QUOTE.t}</p><cite>${QUOTE.a}</cite></blockquote>
  ${btn ? `<button class="btn ib" data-act="intro-close" style="animation-delay:${1.2 + INTRO.length * 1.3}s">До родинного архіву</button>` : ''}</div>`;
const introSeen = () => { try { return sessionStorage.getItem('rs_intro') === '1'; } catch { return S.ui.introSeen; } };
const introMark = () => { S.ui.introSeen = true; try { sessionStorage.setItem('rs_intro', '1'); } catch {} };
function gate(inner) { return `<div class="gate"><div class="card"><h1>Наш родовід</h1><div class="sub gate-sn">${SURN.join(' · ')}</div><div class="sub">Родинний архів · закритий доступ</div><div class="orn">◆ ◆ ◆</div>${inner}</div></div>`; }
function vLogin() { return `<div class="loginwrap">${introHtml(false)}` + gate(`<form id="login" class="sec"><label class="f">Пошта або логін<input class="in" id="lg-e" type="text" inputmode="email" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="username" required></label><label class="f">Пароль<input class="in" id="lg-p" type="password" autocomplete="current-password" required></label><button class="btn" type="submit">Увійти</button><div class="msg" id="lg-m"></div></form>${S.join || S.teaser?.open ? `<p style="text-align:center;margin:0"><a href="#" data-act="to-register">Ще немає доступу? Зареєструватися</a></p>` : `<p class="small muted" style="text-align:center;margin:0">Доступ лише для родини. Забули пароль — напишіть Максиму.</p>`}`) + teaserHtml() + '<p class="lg-cr">Сайт створив і веде <b>Максим Шутий</b></p></div>'; }
/* Гостю без входу: цифри й «силует» дерева предків (без імен) + заклик зареєструватися */
function teaserHtml() {
  const t = S.teaser; if (t === undefined) { S.teaser = null; fetch('/api/auth?a=teaser').then(r => r.ok ? r.json() : null).then(j => { if (j && !S.me) { S.teaser = j; render(); } }).catch(() => {}); return ''; }
  if (!t) return '';
  const pl = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return `${n} ${m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c}`; };
  const num = (n, l) => `<div class="tz-n"><b>${n}</b><span>${l}</span></div>`;
  const rows = (t.gens || []).map((k, g) => { const tot = 2 ** g, show = Math.min(tot, 64); const on = Math.max(k ? 1 : 0, Math.round(k / tot * show)), pad = Math.floor((show - on) / 2); return `<div class="tz-row" title="${g === 0 ? 'Ви' : `${g}-е покоління предків: відомо ${k} з ${tot}`}">${Array.from({ length: show }, (_, i) => `<i class="${i >= pad && i < pad + on ? 'on' : ''}"></i>`).join('')}</div>`; }).reverse().join('');
  const reg = S.join || t.open;
  return `<section class="tz">
    <h2>Наш родовід уже зібрав</h2>
    <div class="tz-nums">${num(t.people, 'людей у дереві')}${num(t.docs, 'архівних документів')}${num(t.photos, 'родинних фото')}${t.voices ? num(t.voices, 'голосових спогадів') : ''}${t.oldest ? num(t.oldest, 'рік народження найдавнішого предка') : ''}</div>
    ${rows ? `<div class="tz-tree" aria-hidden="true">${rows}</div><p class="tz-cap">${pl((t.gens || []).length, 'покоління', 'покоління', 'поколінь')} предків — кожна крапка це людина, яку ми вже знайшли. Порожні — ще шукаємо, і, можливо, саме ви знаєте відповідь.</p>` : ''}
    <p class="tz-txt">Тут ваші бабусі й дідусі, прадіди й прапрадіди — з фото, метриками, військовими документами й спогадами. Зареєструйтеся, знайдіть себе в дереві, додайте фото і запишіть історію голосом. <b>Покличте дітей і онуків</b> — нехай допоможуть зареєструватися, це кілька хвилин.</p>
    ${reg ? '<button class="btn" data-act="to-register">Зареєструватися</button>' : '<p class="small muted">Щоб отримати доступ, напишіть Максиму — він надішле посилання.</p>'}
  </section>`;
}
function vInvite(inv) { return gate(`<form id="accept" class="sec"><p style="margin:0">${inv.purpose === 'reset' ? 'Задайте новий пароль' : 'Вас запросили до родинного архіву.'}</p><label class="f">${inv.email.includes('@') ? 'Пошта' : 'Ваш логін (запишіть його)'}<input class="in" value="${esc(inv.email)}" disabled></label><label class="f">Як вас підписувати<input class="in" id="ac-n" value="${esc(inv.name || '')}" required></label><label class="f">Придумайте пароль (від 8 символів)<input class="in" id="ac-p" type="password" autocomplete="new-password" minlength="8" required></label><button class="btn" type="submit">${inv.purpose === 'reset' ? 'Зберегти пароль' : 'Увійти до архіву'}</button><div class="msg" id="ac-m"></div></form>`); }
function vSetup() { return gate(`<form id="setup" class="sec"><p style="margin:0">Перше налаштування: створіть обліковий запис власника.</p><label class="f">Код налаштування (BOOTSTRAP_TOKEN з Vercel)<input class="in" id="su-t" type="password" required></label><label class="f">Ваше ім'я<input class="in" id="su-n" value="Максим" required></label><label class="f">Пошта<input class="in" id="su-e" type="email" required></label><label class="f">Пароль (від 10 символів)<input class="in" id="su-p" type="password" minlength="10" autocomplete="new-password" required></label><button class="btn" type="submit">Створити</button><div class="msg" id="su-m"></div></form>`); }
function vSeed() { return gate(`<div class="sec"><p style="margin:0">База порожня. Імпортувати дерево, родини і скани документів із початкового набору?</p><button class="btn" data-act="seed">Імпортувати</button><div class="msg" id="sd-m"></div></div>`); }

/* ═════════ Головна, «Ким ми доводимось», «Хто на фото?», голоси, карта роду, цей день, цифри, «Допоможіть знайти», плакат, запрошення, ДНК (13.10) ═════════ */
const CFG_ = () => S.data?.cfg || {};
const tagsOf = id => (CFG_().photoPeople || {})[id] || []; // хто ще позначений на фото
const photoOf = (x, pid) => x.person === pid || tagsOf(x.id).includes(pid);
const yN = s => { const m = String(s || '').match(/(\d{4})/); return m ? +m[1] : null; };
const dmOf = s => { const m = String(s || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/); return m ? { d: +m[1], m: +m[2], y: +m[3] } : null; };
const dmW = s => dmOf(s) || ((m => m ? { d: +m[1], m: +m[2], y: null } : null)(String(s || '').match(/^\s*(\d{1,2})\.(\d{1,2})\.?\s*$/))); // дата шлюбу може бути без року («16.10»)
const isLiving = p => !p.d && !p.dp && !p.dead && (yN(p.b) || 0) >= 1925;
const isVoice = x => /^audio\//.test(x?.mime || '');
const MONTHS_G = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
const pLink = id => P[id] ? `<a href="${href('p', id)}">${esc(short(P[id]))}</a>` : '';
const pick = (id, sel) => `${id ? `<datalist id="dl-${id}">${Object.values(P).sort((a, b) => full(a).localeCompare(full(b), 'uk')).map(p => `<option value="${esc(plabel(p))}"></option>`).join('')}</datalist>` : ''}<input class="in" id="${id}" list="dl-${id}" value="${sel && P[sel] ? esc(plabel(P[sel])) : ''}" placeholder="Почніть вводити ім'я…" autocomplete="off">`;
const pickVal = id => { const v = ($('#' + id)?.value || '').trim(); if (!v) return null; return (Object.values(P).find(p => plabel(p) === v) || Object.values(P).find(p => full(p) === v) || Object.values(P).find(p => short(p) === v))?.id || null; };

/* ── Telegram-група ── */
function tgCard(small) {
  const u = CFG_().tg;
  if (!u) return isOwner() ? `<div class="hcard tgc"><div class="tgc-i">TG</div><div><b>Група родини в Telegram</b><p class="small muted">Створіть групу (налаштування: «Схвалювати нових учасників») і вставте сюди посилання-запрошення — воно з'явиться всюди на сайті.</p><button class="btn small" data-act="tg-set">Додати посилання</button></div></div>` : '';
  return `<div class="hcard tgc${small ? ' sm' : ''}"><div class="tgc-i">TG</div><div><b>Наша група в Telegram — доєднуйтесь!</b><p class="small muted">Фото, спогади, знахідки з архівів і родинні новини — усі разом.</p><a class="btn tgbtn" href="${esc(u)}" target="_blank" rel="noopener noreferrer" data-soc="tggroup">Приєднатися до групи</a>${isOwner() ? ` <button class="btn line small" data-act="tg-set">Змінити</button>` : ''}</div></div>`;
}
function openTgSet() {
  modal(`<h2>Група родини в Telegram</h2><p class="small muted">У Telegram: група → Редагувати → Запрошення (Invite links) → скопіюйте посилання (виду https://t.me/+…). Порада: увімкніть «Схвалювати нових учасників», тоді чужі не зайдуть навіть із посиланням.</p>
    <label class="f">Посилання на групу<input class="in" id="tg-u" value="${esc(CFG_().tg || '')}" placeholder="https://t.me/+AbCdEf…" inputmode="url" autocapitalize="off" spellcheck="false"></label>
    <div class="btns"><button class="btn" data-act="tg-save">Зберегти</button><button class="btn line" data-act="close">Скасувати</button><span class="msg" id="tgmsg"></span></div>`);
}

/* ── Ким ми одне одному доводимось ── */
function ancD(id) { // предок → найменша відстань у поколіннях
  const m = new Map([[id, 0]]), q = [id];
  while (q.length) { const x = q.shift(), d = m.get(x), p = P[x]; for (const y of [p?.f, p?.mo]) if (y && P[y] && !m.has(y)) { m.set(y, d + 1); q.push(y); } }
  return m;
}
const cuz = (k, f) => k <= 1 ? '' : (['', '', 'двоюрідн', 'троюрідн', 'четвероюрідн', "п'ятиюрідн", 'шестиюрідн', 'семиюрідн'][k] || k + '-юрідн') + (f ? 'а ' : 'ий ');
function kinWord(da, db, f) { // хто b для a: da — поколінь від a вгору до спільного предка, db — від b
  if (da === 0 && db === 0) return 'та сама людина';
  if (da === 0) return db === 1 ? (f ? 'донька' : 'син') : db === 2 ? (f ? 'онука' : 'онук') : db === 3 ? (f ? 'правнучка' : 'правнук') : 'пра'.repeat(db - 2) + (f ? 'внучка' : 'внук');
  if (db === 0) return da === 1 ? (f ? 'мати' : 'батько') : da === 2 ? (f ? 'баба' : 'дід') : da === 3 ? (f ? 'прабаба' : 'прадід') : da === 4 ? (f ? 'прапрабаба' : 'прапрадід') : `${da - 1}-${f ? 'а прабаба' : 'й прадід'}`;
  const k = Math.min(da, db), diff = Math.abs(da - db);
  if (diff === 0) return cuz(k, f) + (f ? 'сестра' : 'брат');
  if (da > db) { // b — старше покоління
    if (diff === 1) return cuz(k, f) + (f ? 'тітка' : 'дядько');
    if (diff === 2) return cuz(k + 1, f) + (f ? 'баба' : 'дід');
    if (diff === 3) return cuz(k + 1, f) + (f ? 'прабаба' : 'прадід');
    return cuz(k + 1, f) + 'пра'.repeat(diff - 2) + (f ? 'баба' : 'дід');
  }
  if (diff === 1) return cuz(k, f) + (f ? 'племінниця' : 'племінник');
  if (diff === 2) return cuz(k + 1, f) + (f ? 'онука' : 'онук');
  if (diff === 3) return cuz(k + 1, f) + (f ? 'правнучка' : 'правнук');
  return cuz(k + 1, f) + 'пра'.repeat(diff - 2) + (f ? 'внучка' : 'внук');
}
function bloodKin(a, b) {
  const A = ancD(a), B = ancD(b); let best = null;
  for (const [x, da] of A) if (B.has(x)) { const db = B.get(x), s = da + db; if (!best || s < best.s || (s === best.s && da < best.da)) best = { x, da, db, s }; }
  if (!best) return null;
  const common = [...A.keys()].filter(x => B.has(x) && A.get(x) === best.da && B.get(x) === best.db); // обоє з подружжя-предків
  const pathUp = (from, to) => { const out = [from]; let cur = from; while (cur !== to) { const p = P[cur]; const nx = [p.f, p.mo].find(y => y && P[y] && (y === to || ancD(y).has(to))); if (!nx) break; out.push(nx); cur = nx; } return out; };
  const half = best.da === 1 && best.db === 1 && common.length === 1 && [P[a].f, P[a].mo].filter(Boolean).length === 2 && [P[b].f, P[b].mo].filter(Boolean).length === 2;
  return { ...best, common, word: kinWord(best.da, best.db, P[b].sex === 'f'), half, path: [...pathUp(a, best.x), ...pathUp(b, best.x).reverse().slice(1)] };
}
function kinship(a, b) {
  if (!P[a] || !P[b]) return null;
  if (a === b) return { text: 'Це та сама людина.' };
  const sp = (SPOUSES[a] || []).find(s => s.id === b);
  if (sp) return { word: P[b].sex === 'f' ? 'дружина' : 'чоловік', text: `${short(P[b])} — ${P[b].sex === 'f' ? 'дружина' : P[b].sex === 'm' ? 'чоловік' : 'чоловік / дружина'}${ucU(sp) ? ' (шлюб не підтверджено документами)' : ''}.`, path: [a, b] };
  const r = bloodKin(a, b);
  if (r) return { word: r.word + (r.half ? (P[r.common[0]]?.sex === 'f' ? ' по матері' : ' по батькові') : ''), text: `${short(P[b])} — ${r.word}${r.half ? (P[r.common[0]]?.sex === 'f' ? ' по матері' : ' по батькові') : ''}.`, sub: `Спільн${r.common.length > 1 ? 'і предки' : 'ий предок'}: ${r.common.map(pLink).join(' і ')}. ${r.da === 0 || r.db === 0 ? '' : `Від ${esc(short(P[a]))} до ${r.common.length > 1 ? 'них' : P[r.x].sex === 'f' ? 'неї' : 'нього'} — ${r.da} пок., від ${esc(short(P[b]))} — ${r.db} пок.`}`, path: r.path };
  // через шлюб: b — чоловік/дружина кровного родича a, або a — через свого чоловіка/дружину
  for (const s of SPOUSES[b] || []) { const r2 = bloodKin(a, s.id); if (r2) return { word: 'родич через шлюб', text: `Родич через шлюб: ${short(P[b])} — ${P[b].sex === 'f' ? 'дружина' : 'чоловік'} людини, яка доводиться ${short(P[a])}: ${r2.word} (${short(P[s.id])}).`, path: [...r2.path, b] }; }
  for (const s of SPOUSES[a] || []) { const r2 = bloodKin(s.id, b); if (r2) return { word: 'родич через шлюб', text: `Родич через шлюб: для ${short(P[s.id])} (${P[s.id].sex === 'f' ? 'дружина' : 'чоловік'} ${short(P[a])}) ${short(P[b])} — ${r2.word}.`, path: [a, ...r2.path] }; }
  return { text: 'Спільних предків у дереві поки не знайдено. Можливо, зв\'язок ще не внесено — напишіть у «Запитання й уточнення».' };
}
function kinBox(a, b, full_) {
  const r = a && b ? kinship(a, b) : null;
  return `<div class="kin${full_ ? ' big' : ''}" id="kinbox">
    <div class="kin-row"><label class="f">Хто<span class="kin-in">${pick('kin-a', a)}</span></label><button class="btn line small kin-sw" data-act="kin-swap" title="Поміняти місцями" aria-label="Поміняти місцями">⇄</button><label class="f">і хто<span class="kin-in">${pick('kin-b', b)}</span></label></div>
    ${r ? `<div class="kin-res"><p class="kin-t">${esc(r.text)}</p>${r.sub ? `<p class="small muted">${r.sub}</p>` : ''}${(r.path || []).length > 1 ? `<div class="kin-path">${r.path.map((x, i) => `${i ? '<span class="kin-ar">→</span>' : ''}<a class="kin-p" href="${href('p', x)}">${avatar(P[x], 'sm')}<span><b>${esc(short(P[x]))}</b><i>${esc(years(P[x]))}</i></span></a>`).join('')}</div>` : ''}</div>` : `<p class="small muted">Виберіть двох людей — сайт порахує, ким вони доводяться одне одному, і покаже шлях через спільних предків.</p>`}
  </div>`;
}
function vKin() {
  const a = S.ui.kinA || S.me?.person_id || rootId(), b = S.ui.kinB || null;
  return `<div class="lede"><h1>Ким ми доводимось</h1><p class="small muted">Двоюрідні, троюрідні, дядьки, племінники — через спільних предків у дереві.</p></div>${kinBox(a, b, true)}`;
}

/* ── «Хто на фото?» ── */
const askList = () => Object.entries(CFG_().photoAsk || {}).map(([id, v]) => ({ ...v, ph: S.data.photos.find(x => x.id === id) })).filter(x => x.ph && !isVoice(x.ph)).sort((a, b) => String(b.at).localeCompare(String(a.at)));
const hintsOf = id => S.data.stories.filter(s => s.target === 'photo:' + id);
function askGrid(max) {
  const L = askList(), addB = S.me ? `<button class="btn small askadd" data-act="ask-new">＋ Додати фото</button>` : '';
  if (!L.length) return `${addB}<p class="muted small">Поки немає фото, на яких треба когось упізнати. Маєте старе фото й не знаєте, хто на ньому? Натисніть «＋ Додати фото» і позначте «Не знаю, хто на фото» — родичі підкажуть.</p>`;
  return `${addB}<div class="askg">${L.slice(0, max || 999).map(x => `<button class="askc" data-act="ask-open" data-id="${x.ph.id}"><img src="${img('photo=' + x.ph.id, true)}" alt="" loading="lazy"><span><b>${esc(x.ph.caption || (P[x.ph.person] ? short(P[x.ph.person]) : 'Хто це?'))}</b><i>${x.ph.pending ? 'чекає підтвердження · ' : ''}${hintsOf(x.ph.id).length ? hintsOf(x.ph.id).length + ' підказ.' : 'ще ніхто не підказав'}</i></span></button>`).join('')}</div>`;
}
const canRot = ph => !!ph && /^image\//.test(ph.mime || 'image/jpeg') && (canEdit() || (S.me && ph.by === S.me.id)); // повернути фото: редактор або той, хто фото додав
function openAsk(id) {
  const ph = S.data.photos.find(x => x.id === id), a = (CFG_().photoAsk || {})[id]; if (!ph) return;
  const hs = hintsOf(id);
  modal(`<h2>Хто на фото?</h2>
    <div class="ask-im"><img src="${img('photo=' + id)}" alt="" data-act="ask-zoom" data-id="${id}">${canRot(ph) ? `<div class="ask-rot"><button class="btn line small" data-act="ask-rot" data-dir="l" data-id="${id}" title="Повернути ліворуч">⟲ Повернути ліворуч</button><button class="btn line small" data-act="ask-rot" data-dir="r" data-id="${id}" title="Повернути праворуч">⟳ Повернути праворуч</button></div>` : ''}</div>
    <p class="small muted">${esc(ph.caption || '')}${P[ph.person] ? ` · фото з картки ${pLink(ph.person)}` : ''}${a?.note ? ` · ${esc(a.note)}` : ''}</p>
    <h3>Підказки родичів</h3>${hs.length ? storiesHtml(hs) : '<p class="muted small">Ще ніхто не підказав. Будьте першим!</p>'}
    <div class="sec" style="gap:8px"><textarea class="in" id="st-photo:${id}" placeholder="Напр.: «Друга зліва в другому ряду — баба Вівдя, поруч її сестра Маня. Фото приблизно 1955 р., Веприк»"></textarea>
    <div class="btns"><button class="btn" data-story="photo:${id}">Додати підказку</button>${canEdit() ? `<button class="btn line small" data-act="ask-off" data-id="${id}">✓ Уже впізнали — вказати хто</button>` : ''}<button class="btn line" data-act="close">Закрити</button><span class="msg" id="stm-photo:${id}"></span></div></div>`);
  S.ui.askOpen = id;
}

/* ───── Резервна копія: GEDCOM + фото, голоси, документи, тексти — один ZIP, зібраний у браузері (без бібліотек) ───── */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC_T[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zipBlob(files) { // files: [{name, data: Uint8Array}] — без стиснення (фото й звук і так стиснені)
  const enc = new TextEncoder(), parts = [], cd = []; let off = 0;
  const d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF, dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  for (const f of files) {
    const nm = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
    const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, dt, true); h.setUint16(12, dd, true); h.setUint32(14, crc, true); h.setUint32(18, sz, true); h.setUint32(22, sz, true); h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
    parts.push(h.buffer, nm, f.data);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, dt, true); c.setUint16(14, dd, true); c.setUint32(16, crc, true); c.setUint32(20, sz, true); c.setUint32(24, sz, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
    cd.push(c.buffer, nm); off += 30 + nm.length + sz;
  }
  const cdSize = cd.reduce((n, x) => n + (x.byteLength ?? x.length), 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...cd, e.buffer], { type: 'application/zip' });
}
async function fetchFull(url) { // великі файли сервер віддає частинами (x-chunks)
  const get = async k => { const r = await fetch(url + (k ? '&chunk=' + k : ''), { credentials: 'same-origin' }); if (!r.ok) throw new Error('http_' + r.status); return r; };
  const r0 = await get(0), n = Number(r0.headers.get('x-chunks') || 1), parts = [new Uint8Array(await r0.arrayBuffer())];
  for (let k = 1; k < n; k++) parts.push(new Uint8Array(await (await get(k)).arrayBuffer()));
  if (parts.length === 1) return { data: parts[0], type: r0.headers.get('content-type') || '' };
  const out = new Uint8Array(parts.reduce((n, x) => n + x.length, 0)); let o = 0; for (const x of parts) { out.set(x, o); o += x.length; } return { data: out, type: r0.headers.get('content-type') || '' };
}
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' };
const plainLinks = t => String(t || '').replace(/\[\[[pd]:[a-z0-9_-]+\|([^\]]+)\]\]/gi, '$1').replace(/\*\*?([^*]+)\*\*?/g, '$1');
function gedDate(v) { // «12.03.1911» → 12 MAR 1911; «~1910» → ABT 1910; інше — фразою
  const M = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']; v = String(v || '').trim(); if (!v) return '';
  let m = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); if (m && +m[2] >= 1 && +m[2] <= 12) return `${+m[1]} ${M[+m[2] - 1]} ${m[3]}`;
  m = v.match(/^(\d{1,2})\.(\d{4})$/); if (m && +m[1] >= 1 && +m[1] <= 12) return `${M[+m[1] - 1]} ${m[2]}`;
  if (/^\d{4}$/.test(v)) return v; m = v.match(/^[~≈]\s*(\d{4})$/) || v.match(/^(?:близько|бл\.|прибл\.?)\s*(\d{4})/i); if (m) return 'ABT ' + m[1];
  m = v.match(/^(\d{4})\s*[–-]\s*(\d{4})$/); if (m) return `BET ${m[1]} AND ${m[2]}`;
  return `(${v.replace(/[()]/g, '')})`;
}
function buildGedcom(media) { // media: {photoId: path, 'doc:id': [paths]}
  const L = [], g = (lv, tag, val) => { String(val ?? '').split(/\r?\n/).forEach((ln, i) => { const pre = i ? `${lv + 1} CONT` : `${lv} ${tag}`; let cut = (x) => { let n = Math.min(200, x.length); while (n < x.length && n > 1 && (x[n] === ' ' || x[n - 1] === ' ')) n--; return n; };
    let n = cut(ln); L.push(ln ? pre + ' ' + ln.slice(0, n) : pre); let rest = ln.slice(n); while (rest) { n = cut(rest); L.push(`${lv + 1} CONC ${rest.slice(0, n)}`); rest = rest.slice(n); } }); };
  const IX = {}, NX = { I: 0, S: 0 }, ix = (pre, x) => IX[pre + x] ||= '@' + pre + (++NX[pre]) + '@', iid = x => ix('I', x), fid = k => '@F' + k + '@', sid = x => ix('S', x);
  const now = new Date(), MM = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  L.push('0 HEAD', '1 SOUR NASH_RODOVID', '2 NAME Наш родовід', '1 GEDC', '2 VERS 5.5.1', '2 FORM LINEAGE-LINKED', '1 CHAR UTF-8', `1 DATE ${now.getDate()} ${MM[now.getMonth()]} ${now.getFullYear()}`, '1 SUBM @U1@', '0 @U1@ SUBM', '1 NAME Максим Шутий');
  // родини: шлюби + пари батьків дітей
  const F = {}, fkey = (a, b) => { const [h, w] = P[a]?.sex === 'f' || P[b]?.sex === 'm' ? [b, a] : [a, b]; return (h || '-') + '+' + (w || '-'); };
  const fam = (h, w) => { const k = fkey(h, w); return (F[k] ||= { k, h: k.split('+')[0], w: k.split('+')[1], kids: [], date: '' }); };
  S.data.unions.forEach(u => { if (P[u.a] && P[u.b]) fam(u.a, u.b).date = u.date || ''; });
  Object.values(P).forEach(p => { const f = P[p.f] ? p.f : '', m = P[p.mo] ? p.mo : ''; if (f || m) fam(f || '-', m || '-').kids.push(p.id); });
  Object.values(F).forEach((x, i) => { x.n = i + 1; });
  const docsOf = pid => S.data.documents.filter(d => (d.people || []).includes(pid) && d.type !== 'map');
  for (const p of Object.values(P)) {
    L.push(`0 ${iid(p.id)} INDI`); g(1, 'NAME', `${[p.n, p.pt].filter(Boolean).join(' ')} /${p.s || ''}/`.trim()); if (p.n) g(2, 'GIVN', p.n); if (p.s) g(2, 'SURN', p.s);
    if (p.m) { g(1, 'NAME', `${[p.n, p.pt].filter(Boolean).join(' ')} /${p.m}/`); g(2, 'TYPE', 'birth'); }
    if (p.sex) L.push(`1 SEX ${p.sex === 'f' ? 'F' : 'M'}`);
    if (p.b || p.bp) { L.push('1 BIRT'); if (p.b) g(2, 'DATE', gedDate(p.b)); if (p.bp) g(2, 'PLAC', p.bp); }
    if (p.d || p.dp || p.dead) { L.push(p.d || p.dp ? '1 DEAT' : '1 DEAT Y'); if (p.d) g(2, 'DATE', gedDate(p.d)); if (p.dp) g(2, 'PLAC', p.dp); }
    if (p.lp) { L.push('1 RESI'); g(2, 'PLAC', p.lp); }
    if (p.war) { L.push('1 EVEN'); g(2, 'TYPE', { ww1: 'Перша світова війна', ww2: 'Друга світова війна', other: 'Війна' }[p.war.w]); g(2, 'NOTE', { ret: 'повернувся', kil: 'загинув', mis: 'пропав безвісти', unk: 'доля невідома' }[p.war.f] + (p.war.h ? ' (є припущення)' : '')); }
    const r = relOf(p); g(1, 'NOTE', `Достовірність: ${RELK[r.k].t}${r.c ? '. Суперечливі версії: ' + r.c : ''}${p.hyp ? '. Зв\'язок у дереві — припущення.' : ''}`);
    if (p.note) g(1, 'NOTE', plainLinks(p.note));
    S.data.stories.filter(x => x.target === p.id).forEach(x => g(1, 'NOTE', `Спогад (${who(x.by)}, ${String(x.at || '').slice(0, 10)}): ${x.text}`));
    (p.src || []).forEach(x => g(1, 'NOTE', `Джерело: ${x.t || ''} ${x.u}`.trim()));
    Object.values(F).forEach(x => { if (x.h === p.id || x.w === p.id) L.push(`1 FAMS ${fid(x.n)}`); if (x.kids.includes(p.id)) L.push(`1 FAMC ${fid(x.n)}`); });
    docsOf(p.id).forEach(d => { L.push(`1 SOUR ${sid(d.id)}`); if (d.line) g(2, 'PAGE', plainLinks(d.line)); });
    S.data.photos.filter(x => photoOf(x, p.id) && media[x.id]).forEach(x => { L.push('1 OBJE'); g(2, 'FILE', media[x.id]); L.push(`3 FORM ${media[x.id].split('.').pop()}`); if (x.caption) g(2, 'TITL', x.caption); });
  }
  for (const x of Object.values(F)) {
    L.push(`0 ${fid(x.n)} FAM`); if (P[x.h]) L.push(`1 HUSB ${iid(x.h)}`); if (P[x.w]) L.push(`1 WIFE ${iid(x.w)}`);
    if (x.date || (P[x.h] && P[x.w])) { L.push('1 MARR'); if (x.date && !/не підтвердж/i.test(x.date)) g(2, 'DATE', gedDate(x.date)); else if (x.date) g(2, 'NOTE', x.date); }
    x.kids.forEach(k => L.push(`1 CHIL ${iid(k)}`));
  }
  for (const d of S.data.documents) {
    L.push(`0 ${sid(d.id)} SOUR`); g(1, 'TITL', d.title || 'Документ'); if (d.src) g(1, 'PUBL', d.src); if (d.date || d.place) g(1, 'NOTE', [d.date, d.place].filter(Boolean).join(', '));
    if (d.text) g(1, 'TEXT', plainLinks(d.text)); if (d.line) g(1, 'NOTE', 'Наш запис: ' + plainLinks(d.line)); if (d.url) g(1, 'NOTE', 'Посилання: ' + d.url); if (d.maybe) g(1, 'NOTE', 'Можлива рідня (не підтверджено)');
    (media['doc:' + d.id] || []).forEach(f => { L.push('1 OBJE'); g(2, 'FILE', f); L.push(`3 FORM ${f.split('.').pop()}`); });
  }
  L.push('0 TRLR'); return L.join('\r\n') + '\r\n';
}
async function backupRun(full) {
  const btns = document.querySelectorAll('[data-act="bk-run"],[data-act="bk-ged"]'); btns.forEach(b => b.disabled = true);
  const g = $('#bk-g'), m = $('#bk-m'), st = (pc, t) => { g.hidden = false; g.querySelector('i').style.width = pc + '%'; g.querySelector('span').textContent = t; };
  const enc = new TextEncoder(), files = [], media = {}, errs = [], day = new Date().toISOString().slice(0, 10);
  try {
    if (full) {
      const ph = S.data.photos, docs = S.data.documents.filter(d => d.pages), total = ph.length + docs.reduce((n, d) => n + d.pages, 0); let done = 0, bytes = 0;
      const tick = () => st(5 + Math.round(done / Math.max(1, total) * 85), `Завантажую файли: ${done} з ${total} (${(bytes / 1e6).toFixed(0)} МБ)… не закривайте сторінку`);
      for (const x of ph) { try { const r = await fetchFull(img('photo=' + x.id)); const ext = MIME_EXT[x.mime] || MIME_EXT[r.type.split(';')[0]] || 'jpg';
          const who_ = P[x.person] ? short(P[x.person]) : String(x.person || '').startsWith('fam:') ? (FAM[x.person.slice(4)]?.title || 'рід') : 'хто-на-фото';
          const name = `${isVoice(x) ? 'voices' : 'photos'}/${who_.replace(/[\\/:*?"<>|()]+/g, '').replace(/\s+/g, '_').slice(0, 50)}_${x.id.slice(0, 8)}.${ext}`;
          files.push({ name, data: r.data }); media[x.id] = name; bytes += r.data.length; } catch (e) { errs.push('фото ' + x.id + ': ' + e.message); } done++; tick(); }
      for (const d of docs) { media['doc:' + d.id] = []; for (let k = 0; k < d.pages; k++) { try { const r = await fetchFull(img(`doc=${d.id}&page=${k}`)); const name = `docs/${d.id}_${k + 1}.${MIME_EXT[r.type.split(';')[0]] || 'jpg'}`; files.push({ name, data: r.data }); media['doc:' + d.id].push(name); bytes += r.data.length; } catch (e) { errs.push('документ ' + d.id + ': ' + e.message); } done++; tick(); } }
      st(92, 'Тексти…');
      for (const [k, t] of [['history', 'Історія_роду'], ['villages', 'Історія_сіл'], ['hyps', 'Припущення']]) { try { const r = await api('/api/data?text=' + k); files.push({ name: `texts/${t}.json`, data: enc.encode(JSON.stringify(r, null, 1)) }); if (k === 'history' && r?.text?.md) files.push({ name: 'texts/Історія_роду.md', data: enc.encode(r.text.md) }); } catch (e) { errs.push('текст ' + k); } }
      files.push({ name: 'data.json', data: enc.encode(JSON.stringify({ exported: new Date().toISOString(), site: location.origin, ...S.data }, null, 1)) });
      files.push({ name: 'ЧИТАЙТЕ.txt', data: enc.encode(`Наш родовід — резервна копія від ${day}\r\n\r\nrodovid.ged — дерево у форматі GEDCOM 5.5.1 (UTF-8). Відкривається в Gramps (безкоштовно), MyHeritage, Ancestry, FamilySearch, RootsMagic.\r\n  Фото й документи прив'язані до людей шляхами photos/… і docs/… — тримайте папки поруч із файлом .ged.\r\nphotos/ — фото (ім'я файлу: людина_код).\r\nvoices/ — голосові спогади.\r\ndocs/ — скани архівних документів (документ_сторінка). Опис кожного документа і «який рядок наш» — у rodovid.ged (розділ SOUR) і в data.json.\r\ntexts/ — «Історія роду», «Історія сіл», «Припущення».\r\ndata.json — усі дані сайту (люди, шлюби, документи, фото, спогади) як є.\r\n\r\nЛюдей: ${Object.keys(P).length}, фото: ${S.data.photos.filter(x => !isVoice(x)).length}, голосів: ${S.data.photos.filter(isVoice).length}, документів: ${S.data.documents.length}.\r\n${errs.length ? '\r\nНе вдалося завантажити: ' + errs.join('; ') + '\r\n' : ''}\r\nСайт створив і веде Максим Шутий.\r\n`) });
    }
    st(96, 'Складаю дерево GEDCOM…');
    const ged = enc.encode(buildGedcom(media));
    let blob, fname;
    if (full) { files.unshift({ name: 'rodovid.ged', data: ged }); st(98, 'Пакую ZIP…'); blob = zipBlob(files); fname = `rodovid-kopiia-${day}.zip`; }
    else { blob = new Blob([ged], { type: 'text/plain;charset=utf-8' }); fname = `rodovid-${day}.ged`; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
    st(100, `Готово: ${fname} (${(blob.size / 1e6).toFixed(1)} МБ) — файл у «Завантаженнях».`);
    m.innerHTML = errs.length ? `<p class="msg err">Не вдалося взяти ${errs.length} файл(ів): ${esc(errs.slice(0, 5).join('; '))}${errs.length > 5 ? '…' : ''}</p>` : '';
    ev('open', 'backup', full ? 'zip' : 'ged');
  } catch (e) { m.innerHTML = `<p class="msg err">${esc(errText(e))}</p>`; }
  btns.forEach(b => b.disabled = false);
}

/* Редактор фото перед завантаженням: повернути, обрізати, яскравість і контраст. Оригінал не змінюється; на сайт іде оброблена копія. */
let PED = null;
async function pedOpen(f, box) {
  box.hidden = false; box.innerHTML = '<p class="muted small">Відкриваю фото…</p>';
  let bm; try { bm = await createImageBitmap(f, { imageOrientation: 'from-image' }); } catch { try { bm = await createImageBitmap(f); } catch { box.innerHTML = '<p class="msg err">Не вдалося відкрити фото. Спробуйте інший файл (JPEG, PNG).</p>'; return; } }
  PED = { bm, rot: 0, br: 100, ct: 100, crop: null, cropOn: false };
  box.innerHTML = `<div class="ped-st"><canvas id="ped-c"></canvas><div class="ped-cr" id="ped-r" hidden><i data-h="nw"></i><i data-h="ne"></i><i data-h="sw"></i><i data-h="se"></i></div></div>
    <div class="ped-bar"><button type="button" class="btn line small" data-ped="l" title="Повернути ліворуч" aria-label="Повернути ліворуч">⟲</button><button type="button" class="btn line small" data-ped="r" title="Повернути праворуч" aria-label="Повернути праворуч">⟳</button><button type="button" class="btn line small" data-ped="crop" aria-pressed="false">✂ Обрізати</button><button type="button" class="btn line small" data-ped="reset" title="Повернути як було">↺ Скинути</button></div>
    <div class="ped-sl"><label>☀ Яскравість<input type="range" min="50" max="170" value="100" data-pedv="br"></label><label>◐ Контраст<input type="range" min="50" max="170" value="100" data-pedv="ct"></label></div>`;
  box.onclick = e => { const b = e.target.closest('[data-ped]'); if (!b || !PED) return; const k = b.dataset.ped;
    if (k === 'l' || k === 'r') { PED.rot = (PED.rot + (k === 'r' ? 1 : 3)) % 4; if (PED.crop) { const c = PED.crop; PED.crop = k === 'r' ? { x: 1 - c.y - c.h, y: c.x, w: c.h, h: c.w } : { x: c.y, y: 1 - c.x - c.w, w: c.h, h: c.w }; } }
    if (k === 'crop') { PED.cropOn = !PED.cropOn; if (PED.cropOn && !PED.crop) PED.crop = { x: .08, y: .08, w: .84, h: .84 }; if (!PED.cropOn && PED.crop && PED.crop.w > .995 && PED.crop.h > .995) PED.crop = null; }
    if (k === 'reset') { Object.assign(PED, { rot: 0, br: 100, ct: 100, crop: null, cropOn: false }); box.querySelectorAll('[data-pedv]').forEach(x => x.value = 100); }
    pedDraw(); };
  box.oninput = e => { const r = e.target.closest('[data-pedv]'); if (r && PED) { PED[r.dataset.pedv] = +r.value; pedDraw(); } };
  const cr = $('#ped-r'); let drag = null;
  cr.onpointerdown = e => { e.preventDefault(); cr.setPointerCapture(e.pointerId); const R = $('#ped-c').getBoundingClientRect(); drag = { h: e.target.dataset.h || 'move', x0: e.clientX, y0: e.clientY, c0: { ...PED.crop }, W: R.width, H: R.height }; };
  cr.onpointermove = e => { if (!drag) return; const dx = (e.clientX - drag.x0) / drag.W, dy = (e.clientY - drag.y0) / drag.H, c = { ...drag.c0 }, m = .05;
    if (drag.h === 'move') { c.x = Math.min(1 - c.w, Math.max(0, c.x + dx)); c.y = Math.min(1 - c.h, Math.max(0, c.y + dy)); }
    else { if (drag.h.includes('w')) { const nx = Math.min(c.x + c.w - m, Math.max(0, c.x + dx)); c.w += c.x - nx; c.x = nx; } if (drag.h.includes('e')) c.w = Math.min(1 - c.x, Math.max(m, c.w + dx));
      if (drag.h.includes('n')) { const ny = Math.min(c.y + c.h - m, Math.max(0, c.y + dy)); c.h += c.y - ny; c.y = ny; } if (drag.h.includes('s')) c.h = Math.min(1 - c.y, Math.max(m, c.h + dy)); }
    PED.crop = c; pedCrop(); };
  cr.onpointerup = cr.onpointercancel = () => { drag = null; };
  pedDraw();
}
function pedRot(src, rot, max) { // повернуте зображення на canvas (max — найбільша сторона)
  const sw = src.width, sh = src.height, k = Math.min(1, max / Math.max(sw, sh)), w = Math.round(sw * k), h = Math.round(sh * k), c = document.createElement('canvas');
  c.width = rot % 2 ? h : w; c.height = rot % 2 ? w : h; const g = c.getContext('2d'); g.translate(c.width / 2, c.height / 2); g.rotate(rot * Math.PI / 2); g.drawImage(src, -w / 2, -h / 2, w, h); return c;
}
function pedDraw() {
  const cv = $('#ped-c'); if (!cv || !PED) return; const r = pedRot(PED.bm, PED.rot, 1000);
  cv.width = r.width; cv.height = r.height; cv.getContext('2d').drawImage(r, 0, 0);
  cv.style.filter = PED.br !== 100 || PED.ct !== 100 ? `brightness(${PED.br}%) contrast(${PED.ct}%)` : '';
  $('[data-ped="crop"]')?.setAttribute('aria-pressed', PED.cropOn ? 'true' : 'false'); $('[data-ped="crop"]')?.classList.toggle('on', PED.cropOn);
  pedCrop();
}
function pedCrop() { const cr = $('#ped-r'); if (!cr || !PED) return; const c = PED.crop; cr.hidden = !(PED.cropOn && c); if (cr.hidden) { $('#ped-c').style.clipPath = c ? `inset(${c.y * 100}% ${(1 - c.x - c.w) * 100}% ${(1 - c.y - c.h) * 100}% ${c.x * 100}%)` : ''; return; }
  $('#ped-c').style.clipPath = ''; Object.assign(cr.style, { left: c.x * 100 + '%', top: c.y * 100 + '%', width: c.w * 100 + '%', height: c.h * 100 + '%' }); }
async function pedExport() { // null — нічого не змінювали (іде оригінал)
  if (!PED || (!PED.rot && PED.br === 100 && PED.ct === 100 && !PED.crop)) return null;
  const r = pedRot(PED.bm, PED.rot, 4000), c = PED.crop || { x: 0, y: 0, w: 1, h: 1 };
  const out = cropCanvas(r, c), g = out.getContext('2d');
  if (PED.br !== 100 || PED.ct !== 100) { const im = g.getImageData(0, 0, out.width, out.height), d = im.data, b = PED.br / 100, k = PED.ct / 100;
    const L = new Uint8ClampedArray(256); for (let v = 0; v < 256; v++) L[v] = ((v * b) - 128) * k + 128;
    for (let i = 0; i < d.length; i += 4) { d[i] = L[d[i]]; d[i + 1] = L[d[i + 1]]; d[i + 2] = L[d[i + 2]]; } g.putImageData(im, 0, 0); }
  return canvasJpeg(out, 0.92);
}
async function fileHash(f) { try { const b = await crypto.subtle.digest('SHA-256', await f.arrayBuffer()); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 40); } catch { return ''; } }
ERR.dup = 'Це фото вже є на сайті (можливо, чекає підтвердження Максимом) — повторно надсилати не треба.';
// «＋ Додати фото»: одразу питаємо, хто на фото. Знаєте — обираєте людей (фото потрапить у їхні картки); не знаєте — «Хто на фото?», родичі підкажуть.
function openAskNew(pre = {}) {
  let sel = pre.person && P[pre.person] ? [pre.person] : []; PED = null;
  modal(`<h2>Додати фото</h2>
    <div class="sec" style="gap:10px" id="an-box">
      <label class="f">Фото<input class="in" type="file" id="an-f" accept="image/*"></label>
      <div class="ped" id="an-p" hidden></div>
      <div class="f"><span>Хто на фото <small class="muted">— оберіть людей з дерева, і фото з'явиться в їхніх картках</small></span><div class="tagl" id="an-l"></div>
        <input class="in" id="an-q" type="search" placeholder="🔍 Почніть писати ім'я, напр. «Надія» або «Шутий Яків»" autocomplete="off" enterkeyhint="search"><div class="tagres" id="an-r"></div></div>
      <label class="anunk"><input type="checkbox" id="an-u"> <span><b>Не знаю, хто на фото</b> (або не всіх) — попросити родичів упізнати. Фото з'явиться на Головній у «Хто на фото?».</span></label>
      <label class="f">Підпис <small class="muted">— коли, де, яка подія (не обов'язково)</small><textarea class="in" id="an-c" maxlength="500" placeholder="Напр.: «Різдво у баби Паші, приблизно 2003»"></textarea></label>
      <div class="upprog" id="an-g" hidden><div class="upbar"><i></i></div><span></span></div>
      <div class="btns"><button class="btn" data-act="ask-send">Завантажити</button><button class="btn line" data-act="close">Скасувати</button><span class="msg" id="an-m"></span></div></div>`);
  const paint = () => { $('#an-l').innerHTML = sel.map(y => `<span class="tagc">${esc(short(P[y]))}<button type="button" data-rm="${y}" aria-label="Прибрати">×</button></span>`).join(''); };
  const q = $('#an-q'), res = $('#an-r');
  q.addEventListener('input', () => { const L = personFind(q.value).filter(p => !sel.includes(p.id)); res.innerHTML = q.value.trim() ? (L.length ? L.map(p => `<button type="button" class="tagopt" data-pick="${p.id}">${ph(p)}<span><b>${esc(full(p))}</b><i>${esc(life(p) || '')}</i></span><em>＋</em></button>`).join('') : '<p class="muted small">Нікого не знайдено. Немає людини в дереві — позначте «Не знаю» і напишіть у підписі, хто це.</p>') : ''; });
  res.addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (!b) return; sel.push(b.dataset.pick); paint(); q.value = ''; res.innerHTML = ''; q.focus(); });
  $('#an-l').addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (b) { sel = sel.filter(y => y !== b.dataset.rm); paint(); } });
  const pick = f => { const p = $('#an-p'); if (!f) { p.hidden = true; PED = null; return; } openAskNew.file = f; pedOpen(f, p); };
  $('#an-f').onchange = e => pick(e.target.files[0]);
  openAskNew.file = null; if (pre.file) pick(pre.file);
  paint();
  openAskNew.sel = () => sel;
}
async function askSend(btn) {
  const f = openAskNew.file, m = $('#an-m'), cap = $('#an-c').value.trim(), sel = openAskNew.sel ? openAskNew.sel() : [], unk = $('#an-u').checked;
  if (!f) { m.className = 'msg err'; m.textContent = 'Оберіть фото.'; return; }
  if (!sel.length && !unk) { m.className = 'msg err'; m.textContent = 'Оберіть, хто на фото, або позначте «Не знаю, хто на фото».'; return; }
  if (btn.disabled) return; btn.disabled = true; $('#an-f').disabled = true; m.className = 'msg'; m.textContent = '';
  const g = $('#an-g'), st = (pc, t) => { g.hidden = false; g.querySelector('i').style.width = pc + '%'; g.querySelector('span').textContent = t; };
  try {
    st(10, 'Готую фото…'); const h = await fileHash(f); const ed = await pedExport() || f; const full = await bestPhoto(ed); const thumb = await toJpeg(ed, 420, 0.78);
    st(40, 'Надсилаю на сайт… не закривайте вікно');
    const qs = `caption=${encodeURIComponent(cap)}&h=${h}`;
    const r = await api(sel.length ? `/api/upload?person=${encodeURIComponent(sel[0])}&${qs}` : `/api/upload?ask=1&${qs}`, { raw: full });
    st(75, 'Майже готово…');
    await api(`/api/upload?kind=thumb&photo=${r.id}`, { raw: thumb }).catch(() => {});
    if (sel.length > 1) await api('/api/data', { body: { op: 'photo.people', id: r.id, people: sel.slice(1) } }).catch(() => {});
    if (unk) await api('/api/data', { body: { op: 'photo.ask', id: r.id, on: true, note: '' } }).catch(() => {});
    st(100, 'Готово');
    await load(); S.ui.keepScroll = true; render();
    modal(`<div class="updone"><div class="updone-ic">✓</div><h2>Фото надіслано</h2>
      <div class="ask-prev"><img src="${URL.createObjectURL(thumb)}" alt=""></div>
      <p>${r.pending ? 'Його побачать усі після підтвердження Максимом. <b>Повторно надсилати не треба.</b>' : 'Фото вже на сайті.'}${sel.length ? ' Позначено: ' + sel.map(y => esc(short(P[y]))).join(', ') + '.' : ''}${unk ? ' Фото буде в «Хто на фото?» — родичі зможуть підказати.' : ''}</p>
      <div class="btns" style="justify-content:center"><button class="btn" data-act="ask-new" data-p="${sel.length === 1 ? sel[0] : ''}">＋ Додати ще фото</button><button class="btn line" data-act="close">Закрити</button></div></div>`);
  } catch (err) {
    btn.disabled = false; $('#an-f').disabled = false; g.hidden = true; m.className = 'msg err'; m.textContent = errText(err);
    if (err.message === 'dup') { btn.disabled = true; btn.textContent = 'Уже завантажено'; }
  }
}

// Фото «Хто на фото?», які вже прибрали (впізнали): їх можна переглянути й повернути в список
function askDone(open = true) {
  if (!canEdit()) return '';
  const on = CFG_().photoAsk || {}, hs = new Set(S.data.stories.filter(x => /^photo:/.test(x.target)).map(x => x.target.slice(6)));
  const L = S.data.photos.filter(x => !on[x.id] && !isVoice(x) && x.mime !== 'application/pdf' && (x.person === '_ask' || hs.has(x.id)));
  if (!L.length) return '';
  return `<details class="askdone"${open ? ' open' : ''}><summary>Уже впізнані — прибрані з «Хто на фото?» (${L.length})</summary><div class="askg">${L.map(x => `<div class="askc"><img src="${img('photo=' + x.id, true)}" alt="" loading="lazy" data-act="ask-open" data-id="${x.id}"><span><b>${esc(x.caption || (P[x.person] ? short(P[x.person]) : 'Фото'))}</b><i>${hintsOf(x.id).length} підказ.</i></span><button class="btn small" data-act="ask-off" data-id="${x.id}">✎ Вказати, хто на фото</button><button class="btn line small" data-act="ask-back" data-id="${x.id}">↩ Повернути в «Хто на фото?»</button></div>`).join('')}</div></details>`;
}

/* ── Голоси роду (аудіо) ── */
const voicesOf = pid => S.data.photos.filter(x => isVoice(x) && (!pid || x.person === pid));
const vcache = {};
async function voiceUrl(id) { // довгі записи сервер віддає частинами по 4 МБ (x-chunks) — збираємо в один файл
  if (vcache[id]) return vcache[id];
  const get = async k => { const r = await fetch(img('photo=' + id) + (k ? '&chunk=' + k : ''), { credentials: 'same-origin' }); if (!r.ok) throw new Error('http_' + r.status); return r; };
  const r0 = await get(0), n = Number(r0.headers.get('x-chunks') || 1), parts = [await r0.blob()];
  for (let k = 1; k < n; k++) parts.push(await (await get(k)).blob());
  return (vcache[id] = URL.createObjectURL(new Blob(parts, { type: parts[0].type })));
}
const voiceRow = x => `<div class="vrow${x.pending ? ' phpend' : ''}" data-vid="${x.id}"><button class="vplay" data-act="v-play" data-id="${x.id}" aria-label="Слухати">▶</button><div class="vmeta"><b>${esc(x.caption || 'Голосовий спогад')}</b><i>${P[x.person] ? esc(short(P[x.person])) + ' · ' : String(x.person || '').startsWith('fam:') && FAM[x.person.slice(4)] ? esc(FAM[x.person.slice(4)].title) + ' · ' : ''}записав(ла) ${esc(who(x.by))}, ${esc(when(x.at))}${x.pending ? ' · <b class="pend-l">чекає підтвердження</b>' : ''}</i><audio controls preload="none" hidden></audio></div>${x.pending && isOwner() ? `<button class="btn small" data-act="ph-ok" data-id="${x.id}">✓</button><button class="btn line small" data-act="ph-no" data-id="${x.id}">✕</button>` : ''}${isOwner() && !x.pending ? `<details class="vmore"><summary title="Ще дії" aria-label="Ще дії">⋯</summary><div class="vmore-m"><button type="button" class="vdel" data-delphoto="${x.id}">Видалити запис</button></div></details>` : ''}</div>`;
/* Усі голоси роду — #/voices: пошук, про кого, сортування */
function vVoices() {
  const all = voicesOf().filter(x => !x.pending || isOwner() || x.by === S.me.id);
  const q = (S.ui.vq || '').trim().toLowerCase(), who_ = S.ui.vwho || '', so = S.ui.vso || 'new';
  const about = x => P[x.person] ? full(P[x.person]) : String(x.person || '').startsWith('fam:') && FAM[x.person.slice(4)] ? FAM[x.person.slice(4)].title : '';
  const subj = [...new Set(all.map(x => x.person).filter(Boolean))].map(id => [id, P[id] ? full(P[id]) : FAM[String(id).slice(4)] ? FAM[String(id).slice(4)].title + ' (загальна історія)' : '']).filter(x => x[1]).sort((a, b) => a[1].localeCompare(b[1], 'uk'));
  let L = all.filter(x => (!who_ || x.person === who_) && (!q || ((x.caption || '') + ' ' + about(x) + ' ' + who(x.by)).toLowerCase().includes(q)));
  L = L.slice().sort(so === 'old' ? (a, b) => String(a.at).localeCompare(String(b.at)) : so === 'az' ? (a, b) => (a.caption || '').localeCompare(b.caption || '', 'uk') : so === 'who' ? (a, b) => about(a).localeCompare(about(b), 'uk') || String(b.at).localeCompare(String(a.at)) : (a, b) => String(b.at).localeCompare(String(a.at)));
  return `<div class="lede"><h1>Голоси роду</h1><p class="small muted">${all.length} ${all.length % 10 === 1 && all.length % 100 !== 11 ? 'запис' : [2, 3, 4].includes(all.length % 10) && ![12, 13, 14].includes(all.length % 100) ? 'записи' : 'записів'} — спогади рідних їхніми голосами.</p></div>
  <div class="tbar vbar"><input class="in" id="vq" type="search" placeholder="Пошук: назва, про кого, хто записав" value="${esc(S.ui.vq || '')}">
    <select class="in" data-vsel="vwho" title="Про кого"><option value="">Про всіх</option>${subj.map(([id, t]) => `<option value="${esc(id)}"${id === who_ ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>
    <select class="in" data-vsel="vso" title="Сортування">${[['new', 'Спершу нові'], ['old', 'Спершу старі'], ['who', 'За людиною'], ['az', 'За назвою']].map(([k, t]) => `<option value="${k}"${k === so ? ' selected' : ''}>${t}</option>`).join('')}</select>
    <button class="btn wine small" data-act="v-rec" title="Записати історію">🎙<span class="vbl"> Записати історію</span></button></div>
  ${L.length ? `<div class="vlist" id="vlist-all">${L.map(voiceRow).join('')}</div>` : `<p class="small muted">${all.length ? 'Нічого не знайдено — змініть пошук.' : 'Ще немає жодного запису.'}</p>`}`;
}
function voiceSec(p) {
  const L = voicesOf(p.id);
  return `<div class="sec"><h3>Голос і розповіді ${S.me ? `<button class="btn line small" data-act="v-rec" data-id="${p.id}">🎙 Записати спогад</button>` : ''}</h3>
    ${L.length ? `<div class="vlist">${L.map(voiceRow).join('')}</div>` : `<p class="muted small">Попросіть старших розповісти — про дитинство, війну, родичів, як жили в селі. Натисніть «Записати спогад», покладіть телефон поруч і просто розмовляйте. Голос збережеться назавжди.</p>`}</div>`;
}
let REC = null;
function openRec(pid) {
  const canRec = !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
  const fixed = pid && (P[pid] || FAM[String(pid).replace(/^fam:/, '')]); // відкрили з картки людини чи родини — «про кого» вже відомо
  const famOpts = S.data.families.map(f => `<option value="fam:${f.id}"${pid === 'fam:' + f.id ? ' selected' : ''}>${esc(f.title)}</option>`).join('');
  const pplOpts = `<option value="">Почніть вводити ім'я…</option>` + Object.values(P).sort((a, b) => full(a).localeCompare(full(b), 'uk')).map(x => `<option value="${x.id}">${esc(full(x))}${life(x) ? ' (' + esc(life(x)) + ')' : ''}</option>`).join('');
  const about = fixed ? `<p class="small muted">Про кого: ${P[pid] ? pLink(pid) : esc(FAM[pid.slice(4)].title) + ' (загальна історія)'}${canAdd(pid) ? '' : ' · запис з\'явиться для всіх після підтвердження Максимом'}. До 15 хвилин.</p>`
    : `<div class="rec-about"><div class="seg" role="tablist"><button type="button" class="on" data-act="rec-mode" data-v="p">Про людину</button><button type="button" data-act="rec-mode" data-v="fam">Загальна історія роду</button></div>
      <label class="f rec-p">Про кого розповідь<select class="in" id="rec-p">${pplOpts}</select></label>
      <label class="f rec-fam" hidden>Якого роду<select class="in" id="rec-fam">${famOpts}</select></label>
      <p class="small muted" style="margin:0">До 15 хвилин. Можна записати бабусю чи дідуся просто зараз — телефон поруч, і натисніть червону кнопку.</p></div>`;
  modal(`<h2>Записати історію</h2>${about}
    ${canRec ? `<div class="rec"><button class="recbtn" data-act="rec-go" aria-label="Почати запис"><span></span></button><div class="rec-t mono" id="rec-t">00:00</div><div class="rec-s small muted" id="rec-s">Натисніть червону кнопку, щоб почати</div></div>` : `<p class="small muted" id="rec-s">Цей браузер не вміє записувати звук — але можна завантажити готовий запис.</p>`}
    <div class="recfile"><span class="muted small">${canRec ? 'або' : ''}</span><label class="btn line small">📁 Завантажити готовий запис<input type="file" id="rec-f" accept="audio/*,.m4a,.mp3,.wav,.ogg,.opus,.webm" hidden></label><span class="small muted">диктофон телефона, WhatsApp, Viber… (mp3, m4a, wav, ogg; до 45 МБ)</span></div>
    <audio id="rec-a" controls hidden></audio>
    <label class="f">Хто розповідає і про що<input class="in" id="rec-c" placeholder="Напр.: «Баба Оля про війну і Веприк»"></label>
    <div class="btns"><button class="btn" data-act="rec-save" disabled>Зберегти</button><button class="btn line" data-act="rec-cancel">Скасувати</button><span class="msg" id="recmsg"></span></div>`);
  REC = { pid: fixed ? pid : '', mode: 'p', chunks: [], blob: null };
  $('#rec-f').onchange = e => { const f = e.target.files[0]; if (!f || !REC) return; if (REC.mr?.state === 'recording') REC.mr.stop();
    const m = $('#recmsg'); if (f.size > 45e6) { m.className = 'msg err'; m.textContent = 'Файл завеликий (понад 45 МБ). Розріжте запис на частини.'; return; }
    REC.blob = f; const a = $('#rec-a'); a.src = URL.createObjectURL(f); a.hidden = false; const s = $('#rec-s'); if (s) s.textContent = 'Обрано файл «' + f.name + '». Прослухайте й натисніть «Зберегти».';
    if (!$('#rec-c').value.trim()) $('#rec-c').value = f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').slice(0, 120);
    $('[data-act="rec-save"]').disabled = false; m.textContent = ''; };
}
// Завантаження аудіо: до 4 МБ — одним запитом, більше — частинами (сервер збирає)
async function voiceUpload(pid, cap, blob, onp) {
  const q = `person=${encodeURIComponent(pid)}&caption=${encodeURIComponent(cap)}`, CH = 3_900_000;
  if (blob.size <= CH) return api('/api/upload?' + q, { raw: blob });
  const n = Math.ceil(blob.size / CH), code = [...crypto.getRandomValues(new Uint8Array(10))].map(x => x.toString(16).padStart(2, '0')).join('');
  let r; for (let i = 0; i < n; i++) { onp?.(i, n); r = await api(`/api/upload?${q}&part=${code}&i=${i}&n=${n}`, { raw: blob.slice(i * CH, (i + 1) * CH) }); }
  return r;
}
async function recToggle() {
  if (!REC) return; const b = $('[data-act="rec-go"]'), s = $('#rec-s');
  if (REC.mr && REC.mr.state === 'recording') { REC.mr.stop(); return; }
  try {
    REC.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch { s.textContent = 'Немає доступу до мікрофона. Дозвольте його в налаштуваннях браузера.'; return; }
  const mt = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported?.(t)) || '';
  REC.mr = new MediaRecorder(REC.stream, { ...(mt ? { mimeType: mt } : {}), audioBitsPerSecond: 32000 }); REC.chunks = [];
  REC.mr.ondataavailable = e => { if (e.data.size) REC.chunks.push(e.data); };
  REC.mr.onstop = () => { clearInterval(REC.tm); REC.stream.getTracks().forEach(t => t.stop()); REC.blob = new Blob(REC.chunks, { type: REC.mr.mimeType || 'audio/webm' });
    const a = $('#rec-a'); if (a) { a.src = URL.createObjectURL(REC.blob); a.hidden = false; } b.classList.remove('on'); s.textContent = 'Готово. Прослухайте й натисніть «Зберегти» (або запишіть заново).'; const sv = $('[data-act="rec-save"]'); if (sv) sv.disabled = false; };
  REC.mr.start(1000); REC.t0 = Date.now(); b.classList.add('on'); s.textContent = 'Іде запис… Натисніть ще раз, щоб зупинити';
  const sv = $('[data-act="rec-save"]'); if (sv) sv.disabled = true; $('#rec-a').hidden = true;
  REC.tm = setInterval(() => { const sec = Math.floor((Date.now() - REC.t0) / 1000); const t = $('#rec-t'); if (t) t.textContent = String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0'); if (sec >= 900 && REC.mr.state === 'recording') REC.mr.stop(); }, 500);
}
function recStop() { try { if (REC?.mr?.state === 'recording') REC.mr.stop(); REC?.stream?.getTracks().forEach(t => t.stop()); clearInterval(REC?.tm); } catch {} REC = null; }

/* ── Цей день в історії роду ── */
function dayEvents() {
  const now = new Date(), out = [];
  const push = (dm, kind, ids, extra) => { if (!dm) return; let nx = new Date(now.getFullYear(), dm.m - 1, dm.d); const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()); if (nx < t0) nx = new Date(now.getFullYear() + 1, dm.m - 1, dm.d); out.push({ dm, kind, ids, extra, ny: nx.getFullYear(), days: Math.round((nx - t0) / 864e5) }); };
  Object.values(P).forEach(p => { push(dmOf(p.b), isLiving(p) ? 'bday' : 'born', [p.id]); push(dmOf(p.d), 'died', [p.id]); });
  S.data.unions.forEach(u => P[u.a] && P[u.b] && push(dmW(u.date), 'wed', [u.a, u.b]));
  S.data.documents.filter(d => d.type !== 'map').forEach(d => { const dm = dmOf(d.date); if (dm && !/народж|смерт|помер|вінчан|шлюб/i.test(d.title)) push(dm, 'doc', [], d); });
  return out.sort((a, b) => a.days - b.days || (a.dm.y || 0) - (b.dm.y || 0));
}
function evLine(e) {
  const y = e.dm.y, ago = e.ny - y, p = P[e.ids[0]];
  const t = e.kind === 'bday' ? `${pLink(p.id)} — день народження${ago > 0 ? `, ${ago} р.` : ''}${e.days === 0 ? ' 🎉' : ''}` : e.kind === 'born' ? `${y} — народи${p.sex === 'f' ? 'лася' : 'вся'} ${pLink(p.id)}` : e.kind === 'died' ? `${y} — помер${p.sex === 'f' ? 'ла' : ''} ${pLink(p.id)}` : e.kind === 'wed' ? (isLiving(P[e.ids[0]]) && isLiving(P[e.ids[1]]) ? `${pLink(e.ids[0])} і ${pLink(e.ids[1])} — річниця шлюбу${y && ago > 0 ? `, ${ago} р.` : ''}${e.days === 0 ? ' 💍' : ''}` : `${y ? y + ' — ' : ''}шлюб: ${pLink(e.ids[0])} і ${pLink(e.ids[1])}`) : `${y} — <a href="#" data-doc="${e.extra.id}">${esc(e.extra.title)}</a>`;
  return `<li class="ev-${e.kind}"><span class="ev-d mono">${e.dm.d} ${MONTHS_G[e.dm.m - 1]}</span><span>${t}</span></li>`;
}
function todayCard() {
  const E = dayEvents(), today = E.filter(e => e.days === 0), soon = E.filter(e => e.days > 0 && e.days <= 21), bd = soon.filter(e => e.kind === 'bday');
  const n = new Date();
  return `<div class="hcard"><h3>Цей день в історії роду <span class="small"><button class="btn line small" data-act="cal-open">📅 Календар</button></span></h3><p class="small muted" style="margin:-4px 0 8px">${n.getDate()} ${MONTHS_G[n.getMonth()]}</p>
    ${today.length ? `<ul class="evl">${today.map(evLine).join('')}</ul>` : `<p class="small muted">Сьогодні в документах роду подій немає.</p>`}
    ${soon.length ? `<h4>Найближчі три тижні</h4><ul class="evl">${soon.slice(0, 8).map(evLine).join('')}</ul>` : ''}
    ${bd.length ? `<p class="small muted">Не забудьте привітати: ${bd.map(e => pLink(e.ids[0])).join(', ')}.</p>` : ''}</div>`;
}


/* ── Календар роду: місяць туди-сюди, по днях — народження, смерті, шлюби, документи ── */
const MONTHS_N = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
function calHtml() {
  const now = new Date(), m = S.ui.calM ?? now.getMonth(), sel = S.ui.calD || (m === now.getMonth() ? now.getDate() : 1);
  const E = dayEvents().filter(e => e.dm.m - 1 === m), by = {}; E.forEach(e => (by[e.dm.d] ||= []).push(e));
  const y = now.getFullYear(), first = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
  const cells = []; for (let i = 0; i < first; i++) cells.push('<span class="cal-e"></span>');
  for (let d = 1; d <= days; d++) { const L = by[d] || [], bd = L.some(e => e.kind === 'bday'), today = m === now.getMonth() && d === now.getDate();
    cells.push(`<button class="cal-d${L.length ? ' has' : ''}${bd ? ' bd' : ''}${today ? ' today' : ''}${d === sel ? ' sel' : ''}" data-act="cal-day" data-v="${d}"><b>${d}</b>${L.length ? `<i>${L.length}</i>` : ''}</button>`); }
  const list = (by[sel] || []).sort((a, b) => (a.dm.y || 0) - (b.dm.y || 0));
  return `<div class="cal"><div class="cal-h"><button class="btn line small" data-act="cal-m" data-v="-1" aria-label="Попередній місяць">‹</button><b>${MONTHS_N[m]}</b><button class="btn line small" data-act="cal-m" data-v="1" aria-label="Наступний місяць">›</button>${m !== now.getMonth() ? '<button class="btn line small" data-act="cal-now">Сьогодні</button>' : ''}<span class="small muted">${E.length} подій за місяць</span></div>
    <div class="cal-w">${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'].map(x => `<span>${x}</span>`).join('')}</div><div class="cal-g">${cells.join('')}</div>
    <h4>${sel} ${MONTHS_G[m]}</h4>${list.length ? `<ul class="evl">${list.map(evLine).join('')}</ul>` : '<p class="small muted">Цього дня подій у документах роду немає.</p>'}
    <p class="small muted"><span class="cal-lg has"></span> є події · <span class="cal-lg bd"></span> день народження живого родича</p></div>`;
}
function openCal() { modal(`<h2>Календар роду</h2><div id="calbox">${calHtml()}</div><div class="btns"><button class="btn line" data-act="close">Закрити</button></div>`); }
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t) return; const a = t.dataset.act;
  if (a === 'cal-open') { S.ui.calM = null; S.ui.calD = null; openCal(); ev('open', 'calendar', 'cal'); return; }
  if (a === 'cal-m') { const now = new Date(); S.ui.calM = (((S.ui.calM ?? now.getMonth()) + +t.dataset.v) % 12 + 12) % 12; S.ui.calD = 1; $('#calbox').innerHTML = calHtml(); return; }
  if (a === 'cal-now') { S.ui.calM = null; S.ui.calD = null; $('#calbox').innerHTML = calHtml(); return; }
  if (a === 'cal-day') { S.ui.calD = +t.dataset.v; $('#calbox').innerHTML = calHtml(); return; }
});

/* ── Цифри роду ── */
function famStats() {
  const ps = Object.values(P), memo = {};
  const depth = id => { if (memo[id] != null) return memo[id]; memo[id] = 1; const p = P[id]; return (memo[id] = 1 + Math.max(0, ...[p.f, p.mo].filter(x => x && P[x]).map(depth))); };
  const gens = Math.max(0, ...ps.map(p => depth(p.id)));
  const born = ps.map(p => ({ p, y: yN(p.b) })).filter(x => x.y).sort((a, b) => a.y - b.y);
  const villages = new Set(ps.flatMap(p => [p.bp, p.dp]).filter(Boolean).map(v => v.split(',')[0].trim()));
  const pages = S.data.documents.reduce((s, d) => s + (d.pages || 0), 0);
  return { n: ps.length, m: ps.filter(p => p.sex === 'm').length, f: ps.filter(p => p.sex === 'f').length, gens, first: born[0], docs: S.data.documents.filter(d => d.type !== 'map').length, pages, photos: S.data.photos.filter(x => !isVoice(x) && !x.pending).length, voices: voicesOf().filter(x => !x.pending).length, villages: villages.size, members: Object.keys(S.data.names || {}).length, living: ps.filter(isLiving).length };
}
function statTiles() {
  const s = famStats();
  const T = [[s.n, 'людей у дереві'], [s.gens, 'поколінь'], [s.first ? s.first.y : '—', 'найдавніша дата народження'], [s.docs, 'архівних документів'], [s.photos, 'фото'], [s.voices, 'голосових спогадів'], [s.villages, 'сіл і міст'], [s.members, 'родичів на сайті']];
  return `<div class="tiles">${T.map(([v, t]) => `<a class="tile" href="#/stats"><b>${v}</b><span>${t}</span></a>`).join('')}</div>`;
}
const sortTh = (k, t, num) => `<th data-sort="${k}"${num ? ' data-num="1"' : ''}>${t}</th>`;
function vStats() {
  const s = famStats(), ps = Object.values(P);
  const fam = S.ui.stFam || '', sex = S.ui.stSex || '', y0 = +S.ui.stY0 || 0, y1 = +S.ui.stY1 || 0;
  const F = ps.filter(p => (!fam || (p.fam || []).includes(fam)) && (!sex || p.sex === sex) && (!y0 || (yN(p.b) || 0) >= y0) && (!y1 || (yN(p.b) || 9999) <= y1));
  // по десятиліттях
  const dec = {}; F.forEach(p => { const y = yN(p.b); if (y) { const d = Math.floor(y / 10) * 10; (dec[d] ||= { m: 0, f: 0, u: 0 })[p.sex === 'm' ? 'm' : p.sex === 'f' ? 'f' : 'u']++; } });
  const ds = Object.keys(dec).map(Number).sort((a, b) => a - b), mx = Math.max(1, ...ds.map(d => dec[d].m + dec[d].f + dec[d].u));
  const W = Math.max(320, ds.length * 34), H = 170;
  const chart = ds.length ? `<div class="chartbox"><svg viewBox="0 0 ${W} ${H + 30}" width="100%" height="${H + 30}" preserveAspectRatio="none" role="img" aria-label="Народження по десятиліттях">${ds.map((d, i) => { const v = dec[d], x = i * 34 + 6, hm = v.m / mx * H, hf = v.f / mx * H, hu = v.u / mx * H; return `<g><title>${d}-ті: ${v.m + v.f + v.u} (чол. ${v.m}, жін. ${v.f})</title><rect x="${x}" y="${H - hm}" width="22" height="${hm}" class="bm"/><rect x="${x}" y="${H - hm - hf}" width="22" height="${hf}" class="bf"/><rect x="${x}" y="${H - hm - hf - hu}" width="22" height="${hu}" class="bu"/><text x="${x + 11}" y="${H + 14}" text-anchor="middle">${String(d).slice(2)}</text>${i % 2 ? '' : `<text x="${x + 11}" y="${H + 27}" text-anchor="middle" class="yy">${d}</text>`}</g>`; }).join('')}</svg><p class="small muted"><span class="lg bm"></span> чоловіки <span class="lg bf"></span> жінки <span class="lg bu"></span> стать не вказано · наведіть на стовпчик, щоб побачити число</p></div>` : '<p class="muted">Немає дат народження за цими фільтрами.</p>';
  const cnt = (arr) => { const m = {}; arr.forEach(x => { if (x) m[x] = (m[x] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const nm = p => String(p.n || '').replace(/\s*\(.*?\)/g, '').trim();
  const sur = {}; F.forEach(p => { for (const x of [p.s, p.m].filter(Boolean)) { const k = x.split(/[\s/]/)[0]; (sur[k] ||= { n: 0, y: 9999, pl: new Set() }); sur[k].n++; const y = yN(p.b); if (y) sur[k].y = Math.min(sur[k].y, y); if (p.bp) sur[k].pl.add(p.bp.split(',')[0]); } });
  const life = F.map(p => ({ p, b: yN(p.b), d: yN(p.d) })).filter(x => x.b && x.d && x.d >= x.b).map(x => ({ ...x, a: x.d - x.b }));
  // точний вік (за повними датами, якщо є) — діти до 5 років окремо, у середній вік не входять
  const dOf = s => { const m = String(s || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/); return m ? new Date(+m[3], m[2] - 1, +m[1]) : null; };
  const ageX = x => { const b = dOf(x.p.b), d = dOf(x.p.d); return b && d && d >= b ? (d - b) / (365.25 * 864e5) : x.a; };
  const cent = {}; life.forEach(x => { const c = Math.floor(x.b / 100) + 1, g = (cent[c] ||= { a: [], k: 0 }); if (ageX(x) < 5) g.k++; else g.a.push(x.a); });
  const kidsAll = Object.values(cent).reduce((n, g) => n + g.k, 0);
  const kids = F.map(p => ({ p, k: (KIDS[p.id] || []).length })).filter(x => x.k).sort((a, b) => b.k - a.k);
  const places = cnt(F.map(p => p.bp && p.bp.split(',')[0].trim()));
  return `<div class="lede"><h1>Цифри роду</h1><p class="small muted">Усе пораховано з карток дерева — що більше внесемо, то точніше.</p></div>
  ${statTiles()}
  <div class="stbar"><select class="in" data-st="stFam" aria-label="Гілка"><option value="">Усі гілки</option>${S.data.families.map(f => `<option value="${f.id}"${fam === f.id ? ' selected' : ''}>${esc(f.title)}</option>`).join('')}</select>
    <select class="in" data-st="stSex" aria-label="Стать"><option value="">Чоловіки й жінки</option><option value="m"${sex === 'm' ? ' selected' : ''}>Чоловіки</option><option value="f"${sex === 'f' ? ' selected' : ''}>Жінки</option></select>
    <select class="in" data-st="stPer" aria-label="Період"><option value="">Усі роки</option>${[['1700-1799', 'XVIII ст.'], ['1800-1899', 'XIX ст.'], ['1900-1945', '1900–1945'], ['1946-1991', '1946–1991'], ['1992-2100', 'з 1992']].map(([v, t]) => `<option value="${v}"${S.ui.stPer === v ? ' selected' : ''}>${t}</option>`).join('')}<option value="own"${S.ui.stPer === 'own' ? ' selected' : ''}>Свій період…</option></select>
    ${S.ui.stPer === 'own' ? `<input class="in yr" data-st="stY0" inputmode="numeric" value="${y0 || ''}" placeholder="з року"><input class="in yr" data-st="stY1" inputmode="numeric" value="${y1 || ''}" placeholder="по рік">` : ''}
    <span class="small muted">${F.length} з ${ps.length}</span></div>
  <div class="sec"><h3>Народження по десятиліттях</h3>${chart}</div>
  <div class="stgrid">
    <div class="sec"><h3>Прізвища</h3><div class="tablebox"><table class="t sortable"><thead><tr>${sortTh(0, 'Прізвище')}${sortTh(1, 'Людей', 1)}${sortTh(2, 'Найраніше', 1)}<th>Звідки</th></tr></thead><tbody>${Object.entries(sur).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="mono">${v.n}</td><td class="mono">${v.y < 9999 ? v.y : '—'}</td><td class="small">${esc([...v.pl].join(', '))}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="sec"><h3>Найчастіші імена</h3><div class="tablebox"><table class="t sortable"><thead><tr>${sortTh(0, 'Чоловічі')}${sortTh(1, 'Скільки', 1)}</tr></thead><tbody>${cnt(F.filter(p => p.sex === 'm').map(nm)).slice(0, 15).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="mono">${v}</td></tr>`).join('')}</tbody></table></div>
      <div class="tablebox"><table class="t sortable"><thead><tr>${sortTh(0, 'Жіночі')}${sortTh(1, 'Скільки', 1)}</tr></thead><tbody>${cnt(F.filter(p => p.sex === 'f').map(nm)).slice(0, 15).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="mono">${v}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="sec"><h3>Найдовше прожили</h3><div class="tablebox"><table class="t sortable"><thead><tr>${sortTh(0, 'Хто')}${sortTh(1, 'Роки життя')}${sortTh(2, 'Вік', 1)}</tr></thead><tbody>${life.sort((a, b) => b.a - a.a).slice(0, 15).map(x => `<tr><td>${pLink(x.p.id)}</td><td class="mono">${x.b}–${x.d}</td><td class="mono">${x.a}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Немає</td></tr>'}</tbody></table></div>
      ${Object.keys(cent).length ? `<p class="small muted">Середній вік (за відомими датами, без дітей, що померли до 5 років): ${Object.entries(cent).map(([c, g]) => `${c === '18' ? 'XVIII' : c === '19' ? 'XIX' : c === '20' ? 'XX' : c === '21' ? 'XXI' : c} ст. — ${g.a.length ? Math.round(g.a.reduce((x, y) => x + y, 0) / g.a.length) + ' р. (' + g.a.length + ' люд.)' : '—'}`).join('; ')}.</p>
      ${kidsAll ? `<p class="small muted">Померли до 5 років: ${Object.entries(cent).filter(([, g]) => g.k).map(([c, g]) => `${c === '18' ? 'XVIII' : c === '19' ? 'XIX' : c === '20' ? 'XX' : c === '21' ? 'XXI' : c} ст. — ${g.k} ${g.k % 10 === 1 && g.k % 100 !== 11 ? 'дитина' : g.k % 10 >= 2 && g.k % 10 <= 4 && (g.k % 100 < 12 || g.k % 100 > 14) ? 'дитини' : 'дітей'}, це ${Math.round(g.k / (g.k + g.a.length) * 100)}% усіх, чиї роки життя відомі`).join('; ')}.</p>` : ''}` : ''}</div>
    ${(() => { const WN = { ww1: 'Перша світова', ww2: 'Друга світова', other: 'Інша' }, FN = { ret: 'повернувся', kil: 'загинув', mis: 'пропав безвісти', unk: 'невідомо' };
      const W = F.filter(p => p.war); if (!W.length) return '';
      const c = k => W.filter(p => p.war.f === k).length, fw = (p, k) => p.sex === 'f' ? FN[k].replace(/вся$/, 'лася').replace(/ув$/, 'ула').replace(/ав /, 'ала ') : FN[k];
      const ws = [...new Set(W.map(p => p.war.w))];
      return `<div class="sec war-st"><h3>Війни</h3><p class="small muted">Хто з роду воював (за базами «Пам'ять народу», ОБД, списками військкоматів).${ws.length > 1 ? ' ' + ws.map(w => `${WN[w]}: ${W.filter(p => p.war.w === w).length}`).join(', ') + '.' : ''}</p>
        <div class="war-n"><span><b>${W.length}</b> воювали</span><span><b>${c('kil')}</b> загинули</span><span><b>${c('mis')}</b> пропали безвісти</span><span><b>${c('ret')}</b> повернулися</span>${c('unk') ? `<span><b>${c('unk')}</b> доля невідома</span>` : ''}</div>
        <p class="small muted">Не повернулися ${c('kil') + c('mis')} з ${W.length} (${Math.round((c('kil') + c('mis')) / W.length * 100)}%).${W.some(p => p.war.h) ? ' * — що це саме наш родич, поки «Є припущення».' : ''}</p>
        <div class="tablebox"><table class="t sortable"><thead><tr>${sortTh(0, 'Хто')}${sortTh(1, 'Роки')}${sortTh(2, 'Війна')}${sortTh(3, 'Доля')}</tr></thead><tbody>${W.sort((a, b) => 'kilmisretunk'.indexOf(a.war.f) - 'kilmisretunk'.indexOf(b.war.f) || short(a).localeCompare(short(b), 'uk')).map(p => `<tr><td>${pLink(p.id)}${p.war.h ? ' *' : ''}</td><td class="mono">${esc(life_(p))}</td><td class="small">${WN[p.war.w]}</td><td class="small war-${p.war.f}">${fw(p, p.war.f)}</td></tr>`).join('')}</tbody></table></div></div>`; })()}
    <div class="sec"><h3>Найбільші родини</h3><div class="tablebox"><table class="t sortable"><thead><tr>${sortTh(0, 'Батько / мати')}${sortTh(1, 'Дітей', 1)}</tr></thead><tbody>${kids.slice(0, 15).map(x => `<tr><td>${pLink(x.p.id)} <span class="small muted">${esc(life_(x.p))}</span></td><td class="mono">${x.k}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="sec"><h3>Де народжувались</h3><div class="tablebox"><table class="t sortable"><thead><tr>${sortTh(0, 'Місце')}${sortTh(1, 'Людей', 1)}</tr></thead><tbody>${places.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="mono">${v}</td></tr>`).join('')}</tbody></table></div><a class="small" href="#/geo">Показати на карті роду →</a></div>
  </div>`;
}
const life_ = p => life(p);

/* ── Карта роду в часі ── */
const placeKey = s => String(s || '').split(',')[0].replace(/^(с\.|село|смт|м\.|місто|хутір|х\.)\s*/i, '').trim();
const PLACE0 = { 'Вороньки': [50.684, 31.587], 'Веприк': [50.676, 31.615], 'Лідин': [50.698, 31.674], 'Київ': [50.4501, 30.5234], 'Бровари': [50.511, 30.7909], 'Чернігів': [51.4982, 31.2893], 'Ніжин': [51.048, 31.8869], 'Бобровиця': [50.7469, 31.3886] }; // OpenStreetMap (research/11)
const placeLL = k => (CFG_().places || {})[k] || PLACE0[k] || null;
function geoEvents() {
  const E = [];
  Object.values(P).forEach(p => { const b = yN(p.b), d = yN(p.d);
    if (p.bp) E.push({ k: placeKey(p.bp), y: b, t: 'b', id: p.id });
    if (p.dp) E.push({ k: placeKey(p.dp), y: d, t: 'd', id: p.id });
    if (p.lp) String(p.lp).split(/[;]/).map(x => placeKey(x)).filter(Boolean).forEach(k => E.push({ k, y: d || (isLiving(p) ? new Date().getFullYear() : null), t: 'l', id: p.id })); });
  S.data.documents.filter(x => x.type !== 'map' && x.place).forEach(x => E.push({ k: placeKey(x.place.replace(/\(.*?\)/g, '')), y: yN(x.date), t: 'doc', doc: x.id }));
  return E.filter(e => e.k);
}
function vGeo() {
  const E = geoEvents(), ys = E.map(e => e.y).filter(Boolean), y0 = Math.min(...ys, 1780), y1 = new Date().getFullYear();
  const yr = S.ui.geoY || y1, win = S.ui.geoW || 'upto';
  const keys = [...new Set(E.map(e => e.k))], miss = keys.filter(k => !placeLL(k));
  return `<div class="lede"><h1>Карта роду</h1><p class="small muted">Де народжувались, жили й спочили наші — з карток і архівних документів. Пересувайте повзунок років.</p></div>
  <div class="geobar"><input type="range" id="geo-y" min="${y0}" max="${y1}" value="${yr}" aria-label="Рік"><b class="mono" id="geo-yl">${yr}</b>
    <div class="seg"><button data-act="geo-w" data-v="upto" class="${win === 'upto' ? 'on' : ''}">усе до цього року</button><button data-act="geo-w" data-v="dec" class="${win === 'dec' ? 'on' : ''}">лише ±10 років</button></div>
    <button class="btn line small" data-act="geo-play">▶ Програти історію</button></div>
  <div class="geomap" id="geomap"><div class="gm-tiles"></div><div class="gm-pins"></div><div class="gm-base">${Object.entries(BASES).map(([k, b]) => `<button type="button" data-act="map-base" data-v="${k}" class="${(S.ui.rtBase || 'sat') === k ? 'on' : ''}">${b.name}</button>`).join('')}</div><div class="gm-attr">${esc(BASES[S.ui.rtBase || 'sat'].attr)}</div><div class="gm-z"><button data-act="geo-z" data-v="1" aria-label="Збільшити">+</button><button data-act="geo-z" data-v="-1" aria-label="Зменшити">−</button></div></div>
  <div class="geolist" id="geolist"></div>
  ${miss.length ? `<div class="sec"><p class="small muted">Ще не стоять на карті: ${miss.map(k => `<b>${esc(k)}</b>`).join(', ')}.${canEdit() ? ' Натисніть назву нижче, потім клацніть на карті, де це місце.' : ''}</p>${canEdit() ? `<div class="btns">${miss.map(k => `<button class="btn line small" data-act="geo-place" data-k="${esc(k)}">📍 ${esc(k)}</button>`).join('')}</div>` : ''}</div>` : ''}
  ${canEdit() && Object.keys(CFG_().places || {}).length ? `<details class="small"><summary>Поставлені вручну місця</summary>${Object.entries(CFG_().places).map(([k, v]) => `<div>${esc(k)} — ${v.join(', ')} <button class="btn line small" data-act="geo-unplace" data-k="${esc(k)}">прибрати</button></div>`).join('')}</details>` : ''}`;
}
function geoMount() {
  const box = $('#geomap'); if (!box) return;
  const tiles = box.querySelector('.gm-tiles'), pins = box.querySelector('.gm-pins');
  const E = geoEvents(); const G = S.ui.geo ||= {};
  const pts = [...new Set(E.map(e => e.k))].map(placeLL).filter(Boolean);
  if (G.cx == null) { const xs = pts.map(([la, lo]) => merc(la, lo)); const mx = xs.length ? xs.reduce((a, b) => [a[0] + b[0], a[1] + b[1]]).map(v => v / xs.length) : merc(50.68, 31.6); G.cx = mx[0]; G.cy = mx[1]; const spread = xs.length > 1 ? Math.max(...xs.map(x => Math.abs(x[0] - mx[0])), ...xs.map(x => Math.abs(x[1] - mx[1]))) : 0; G.z = spread ? Math.max(5, Math.min(12, Math.log2((Math.min(box.clientWidth, box.clientHeight) / 2.6) / spread))) : 11; }
  const W = () => box.clientWidth, H = () => box.clientHeight; const cache = new Map();
  const paint = () => {
    const zt = Math.max(0, Math.min(BASES[S.ui.rtBase || 'sat'].max, Math.round(G.z))), S2 = 2 ** G.z, ts = 256 * 2 ** (G.z - zt), n = 2 ** zt;
    const x0 = (G.cx - W() / 2 / S2) / 256 * n, y0 = (G.cy - H() / 2 / S2) / 256 * n, x1 = (G.cx + W() / 2 / S2) / 256 * n, y1 = (G.cy + H() / 2 / S2) / 256 * n; const want = new Set();
    for (let ty = Math.floor(y0); ty <= Math.floor(y1); ty++) for (let tx = Math.floor(x0); tx <= Math.floor(x1); tx++) { if (ty < 0 || ty >= n) continue; const bk = S.ui.rtBase || 'sat', key = bk + '/' + zt + '/' + tx + '/' + ty; want.add(key); let el = cache.get(key);
      if (!el) { el = new Image(); el.alt = ''; el.draggable = false; el.onerror = () => { el.style.visibility = 'hidden'; }; el.referrerPolicy = 'strict-origin-when-cross-origin'; el.src = BASES[bk].url(zt, ((tx % n) + n) % n, ty); cache.set(key, el); tiles.appendChild(el); }
      el.style.transform = `translate(${(tx * 256 / n - G.cx) * S2 + W() / 2}px,${(ty * 256 / n - G.cy) * S2 + H() / 2}px) scale(${ts / 256})`; }
    for (const [k, el] of cache) if (!want.has(k)) { el.remove(); cache.delete(k); }
    // точки
    const yr = +($('#geo-y')?.value || 9999), win = S.ui.geoW || 'upto';
    const vis = E.filter(e => placeLL(e.k) && (e.y == null ? win === 'upto' : win === 'upto' ? e.y <= yr : Math.abs(e.y - yr) <= 10));
    const by = {}; vis.forEach(e => (by[e.k] ||= []).push(e));
    pins.innerHTML = Object.entries(by).map(([k, L]) => { const [la, lo] = placeLL(k), [wx, wy] = merc(la, lo), r = Math.min(46, 12 + Math.sqrt(L.length) * 5);
      return `<button class="gpin" data-act="geo-pin" data-k="${esc(k)}" style="left:${(wx - G.cx) * S2 + W() / 2}px;top:${(wy - G.cy) * S2 + H() / 2}px;width:${r * 2}px;height:${r * 2}px" title="${esc(k)}: ${L.length}"><b>${L.length}</b><span>${esc(k)}</span></button>`; }).join('');
    const gl = $('#geolist'); if (gl) { const k = S.ui.geoK && by[S.ui.geoK] ? S.ui.geoK : Object.keys(by).sort((a, b) => by[b].length - by[a].length)[0]; const L = (by[k] || []).slice().sort((a, b) => (a.y || 0) - (b.y || 0));
      gl.innerHTML = k ? `<h3>${esc(k)} <span class="small muted">${L.length} подій ${win === 'upto' ? 'до ' + yr : 'у ' + (yr - 10) + '–' + (yr + 10)}</span></h3><ul class="evl">${L.slice(-40).reverse().map(e => `<li><span class="ev-d mono">${e.y || '—'}</span><span>${e.t === 'doc' ? `<a href="#" data-doc="${e.doc}">${esc(S.data.documents.find(d => d.id === e.doc)?.title || '')}</a>` : `${e.t === 'l' ? (P[e.id].d ? 'жив' + (P[e.id].sex === 'f' ? 'ла' : '') : 'живе') : e.t === 'b' ? 'народи' + (P[e.id].sex === 'f' ? 'лася' : 'вся') : 'помер' + (P[e.id].sex === 'f' ? 'ла' : '') + ' / похован' + (P[e.id].sex === 'f' ? 'а' : 'ий')} ${pLink(e.id)}`}</span></li>`).join('')}</ul>` : '<p class="muted small">Немає подій у цей час.</p>'; }
  };
  G.paint = paint; paint();
  const pts_ = new Map(); let st = null, pin = null;
  box.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; pts_.set(e.pointerId, [e.clientX, e.clientY]); box.setPointerCapture?.(e.pointerId); if (pts_.size === 1) st = { x: e.clientX, y: e.clientY, cx: G.cx, cy: G.cy, moved: false }; if (pts_.size === 2) { const [[a, b], [c, d]] = [...pts_.values()]; pin = { d: Math.hypot(a - c, b - d), z: G.z }; } });
  box.addEventListener('pointermove', e => { if (!pts_.has(e.pointerId)) return; pts_.set(e.pointerId, [e.clientX, e.clientY]); if (pts_.size === 2 && pin) { const [[a, b], [c, d]] = [...pts_.values()]; G.z = Math.max(4, Math.min(17, pin.z + Math.log2(Math.hypot(a - c, b - d) / pin.d))); paint(); return; } if (st) { const S1 = 2 ** G.z; if (Math.abs(e.clientX - st.x) + Math.abs(e.clientY - st.y) > 4) st.moved = true; G.cx = st.cx - (e.clientX - st.x) / S1; G.cy = st.cy - (e.clientY - st.y) / S1; paint(); } });
  const up = async e => { const was = st; pts_.delete(e.pointerId); if (pts_.size < 2) pin = null; if (!pts_.size) st = null;
    if (was && !was.moved && S.ui.geoPlacing && e.type === 'pointerup') { const r = box.getBoundingClientRect(), S1 = 2 ** G.z, wx = G.cx + (e.clientX - r.left - W() / 2) / S1, wy = G.cy + (e.clientY - r.top - H() / 2) / S1;
      const lon = wx / 256 * 360 - 180, lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * wy / 256))) * 180 / Math.PI, k = S.ui.geoPlacing; S.ui.geoPlacing = null; box.classList.remove('placing');
      try { const rr = await api('/api/data', { body: { op: 'place.set', name: k, lat, lon } }); S.data.cfg.places = rr.places; S.ui.keepScroll = true; render(); toast(`«${k}» поставлено на карту`); } catch (err) { toast(errText(err)); } } };
  box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
  box.addEventListener('wheel', e => { e.preventDefault(); const r = box.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, S1 = 2 ** G.z, nz = Math.max(4, Math.min(17, G.z - e.deltaY / 300)), S2 = 2 ** nz, wx = G.cx + (sx - W() / 2) / S1, wy = G.cy + (sy - H() / 2) / S1; G.cx = wx - (sx - W() / 2) / S2; G.cy = wy - (sy - H() / 2) / S2; G.z = nz; paint(); }, { passive: false });
  $('#geo-y')?.addEventListener('input', e => { S.ui.geoY = +e.target.value; $('#geo-yl').textContent = e.target.value; paint(); });
  if (S.ui.geoPlacing) box.classList.add('placing');
}

/* ── Допоможіть знайти ── */
function wantList(max) {
  const L = (CFG_().wanted || []).filter(x => !x.done);
  return L.length ? `<ul class="wantl">${L.slice(0, max || 999).map(x => { const n = S.data.stories.filter(s => s.target === 'want:' + x.id).length; return `<li><button class="wantc" data-act="want-open" data-id="${x.id}"><b>${esc(x.text)}</b>${x.person && P[x.person] ? `<i>${esc(short(P[x.person]))}</i>` : ''}<span class="small muted">${n ? n + ' відповід.' : 'ще без відповіді'}</span></button></li>`; }).join('')}</ul>` : `<p class="small muted">Поки немає відкритих питань.</p>`;
}
function missing() { // чого бракує: прямі предки й найближчі без фото / дат
  const me = S.me?.person_id || rootId(); const A = ancD(me); const near = [...A.keys()].filter(x => x !== me && A.get(x) <= 4);
  return { noPhoto: near.filter(x => !P[x].portrait && (yN(P[x].b) || 0) >= 1860), noDate: near.filter(x => !yN(P[x].b)), noParents: near.filter(x => !P[x].f && !P[x].mo && A.get(x) <= 3) };
}
/* ───── Словник і джерела (#/terms): що за документи ми читаємо і що означають старі слова. Кожне пояснення — з джерелом. ───── */
const TERMS = [
  ['Документи XVIII століття', [
    ['Румʼянцевський опис (1765–1769)', 'Великий перепис Гетьманщини, який провів генерал-губернатор Петро Румʼянцев за інструкцією Катерини II. По кожному двору записували людей (вік, чи здорові, чи можуть працювати), податки, ріллю, сінокоси, млини, пасіки, худобу й документи на землю. Через війну з Туреччиною опис зупинили 1769 року. Зберігається в ЦДІАК України, фонд 57: Вороньки — справа 169, Веприк — справа 170.', 'https://uk.wikipedia.org/wiki/Вікіпедія:Проєкт:Енциклопедія_історії_України/Статті/ГЕНЕРАЛЬНИЙ_ОПИС_ЛІВОБЕРЕЖНОЇ_УКРАЇНИ_1765–1769'],
    ['Перепис 1782 року (4-та ревізія)', 'У 1782 році в Російській імперії провели 4-ту ревізію — перепис населення для подушного податку. На Лівобережжі ревізії почалися саме тоді, одразу після скасування полкового устрою. Подвірний перепис Вороньків 1782 року (там знайдено двір Трохима Шутого) зберігається в ЦДІАК, фонд 57, опис 1, справа 435.', 'https://uk.wikipedia.org/wiki/Ревізія_(перепис_населення)'],
    ['Генеральне слідство про маєтності (1729–1731)', 'Перевірка земельної власності в усіх полках Гетьманщини: писарі розпитували старожилів, коли засновано маєток і чий він, і переписували грамоти та універсали. Книги Переяславського полку надруковано в 1893–1931 роках.', 'https://uk.wikipedia.org/wiki/Вікіпедія:Проєкт:Енциклопедія_історії_України/Статті/ГЕНЕРАЛЬНЕ_СЛІДСТВО_ПРО_МАЄТНОСТІ'],
    ['Малоросійська колегія', 'Установа, яка керувала Лівобережною Україною після скасування гетьманства (1764–1786). Очолював її граф Петро Румʼянцев; саме вона провела Румʼянцевський опис.', 'https://uk.wikipedia.org/wiki/Друга_Малоросійська_колегія'],
  ]],
  ['Церковні й державні записи', [
    ['Метрична книга', 'Церковна книга записів про хрещення (народження), вінчання і похорон. Зразок затвердили 1724 року. Вели у двох примірниках: один лишався в церкві, другий ішов до консисторії — тому часто збереглися обидва.', 'https://uk.wikipedia.org/wiki/Метрична_книга'],
    ['Сповідний розпис (сповідна відомість)', 'Щорічний список парафіян по дворах із віком кожного: хто був на сповіді, а хто ні. Запроваджений 1722 року.', 'https://uk.wikipedia.org/wiki/Сповідний_розпис'],
    ['Ревізька казка', 'Список жителів, складений під час ревізії: господар двору, родина, вік і ким доводяться главі сімʼї. Ревізій було десять: 1719, 1742, 1762, 1782, 1795, 1811, 1816, 1835, 1850, 1858.', 'https://uk.wikipedia.org/wiki/Ревізька_казка'],
    ['ЗАГС / РАЦС (ДРАЦС), актовий запис', 'Державні органи, які з 1917–1919 років реєструють народження, шлюби й смерті. Запис у їхній книзі — «актовий запис», на його підставі видають свідоцтво. Книги 75 років зберігаються у відділі ДРАЦС і лише потім переходять до обласного архіву — тому про смерть 1986 року треба питати в ДРАЦС, а не в архіві.', 'https://sud.ua/uk/news/ukraine/337134-gde-vzyat-svidetelstvo-cherez-75-let-obyasnenie-minyusta'],
    ['Погосподарська книга', 'Книга обліку в сільраді (з 1935 року): на кожне господарство окремий рахунок — хто в ньому живе, дати народження, робота, земля, худоба. Там же позначали, хто помер чи вибув.', 'https://uk.wikipedia.org/wiki/Погосподарські_книги'],
  ]],
  ['Люди й стани', [
    ['Шутий (старе слово)', 'У «Словарі української мови» Бориса Грінченка — той, кому бракує чогось звичного: безрогий (віл, корова), безвухий чи безхвостий; «шутий чоловік» — безвухий або лисий (цей приклад записано в Козелецькому повіті). Від такого прізвиська, ймовірно, і пішло прізвище Шутий.', 'https://uk.wikisource.org/wiki/Словарь_української_мови_(1924)/шутий'],
    ['Посполиті', 'Селяни Лівобережжя XVII–XVIII ст.: платили податки й відробляли повинності на власника або на державу. Указ Катерини II від 3 травня 1783 року остаточно закріпачив посполитих.', 'https://uk.wikipedia.org/wiki/Посполиті'],
    ['Підсусідки', 'Бідні селяни без власного господарства, які жили в чужому дворі «у сусідах» і за житло працювали на господаря. Після 1783 року більшість стали кріпаками.', 'https://uk.wikipedia.org/wiki/Підсусідки'],
    ['Служитель (у переписах)', 'Людина, що служила чи працювала в чужій родині — наймит або слуга. Записували окремо від членів родини.', 'https://history.znu.edu.ua/index.php/journal/article/download/2302/2188/4200'],
    ['Козаки виборні й підпомічники', 'Виборні — заможні козаки, які йшли в похід за свій кошт; підпомічники — бідніші, що допомагали їм кіньми, харчами, зброєю. 1783 року козацькі привілеї скасували.', 'https://uk.wikipedia.org/wiki/Виборні_козаки'],
    ['Державні (казенні) селяни', 'Селяни на державній землі: особисто вільні, але платили державі.', 'https://uk.wikipedia.org/wiki/Державні_селяни'],
    ['Селянин-власник (собственник)', 'Після скасування кріпацтва (1861) колишній кріпак спершу був «тимчасово зобовʼязаним»; коли викупав наділ — ставав «селянином-власником». Так записано багатьох наших предків у метриках 1880–1910-х.', 'https://uk.wikipedia.org/wiki/Тимчасово_зобов\'язані_селяни'],
  ]],
  ['Земля й місцевість', [
    ['Гетьманщина', 'Українська козацька держава середини XVII–XVIII ст. 1764 року Катерина II скасувала гетьманство, 1781 року — полковий устрій.', 'https://uk.wikipedia.org/wiki/Гетьманщина'],
    ['Полк і сотня', 'У Гетьманщині — водночас військові частини й округи. Полком керував полковник, сотнею — сотник.', 'https://uk.wikipedia.org/wiki/Полковий_устрій_Гетьманщини'],
    ['Басанська сотня Переяславського полку', 'Сотня з центром у містечку Басань; до неї належали Вороньки й Веприк. Переяславський полк скасували 1781 року, його землі ввійшли до Київського намісництва.', 'https://uk.wikipedia.org/wiki/Басанська_сотня'],
    ['Урочище', 'Народна назва місцевості, що чимось вирізняється: поле, ліс, могила, балка. У переписі 1782 року є урочища «Шутова могила» і «Шутого гребля».', 'https://uk.wikipedia.org/wiki/Урочище'],
    ['Гребля', 'Насип через річку чи потік, щоб підняти воду — найчастіше для млина; по ній ще й їздили.', 'https://uk.wikipedia.org/wiki/Гребля'],
    ['Копиця', 'Невелика купа сіна на сінокосі. Сінокоси в старих описах міряли тим, скільки копиць з них збирали.', 'https://uk.wikipedia.org/wiki/Копиця'],
    ['Нива «на N днів»', 'Так у старих описах міряли поле: «нива на два дні» — ділянка, яку можна було зорати приблизно за два дні. Це обсяг роботи, а не точна площа в гектарах.', 'https://ekmair.ukma.edu.ua/server/api/core/bitstreams/3809074d-a001-4a37-bbea-2e942bcfb4d6/content'],
    ['Упряж', 'У місцевому вжитку — ділянка, яку зорювали за один проміжок роботи коней (чи волів) до відпочинку. Сталого розміру не мала.', 'https://kul.pnu.edu.ua/wp-content/uploads/sites/46/2018/11/Visnyk_Filolohiia_2012_Vypusk_-XXXII-XXXIII_Chast_1.pdf'],
  ]],
  ['Архіви й сайти', [
    ['ЦДІАК України', 'Центральний державний історичний архів у Києві: документи Гетьманщини й Російської імперії до 1917 року, зокрема Румʼянцевський опис і перепис 1782 року.', 'https://uk.wikipedia.org/wiki/Центральний_державний_історичний_архів_України_(Київ)'],
    ['ДАЧО', 'Державний архів Чернігівської області: метричні книги Покровської церкви Вороньків (з 1780 р.) і Троїцької церкви Веприка (з 1762 р.).', 'https://nashipredki.com/familysearch/819422'],
    ['FamilySearch', 'Некомерційна генеалогічна організація, яка безкоштовно фотографує архіви всього світу. У Чернігівському архіві знімала з 1993 по 2011 рік — тому скани наших метрик і переписів можна переглянути вдома.', 'https://uk.wikipedia.org/wiki/FamilySearch'],
  ]],
  ['Війна', [
    ['«Память народа», ОБД «Мемориал», ЦАМО', 'Сайти Міністерства оборони РФ з документами про учасників війни 1941–1945 років: нагородні листи, картки, донесення про втрати. Оригінали — у Центральному архіві Міністерства оборони (ЦАМО) в Подольську.', 'https://ru.wikipedia.org/wiki/Память_народа'],
    ['Донесення про безповоротні втрати', 'Списки, які військові частини надсилали про загиблих, пропалих безвісти й полонених — тих, хто вже не повернувся в стрій.', 'https://ru.wikipedia.org/wiki/Потери_в_Великой_Отечественной_войне'],
    ['Пропав безвісти', 'Так записували людину, про долю якої не було точних відомостей — це не те саме, що «загинув». Багато таких людей потрапили в полон або загинули, частина вижила. Сповіщення давало сімʼї право на пенсію.', 'https://narodnoe.org/downloads/states/13933'],
    ['Ювілейне нагородження 1985 року', 'До 40-річчя Перемоги (указ від 11 березня 1985 р.) орден Вітчизняної війни отримали всі тоді живі фронтовики: І ступінь — поранені й ті, хто мав бойові нагороди, ІІ ступінь — решта.', 'https://ru.wikipedia.org/wiki/Орден_Отечественной_войны'],
    ['Евакогоспіталь', 'Госпіталь воєнного часу в тилу, де лікували поранених і хворих.', 'https://ru.wikipedia.org/wiki/Эвакуационный_госпиталь'],
  ]],
  ['Книги памʼяті', [
    ['Національна книга памʼяті жертв Голодомору (2008)', 'Видана на замовлення Українського інституту національної памʼяті: загальний том і 18 обласних. Том «Чернігівська область» містить списки померлих по селах, складені за книгами реєстрації смертей, і спогади свідків.', 'https://uk.wikipedia.org/wiki/Національна_книга_пам\'яті_жертв_Голодомору_1932—1933_років_в_Україні'],
    ['«Реабілітовані історією»', 'Багатотомна серія книг про жертв політичних репресій — по томах на кожну область.', 'https://uk.wikipedia.org/wiki/Реабілітовані_історією'],
    ['«Открытый список»', 'Громадська інтернет-база про людей, репресованих у СРСР у 1917–1991 роках.', 'https://ru.wikipedia.org/wiki/Открытый_список_(база_данных)'],
  ]],
];
function vTerms() {
  const q = (S.ui.trq || '').toLowerCase();
  const G = TERMS.map(([g, L]) => [g, L.filter(t => !q || (t[0] + ' ' + t[1]).toLowerCase().includes(q))]).filter(x => x[1].length);
  return `<div class="lede"><h1>Словник і джерела</h1><p class="small muted">Що за документи ми читаємо і що означають старі слова. До кожного пояснення — посилання, звідки воно. Місцеві слова, які казали наші, — у розділі <a href="#/words">«Наші слова» →</a></p></div>
  <div class="stbar"><input class="in" id="trq" type="search" placeholder="Знайти слово…" value="${esc(S.ui.trq || '')}" aria-label="Пошук у словнику"></div>
  <div class="terms">${G.map(([g, L]) => `<div class="sec"><h3>${esc(g)}</h3>${L.map(([t, d, u]) => `<div class="term"><b>${esc(t)}</b><p>${esc(d)}</p><a class="small" href="${esc(u)}" target="_blank" rel="noopener">Джерело ↗</a></div>`).join('')}</div>`).join('') || '<p class="muted">Нічого не знайдено.</p>'}</div>`;
}

/* ───── Сімейні маршрути: прогулянка місцями родини з історіями біля кожної точки (своя проста карта OSM) ───── */
const RT_K = { home: ['🏠', 'Дім'], school: ['🏫', 'Школа'], work: ['🛠', 'Робота'], church: ['⛪', 'Церква'], grave: ['✝', 'Кладовище'], war: ['🎖', 'Пам\'ять війни'], other: ['📍', 'Інше'] };
const RTS = () => CFG_().routes || [];
/* Координати: «50°41'10.2"N 31°38'02.9"E», «50 41 10.2 N 31 38 2.9 E», «50.68617, 31.63414» → [широта, довгота] */
function parseLL(t) {
  t = String(t || '').trim().replace(/[′’‘`]/g, "'").replace(/[″“”]/g, '"').replace(/''/g, '"');
  if (/^-?\d+,\d+\s+-?\d+,\d+$/.test(t)) t = t.replace(/(\d),(\d)/g, '$1.$2');
  if (!/[°']/.test(t) && /[NSEW]/i.test(t)) { const parts = t.match(/[^NSEW]+[NSEW]/gi) || []; if (parts.length >= 2) t = parts.slice(0, 2).map(q => { const n = q.match(/\d+(?:\.\d+)?/g) || []; return (n[0] || '') + '°' + (n[1] ? n[1] + "'" : '') + (n[2] ? n[2] + '"' : '') + q.slice(-1); }).join(' '); }
  const re = /(-?\d+(?:\.\d+)?)\s*°?\s*(?:(\d+(?:\.\d+)?)\s*'\s*(?:(\d+(?:\.\d+)?)\s*"?)?)?\s*([NSEW])?/gi;
  let v = [...t.matchAll(re)].slice(0, 2).map(m => { let x = Math.abs(+m[1]) + (+m[2] || 0) / 60 + (+m[3] || 0) / 3600; if (+m[1] < 0 || /[SW]/i.test(m[4] || '')) x = -x; return { x, h: (m[4] || '').toUpperCase() }; });
  if (v.length < 2 || v.some(o => !isFinite(o.x))) return null;
  if (v[0].h === 'E' || v[0].h === 'W') v = [v[1], v[0]];
  const [la, lo] = [v[0].x, v[1].x]; return Math.abs(la) <= 90 && Math.abs(lo) <= 180 ? [la, lo] : null;
}
// «Цифри роду»: довгі таблиці згорнуті до ~8 рядків, кнопка «Показати всі (N)» / «Згорнути»; стан пам'ятаємо в S.ui.stOpen
function stFold() {
  const open = (S.ui.stOpen ||= {});
  document.querySelectorAll('.stgrid .tablebox').forEach((b, i) => {
    if (b.dataset.fold) return; b.dataset.fold = '1';
    const n = b.querySelectorAll('tbody tr').length; if (n <= 8) return;
    const k = (b.closest('.sec')?.querySelector('h3')?.textContent || '') + ':' + i;
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn line small stmore';
    const set = () => { const o = !!open[k]; b.classList.toggle('folded', !o); btn.textContent = o ? 'Згорнути ▲' : `Показати всі (${n}) ▼`; };
    btn.onclick = () => { open[k] = !open[k]; set(); };
    b.after(btn); set();
  });
}
function vRoutes() {
  const R = RTS(), r = S.arg && R.find(x => x.id === S.arg);
  if (!r) return `<div class="lede"><h1>Сімейні маршрути</h1><p class="small muted">Прогулянка місцями родини: де стояла хата, куди ходили до школи, де працювали, де спочивають. Біля кожної точки — історія. Можна пройти маршрут удома на екрані або справді, з телефоном у руці.</p></div>
    ${S.me ? `<div class="btns" style="margin:0 0 12px"><button class="btn" data-act="rt-new">＋ Новий маршрут</button></div>` : ''}
    <div class="rtlist">${R.map(x => `<a class="sec rtcard" href="${href('routes', x.id)}"><b>${esc(x.title)}</b><span class="small muted">${x.pts.length} точок · склав(ла) ${esc(who(x.by))}</span>${x.intro ? `<p class="small">${esc(x.intro.slice(0, 180))}${x.intro.length > 180 ? '…' : ''}</p>` : ''}<span class="rtk">${[...new Set(x.pts.map(q => RT_K[q.kind][0]))].join(' ')}</span></a>`).join('') || '<p class="muted">Маршрутів ще немає. Створіть перший — наприклад «Вороньки бабусі Насті»: хата, школа, колгосп, церква, кладовище.</p>'}</div>`;
  const can_ = S.me && (r.by === S.me.id || canEdit()), ed = can_ && S.ui.rtEd === r.id, i = Math.min(S.ui.rtI ?? -1, r.pts.length - 1);
  const gm = r.pts.length ? `https://www.google.com/maps/dir/${r.pts.map(q => q.la + ',' + q.lo).join('/')}` : '';
  return `<div class="lede"><div class="eyebrow"><a href="#/routes">Сімейні маршрути</a></div><h1>${esc(r.title)}</h1><p class="small muted">${r.pts.length} точок · склав(ла) ${esc(who(r.by))}</p></div>
  ${r.intro && !ed ? `<p class="rtintro">${esc(r.intro)}</p>` : ''}
  ${ed ? `<div class="sec" style="gap:8px"><label class="f">Назва<input class="in" id="rt-t" value="${esc(r.title)}"></label><label class="f">Про маршрут<textarea class="in" id="rt-i">${esc(r.intro || '')}</textarea></label></div>` : ''}
  <div class="rtbar">${r.pts.length ? `<button class="btn small" data-act="rt-go" data-v="-1">◀</button><button class="btn small" data-act="rt-go" data-v="1">${i < 0 ? '▶ Пройти маршрут' : 'Далі ▶'}</button>` : ''}
    ${gm ? `<a class="btn line small" href="${esc(gm)}" target="_blank" rel="noopener">🧭 Прокласти в Google Картах</a>` : ''}
    ${can_ ? (ed ? `<button class="btn small" data-act="rt-done">✓ Готово</button><span class="small muted">Клацніть на карті або вставте координати:</span><span class="rtll"><input class="in" id="rt-ll" placeholder="50°41'10.2&quot;N 31°38'02.9&quot;E" title="Формат як у Google Картах: 50°41'10.2&quot;N 31°38'02.9&quot;E або 50.68617, 31.63414" autocomplete="off"><button class="btn small" data-act="rt-ll">＋ Точка</button></span>` : `<button class="btn line small" data-act="rt-edit">✎ Редагувати</button>`) : ''}
    ${can_ && ed ? `<button class="btn line small danger" data-act="rt-del">Видалити маршрут</button>` : ''}</div>
  <div class="rtwrap"><div class="geomap rtmap" id="rtmap"><div class="gm-tiles"></div><svg class="rt-line"></svg><div class="gm-pins"></div><div class="gm-base">${Object.entries(BASES).map(([k, b]) => `<button type="button" data-act="map-base" data-v="${k}" class="${(S.ui.rtBase || 'sat') === k ? 'on' : ''}">${b.name}</button>`).join('')}</div><div class="gm-attr">${esc(BASES[S.ui.rtBase || 'sat'].attr)}</div><div class="gm-z"><button data-act="rt-z" data-v="1" aria-label="Збільшити">+</button><button data-act="rt-z" data-v="-1" aria-label="Зменшити">−</button></div></div>
  <ol class="rtpts">${r.pts.map((q, k) => `<li class="${k === i ? 'on' : ''}" id="rtp-${k}"><button class="rtpt" data-act="rt-pick" data-v="${k}"><span class="rtn">${k + 1}</span><span><b>${RT_K[q.kind][0]} ${esc(q.name)}</b>${q.yr ? ` <i class="small muted">${esc(q.yr)}</i>` : ''}</span></button>
    ${q.people.length ? `<div class="small">${q.people.filter(x => P[x]).map(pLink).join(', ')}</div>` : ''}${q.story ? `<p>${esc(q.story).replace(/\n/g, '<br>')}</p>` : ''}${rtMedia(q, ed)}
    ${ed ? `<div class="btns"><button class="btn line small" data-act="rt-pe" data-v="${k}">✎</button><button class="btn line small" data-act="rt-up" data-v="${k}" ${k ? '' : 'disabled'}>↑</button><button class="btn line small" data-act="rt-dn" data-v="${k}" ${k < r.pts.length - 1 ? '' : 'disabled'}>↓</button><button class="btn line small" data-act="rt-pd" data-v="${k}">✕</button></div>` : ''}</li>`).join('') || '<li class="muted small">Точок ще немає.' + (can_ ? ' Натисніть «Редагувати» і клацніть на карті.' : '') + '</li>'}</ol></div>
  <div class="sec"><h3>Спогади про ці місця</h3>${S.data.stories.filter(x => x.target === 'rt:' + r.id).map(x => `<div class="story"><p>${esc(x.text)}</p><span class="small muted">— ${esc(who(x.by))}, ${esc(when(x.at))}</span></div>`).join('')}${S.me ? storyForm('rt:' + r.id) : ''}</div>`;
}
async function rtSave(r, patch) {
  const body = { op: 'route.save', id: r?.id || '', title: r?.title || '', intro: r?.intro || '', pts: r?.pts || [], ...patch };
  const res = await api('/api/data', { body }); S.data.cfg.routes = res.routes; return res;
}
// YouTube: посилання будь-якого виду → id відео (11 символів)
const ytId = t => { t = String(t || '').trim(); const m = t.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/) || t.match(/^([\w-]{11})$/); return m ? m[1] : ''; };
// фото й відео біля точки маршруту
function rtMedia(q, edit) {
  const M = q.media || []; if (!M.length) return '';
  return `<div class="rtmed">${M.map((x, j) => x.p ? (S.data.photos.some(y => y.id === x.p) ? `<button type="button" class="rtm" data-act="rt-ph" data-v="${esc(x.p)}" title="Відкрити фото"><img src="${img('photo=' + x.p, 1)}" alt="" loading="lazy"></button>` : edit ? `<span class="rtm rtm-wait" title="Фото чекає підтвердження власника">⏳</span>` : '')
    : `<button type="button" class="rtm rtm-yt" data-act="rt-yt" data-v="${esc(x.yt)}" title="Дивитися відео"><img src="https://i.ytimg.com/vi/${esc(x.yt)}/mqdefault.jpg" alt="" loading="lazy" referrerpolicy="no-referrer"><span>▶</span></button>`).join('')}</div>`;
}
function rtPointForm(r, k, ll) {
  const q = k != null ? r.pts[k] : { name: '', kind: 'home', people: [], story: '', yr: '', la: ll[0], lo: ll[1], media: [] }; let ppl = q.people.slice(), med = (q.media || []).slice();
  modal(`<h2>${k != null ? 'Змінити точку' : 'Нова точка'}</h2><div class="sec" style="gap:10px">
    <label class="f">Що тут<input class="in" id="rp-n" maxlength="120" value="${esc(q.name)}" placeholder="Напр.: «Хата Терентія Шутого»"></label>
    <label class="f">Тип<select class="in" id="rp-k">${Object.entries(RT_K).map(([v, [ic, t]]) => `<option value="${v}"${q.kind === v ? ' selected' : ''}>${ic} ${t}</option>`).join('')}</select></label>
    <label class="f">Коли <small class="muted">(роки, не обов'язково)</small><input class="in" id="rp-y" maxlength="40" value="${esc(q.yr || '')}" placeholder="напр. 1930-ті"></label>
    <div class="f"><span>Хто з родини пов'язаний</span><div class="tagl" id="rp-l"></div><input class="in" id="rp-q" type="search" placeholder="🔍 Почніть писати ім'я" autocomplete="off"><div class="tagres" id="rp-r"></div></div>
    <label class="f">Історія<textarea class="in" id="rp-s" maxlength="3000" placeholder="Що тут було, що розповідали…">${esc(q.story || '')}</textarea></label>
    <div class="f"><span>Фото й відео</span><div class="rtmed rtmed-ed" id="rp-md"></div>
      <div class="btns" style="margin:0"><label class="btn line small">📷 Додати фото<input type="file" id="rp-f" accept="image/*" multiple hidden></label></div>
      <span class="rtll"><input class="in" id="rp-yt" placeholder="Посилання на відео YouTube" autocomplete="off" inputmode="url"><button type="button" class="btn line small" id="rp-yb">＋ Відео</button></span>
      <span class="msg" id="rp-fm"></span></div>
    <div class="btns"><button class="btn" data-act="rp-save">Зберегти</button><button class="btn line" data-act="close">Скасувати</button><span class="msg" id="rp-m"></span></div></div>`);
  const paint = () => { $('#rp-l').innerHTML = ppl.map(y => `<span class="tagc">${esc(short(P[y]))}<button type="button" data-rm="${y}">×</button></span>`).join(''); }; paint();
  const mpaint = () => { $('#rp-md').innerHTML = med.map((x, j) => `<span class="rtm">${x.p ? (x.prev || S.data.photos.some(y => y.id === x.p) ? `<img src="${x.prev || img('photo=' + x.p, 1)}" alt="">` : '⏳') : `<img src="https://i.ytimg.com/vi/${esc(x.yt)}/mqdefault.jpg" alt="" referrerpolicy="no-referrer"><span>▶</span>`}<button type="button" class="rtm-x" data-mrm="${j}" aria-label="Прибрати">×</button></span>`).join('') || '<span class="small muted">Ще немає. Додайте фото хати, школи, могили — або посилання на відео.</span>'; }; mpaint();
  $('#rp-md').addEventListener('click', e => { const b = e.target.closest('[data-mrm]'); if (b) { med.splice(+b.dataset.mrm, 1); mpaint(); } });
  const fm = (t, err) => { const m = $('#rp-fm'); m.className = 'msg' + (err ? ' err' : ''); m.textContent = t; };
  $('#rp-yb').onclick = () => { const v = ytId($('#rp-yt').value); if (!v) { fm('Не схоже на посилання YouTube.', 1); return; } if (!med.some(x => x.yt === v)) med.push({ yt: v }); $('#rp-yt').value = ''; fm(''); mpaint(); };
  $('#rp-f').onchange = async e => { const fs = [...e.target.files]; e.target.value = ''; let wait = 0;
    for (let n = 0; n < fs.length; n++) { const f = fs[n]; fm(`Надсилаю фото ${n + 1} з ${fs.length}… не закривайте вікно`);
      try { const h = await fileHash(f), full = await bestPhoto(f), thumb = await toJpeg(f, 420, 0.78);
        let id; try { const res = await api(`/api/upload?person=${encodeURIComponent('rt:' + r.id)}&caption=${encodeURIComponent($('#rp-n').value.trim())}&h=${h}`, { raw: full }); id = res.id; if (res.pending) wait++; await api(`/api/upload?kind=thumb&photo=${res.id}`, { raw: thumb }).catch(() => {}); }
        catch (er) { if (er?.data?.id || er?.id) id = er.data?.id || er.id; else throw er; }
        if (id && !med.some(x => x.p === id)) med.push({ p: id, prev: URL.createObjectURL(thumb) }); mpaint();
      } catch (er) { fm('Не вдалося надіслати фото. Спробуйте ще раз.', 1); return; } }
    fm(wait ? 'Готово. Фото з’являться для всіх після підтвердження власника.' : 'Готово — не забудьте «Зберегти».'); };
  $('#rp-q').addEventListener('input', e => { const L = personFind(e.target.value).filter(p => !ppl.includes(p.id)); $('#rp-r').innerHTML = e.target.value.trim() ? L.map(p => `<button type="button" class="tagopt" data-pick="${p.id}">${ph(p)}<span><b>${esc(full(p))}</b><i>${esc(life(p) || '')}</i></span><em>＋</em></button>`).join('') : ''; });
  $('#rp-r').addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (b) { ppl.push(b.dataset.pick); paint(); $('#rp-q').value = ''; $('#rp-r').innerHTML = ''; } });
  $('#rp-l').addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (b) { ppl = ppl.filter(y => y !== b.dataset.rm); paint(); } });
  RTF = async () => { const n = $('#rp-n').value.trim(), m = $('#rp-m'); if (!n) { m.className = 'msg err'; m.textContent = 'Напишіть, що тут.'; return; }
    const np = { ...q, name: n, kind: $('#rp-k').value, yr: $('#rp-y').value.trim(), people: ppl, story: $('#rp-s').value.trim(), media: med.map(x => x.p ? { p: x.p } : { yt: x.yt }) }; const pts = r.pts.slice(); if (k != null) pts[k] = np; else pts.push(np);
    await rtSave(r, { pts }); if (med.some(x => x.p)) await load(); closeLayer(); S.ui.rtI = k != null ? k : pts.length - 1; S.ui.keepScroll = true; render(); };
}
let RTF = null;
function rtMount() {
  const box = $('#rtmap'); if (!box) return; const r = RTS().find(x => x.id === S.arg); if (!r) return;
  const tiles = box.querySelector('.gm-tiles'), pins = box.querySelector('.gm-pins'), svg = box.querySelector('.rt-line');
  const G = (S.ui.rtG ||= {}); if (G.id !== r.id) { Object.assign(G, { id: r.id, cx: null }); }
  if (G.cx == null) { const xs = r.pts.map(q => merc(q.la, q.lo)); if (xs.length) { const mn = [Math.min(...xs.map(x => x[0])), Math.min(...xs.map(x => x[1]))], mx = [Math.max(...xs.map(x => x[0])), Math.max(...xs.map(x => x[1]))]; G.cx = (mn[0] + mx[0]) / 2; G.cy = (mn[1] + mx[1]) / 2; const sp = Math.max(mx[0] - mn[0], mx[1] - mn[1], 1e-6); G.z = Math.max(5, Math.min(17, Math.log2(Math.min(box.clientWidth, box.clientHeight) * 0.7 / sp))); } else { const c = placeLL('Вороньки') || [50.68, 31.6]; [G.cx, G.cy] = merc(c[0], c[1]); G.z = 14; } }
  const W = () => box.clientWidth, H = () => box.clientHeight, cache = new Map();
  const toPx = (la, lo) => { const [wx, wy] = merc(la, lo), S2 = 2 ** G.z; return [(wx - G.cx) * S2 + W() / 2, (wy - G.cy) * S2 + H() / 2]; };
  const paint = () => {
    const zt = Math.max(0, Math.min(BASES[S.ui.rtBase || 'sat'].max, Math.round(G.z))), S2 = 2 ** G.z, ts = 256 * 2 ** (G.z - zt), n = 2 ** zt;
    const x0 = (G.cx - W() / 2 / S2) / 256 * n, y0 = (G.cy - H() / 2 / S2) / 256 * n, x1 = (G.cx + W() / 2 / S2) / 256 * n, y1 = (G.cy + H() / 2 / S2) / 256 * n, want = new Set();
    for (let ty = Math.floor(y0); ty <= Math.floor(y1); ty++) for (let tx = Math.floor(x0); tx <= Math.floor(x1); tx++) { if (ty < 0 || ty >= n) continue; const bk = S.ui.rtBase || 'sat', key = bk + '/' + zt + '/' + tx + '/' + ty; want.add(key); let el = cache.get(key);
      if (!el) { el = new Image(); el.alt = ''; el.draggable = false; el.referrerPolicy = 'strict-origin-when-cross-origin'; el.onerror = () => { el.style.visibility = 'hidden'; }; el.src = BASES[bk].url(zt, ((tx % n) + n) % n, ty); cache.set(key, el); tiles.appendChild(el); }
      el.style.transform = `translate(${(tx * 256 / n - G.cx) * S2 + W() / 2}px,${(ty * 256 / n - G.cy) * S2 + H() / 2}px) scale(${ts / 256})`; }
    for (const [k, el] of cache) if (!want.has(k)) { el.remove(); cache.delete(k); }
    const P2 = r.pts.map(q => toPx(q.la, q.lo)), i = S.ui.rtI ?? -1;
    svg.setAttribute('width', W()); svg.setAttribute('height', H()); svg.innerHTML = P2.length > 1 ? `<polyline points="${P2.map(p => p.join(',')).join(' ')}" />` : '';
    pins.innerHTML = r.pts.map((q, k) => `<button class="rtpin${k === i ? ' on' : ''}" data-act="rt-pick" data-v="${k}" style="left:${P2[k][0]}px;top:${P2[k][1]}px" title="${esc(q.name)}"><b>${k + 1}</b><span>${RT_K[q.kind][0]}</span></button>`).join('');
  };
  G.paint = paint; paint();
  let st = null;
  box.onpointerdown = e => { if (e.target.closest('button')) return; box.setPointerCapture?.(e.pointerId); st = { x: e.clientX, y: e.clientY, cx: G.cx, cy: G.cy, moved: false }; };
  box.onpointermove = e => { if (!st) return; const dx = e.clientX - st.x, dy = e.clientY - st.y; if (Math.abs(dx) + Math.abs(dy) > 4) st.moved = true; const S2 = 2 ** G.z; G.cx = st.cx - dx / S2; G.cy = st.cy - dy / S2; paint(); };
  box.onpointerup = e => { const was = st; st = null; if (!was || was.moved || S.ui.rtEd !== r.id) return;
    const b = box.getBoundingClientRect(), S2 = 2 ** G.z, wx = G.cx + (e.clientX - b.left - W() / 2) / S2, wy = G.cy + (e.clientY - b.top - H() / 2) / S2;
    const lo = wx / 256 * 360 - 180, la = Math.atan(Math.sinh(Math.PI * (1 - 2 * wy / 256))) * 180 / Math.PI; rtPointForm(r, null, [la, lo]); };
  box.onwheel = e => { e.preventDefault(); G.z = Math.max(4, Math.min(18, G.z - Math.sign(e.deltaY) * 0.5)); paint(); };
}

/* ───── «Наші слова»: говірка Вороньків, Веприка й сусідніх сіл — записує будь-хто з родичів ───── */
function vWords() {
  const W = (CFG_().words || []).slice(), q = (S.ui.wq || '').toLowerCase().trim();
  const L = W.filter(x => !q || (x.w + ' ' + x.m + ' ' + (x.ex || '') + ' ' + (x.pl || '')).toLowerCase().includes(q)).sort((a, b) => a.w.localeCompare(b.w, 'uk'));
  const groups = []; L.forEach(x => { const l = x.w[0].toUpperCase(); let g = groups.find(y => y.l === l); if (!g) groups.push(g = { l, L: [] }); g.L.push(x); });
  const mine = x => x.by === S.me?.id || isOwner(), ed = S.ui.wEdit ? W.find(x => x.id === S.ui.wEdit) : null;
  const form = `<div class="sec wform" id="wform"><h3>${ed ? 'Змінити слово' : 'Записати слово'}</h3>
    <div class="wgrid"><label class="f">Слово<input class="in" id="w-w" maxlength="80" value="${esc(ed?.w || '')}" placeholder="Напр.: «гарбуза дати»"></label>
    <label class="f">Де так кажуть<input class="in" id="w-pl" maxlength="120" value="${esc(ed?.pl || '')}" placeholder="Вороньки, Веприк…"></label></div>
    <label class="f">Що означає<textarea class="in" id="w-m" maxlength="1000" placeholder="Поясніть простими словами">${esc(ed?.m || '')}</textarea></label>
    <label class="f">Як кажуть — приклад <small class="muted">(не обов'язково)</small><input class="in" id="w-ex" maxlength="500" value="${esc(ed?.ex || '')}" placeholder="Напр.: «Баба казала: …»"></label>
    <div class="btns"><button class="btn" data-act="w-save"${ed ? ` data-id="${ed.id}"` : ''}>${ed ? 'Зберегти' : 'Додати слово'}</button>${ed ? '<button class="btn line" data-act="w-cancel">Скасувати</button>' : ''}<span class="msg" id="w-msg"></span></div></div>`;
  return `<div class="lede"><h1>Наші слова</h1><p class="small muted">Говірка наших сіл — слова, які казали бабусі й дідусі і яких не знайдеш у словнику. Записати може кожен: слово, що означає, і як його казали. Старі слова з документів — у <a href="#/terms">«Словнику»</a>.</p></div>
  ${S.me ? form : ''}
  <div class="stbar"><input class="in" id="wq" type="search" placeholder="Знайти слово… (усього ${W.length})" value="${esc(S.ui.wq || '')}" aria-label="Пошук у наших словах"></div>
  ${groups.length ? `<div class="wletters">${groups.map(g => `<a href="#w-${esc(g.l)}" data-act="w-jump" data-l="${esc(g.l)}">${esc(g.l)}</a>`).join('')}</div>` : ''}
  <div class="words">${groups.map(g => `<div class="sec" id="w-${esc(g.l)}"><h3>${esc(g.l)}</h3>${g.L.map(x => `<div class="word"><b>${esc(x.w)}</b>${x.pl ? ` <span class="muted small">· ${esc(x.pl)}</span>` : ''}<p>${esc(x.m)}</p>${x.ex ? `<p class="wex">${esc(x.ex)}</p>` : ''}<div class="small muted">записав(ла) ${esc(who(x.by))}, ${esc(when(x.at))}${mine(x) ? ` · <button class="lnk" data-act="w-edit" data-id="${x.id}">змінити</button> · <button class="lnk" data-act="w-del" data-id="${x.id}">видалити</button>` : ''}</div></div>`).join('')}</div>`).join('') || `<p class="muted">${q ? 'Нічого не знайдено.' : 'Ще жодного слова. Будьте першим — згадайте, як казала ваша бабуся!'}</p>`}</div>`;
}

/* ───── Сімейна книга (PDF): обрана гілка — біографії, фото, джерела. Верстається на сторінці й друкується браузером («Зберегти як PDF») ───── */
function openFBook(pid) {
  const x = P[pid] ? pid : startId(); FBX = x;
  modal(`<h2>Сімейна книга</h2><p class="small muted" style="margin:0 0 10px">Книга для друку або PDF: дерево, біографії з фото, спогади й посилання на джерела. «Завантажити PDF» — готовий файл одразу в «Завантаження» (на телефоні теж).</p>
    <div class="sec" style="gap:10px">
      <div class="f"><span>Від кого: <b id="fb-who">${esc(full(P[x]))}</b></span><input class="in" id="fb-q" type="search" placeholder="🔍 Інша людина — почніть писати ім'я" autocomplete="off"><div class="tagres" id="fb-r"></div></div>
      <label class="f">Що включити<select class="in" id="fb-m"><option value="up">Предки (батьки, діди, прадіди…)</option><option value="down">Нащадки (діти, онуки…)</option><option value="both" selected>Предки й нащадки</option><option value="clan">Уся родина (з братами, сестрами, тітками, дядьками)</option></select></label>
      <label class="f">Поколінь<select class="in" id="fb-g">${[2, 3, 4, 5, 6, 8, 10, 14].map(n => `<option value="${n}"${n === 5 ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="anunk"><input type="checkbox" id="fb-ph" checked> <span>Фото людей (головне фото + інші, до 4 на людину)</span></label>
      <label class="anunk"><input type="checkbox" id="fb-dc" checked> <span>Архівні документи: опис «який рядок наш» і посилання</span></label>
      <label class="anunk"><input type="checkbox" id="fb-st" checked> <span>Спогади родичів</span></label>
      <div class="btns"><button class="btn" data-act="fb-pdf">⬇ Завантажити PDF</button><button class="btn line" data-act="fb-make">🖨 Друкувати</button><button class="btn line" data-act="close">Скасувати</button><span class="msg" id="fb-msg"></span></div></div>`);
  const q = $('#fb-q'), r = $('#fb-r');
  q.addEventListener('input', () => { const L = personFind(q.value); r.innerHTML = q.value.trim() ? L.map(p => `<button type="button" class="tagopt" data-fbp="${p.id}">${ph(p)}<span><b>${esc(full(p))}</b><i>${esc(life(p) || '')}</i></span></button>`).join('') : ''; });
  r.addEventListener('click', e => { const b = e.target.closest('[data-fbp]'); if (!b) return; FBX = b.dataset.fbp; $('#fb-who').textContent = full(P[FBX]); q.value = ''; r.innerHTML = ''; });
}
let FBX = null;
function fbPeople(x, mode, G) { // [{id, gen}] — gen: 0 = від кого, +1 батьки, −1 діти
  const out = new Map(), add = (id, g) => { if (P[id] && !out.has(id)) out.set(id, g); };
  add(x, 0);
  if (mode !== 'down') { let cur = [x]; for (let g = 1; g < G && cur.length; g++) { const nx = []; cur.forEach(id => [P[id].f, P[id].mo].forEach(y => { if (P[y] && !out.has(y)) { add(y, g); nx.push(y); } })); cur = nx; } }
  if (mode !== 'up') { let cur = [x]; for (let g = 1; g < G && cur.length; g++) { const nx = []; cur.forEach(id => (KIDS[id] || []).forEach(y => { if (!out.has(y)) { add(y, -g); nx.push(y); } })); cur = nx; } }
  if (mode === 'clan') [...out.entries()].filter(([, g]) => g >= 0).forEach(([id, g]) => { const p = P[id]; [p.f, p.mo].filter(y => P[y]).flatMap(y => KIDS[y] || []).forEach(s => add(s, g)); });
  [...out.keys()].forEach(id => (SPOUSES[id] || []).forEach(s => { if (P[s.id] && !out.has(s.id)) out.set(s.id, out.get(id)); }));
  return [...out.entries()].map(([id, gen]) => ({ id, gen }));
}
const genName = (g, f) => g === 0 ? 'Від кого починаємо' : g === 1 ? 'Батьки' : g === 2 ? 'Діди й баби' : g === 3 ? 'Прадіди' : g > 3 ? `${'пра'.repeat(g - 2)}діди`.replace(/^п/, 'П') : g === -1 ? 'Діти' : g === -2 ? 'Онуки' : g === -3 ? 'Правнуки' : `${'пра'.repeat(-g - 2)}внуки`.replace(/^п/, 'П');
/* PDF без бібліотек: кожна сторінка малюється на canvas (A4, 150 dpi) і вкладається в PDF як JPEG */
function pdfFromJpegs(pages) { // pages: [{data: Uint8Array (JPEG), w, h}]
  const enc = new TextEncoder(), parts = [], offs = []; let len = 0;
  const put = x => { const u = typeof x === 'string' ? enc.encode(x) : x; parts.push(u); len += u.length; };
  const obj = (n, body) => { offs[n] = len; put(`${n} 0 obj\n`); body(); put('\nendobj\n'); };
  put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'); const N = pages.length, kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  obj(1, () => put('<< /Type /Catalog /Pages 2 0 R >>')); obj(2, () => put(`<< /Type /Pages /Count ${N} /Kids [${kids}] >>`));
  pages.forEach((pg, i) => { const o = 3 + i * 3, PW = 595.28, PH = 841.89, cs = `q ${PW} 0 0 ${PH} 0 0 cm /Im0 Do Q`;
    obj(o, () => put(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 ${o + 2} 0 R >> >> /Contents ${o + 1} 0 R >>`));
    obj(o + 1, () => { put(`<< /Length ${cs.length} >>\nstream\n`); put(cs); put('\nendstream'); });
    obj(o + 2, () => { put(`<< /Type /XObject /Subtype /Image /Width ${pg.w} /Height ${pg.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.data.length} >>\nstream\n`); put(pg.data); put('\nendstream'); }); });
  const xref = len, total = 3 + N * 3; put(`xref\n0 ${total}\n0000000000 65535 f \n`); for (let n = 1; n < total; n++) put(String(offs[n]).padStart(10, '0') + ' 00000 n \n');
  put(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: 'application/pdf' });
}
async function fbPdf() {
  const x = FBX, mode = $('#fb-m').value, G = +$('#fb-g').value, wPh = $('#fb-ph').checked, wDc = $('#fb-dc').checked, wSt = $('#fb-st').checked, m = $('#fb-msg');
  const say = t => { if (m) { m.className = 'msg'; m.textContent = t; } };
  say('Складаю книгу…'); try { await document.fonts?.load('20px "Old Standard TT"'); await document.fonts?.load('bold 20px "Old Standard TT"'); } catch {}
  const L = fbPeople(x, mode, G), ids = new Set(L.map(r => r.id)), gens = [...new Set(L.map(r => r.gen))].sort((a, b) => b - a);
  const srcs = [], srcIx = {}, cite = d => { if (!(d.id in srcIx)) { srcIx[d.id] = srcs.length + 1; srcs.push(d); } return srcIx[d.id]; };
  // фото
  const imgs = {}; const want = []; if (wPh) L.forEach(r => S.data.photos.filter(y => photoOf(y, r.id) && !isVoice(y) && !y.pending).sort((a, b) => (b.id === P[r.id].portrait) - (a.id === P[r.id].portrait)).slice(0, 4).forEach(y => want.push(y.id)));
  let nI = 0; for (const id of [...new Set(want)]) { say(`Завантажую фото: ${++nI} з ${want.length}…`); try { imgs[id] = await createImageBitmap(await (await fetch(img('photo=' + id), { credentials: 'same-origin' })).blob()); } catch {} }
  const W = 1240, H = 1754, ML = 115, MR = 115, MT = 125, MB = 140, FF = '"Old Standard TT", Georgia, "Times New Roman", serif', SF = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const pages = []; let c, g, y = MT, pno = 0, float = null;
  const finish = async () => { if (!c) return; g.font = `20px ${FF}`; g.fillStyle = '#8a7d70'; g.textAlign = 'center'; if (pno > 1) { g.fillText(String(pno), W / 2, H - 70); g.fillText('Сімейна книга · ' + short(P[x]), W / 2, 70); } g.textAlign = 'left';
    const b = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.82)); pages.push({ data: new Uint8Array(await b.arrayBuffer()), w: W, h: H }); };
  const newPage = async () => { await finish(); c = document.createElement('canvas'); c.width = W; c.height = H; g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.textBaseline = 'alphabetic'; y = MT; pno++; float = null; say(`Верстаю сторінку ${pno}…`); };
  const lines = (text, font, width) => { g.font = font; const out = []; String(text || '').split('\n').forEach(par => { const words = par.split(/\s+/).filter(Boolean); let ln = ''; for (const w of words) { const t = ln ? ln + ' ' + w : w; if (g.measureText(t).width <= width || !ln) { if (g.measureText(t).width > width && !ln) { let cut = w; while (cut.length > 1 && g.measureText(cut).width > width) cut = cut.slice(0, -1); out.push(cut); ln = w.slice(cut.length); } else ln = t; } else { out.push(ln); ln = w; } } out.push(ln); }); return out; };
  // текст з обтіканням фото: leftAt(y) — де починається рядок на цій висоті
  const xAt = yy => float && yy < float.bottom ? float.x : ML, wAt = yy => W - MR - xAt(yy);
  const para = async (text, { size = 24, lh = 35, color = '#1d1a17', bold = false, italic = false, font = FF, gap = 10, indent = 0 } = {}) => {
    const f = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px ${font}`; g.font = f;
    const words = String(text || '').split(/\s+/).filter(Boolean); let ln = '';
    const flush = async () => { if (y + lh > H - MB) { await newPage(); g.font = f; } g.fillStyle = color; g.fillText(ln, xAt(y) + indent, y + size); y += lh; ln = ''; };
    for (const w of words) { const t = ln ? ln + ' ' + w : w; if (g.measureText(t).width > wAt(y) - indent && ln) { await flush(); ln = w; } else ln = t; }
    if (ln) await flush(); y += gap; };
  const need = async h => { if (y + h > H - MB) await newPage(); };
  const cover = (im, dx, dy, dw, dh) => { const s_ = Math.max(dw / im.width, dh / im.height), sw = dw / s_, sh = dh / s_; g.drawImage(im, (im.width - sw) / 2, Math.max(0, (im.height - sh) * 0.3), sw, sh, dx, dy, dw, dh); };
  const RELC = { doc: '#2f6b3a', mem: '#2d5d8a', chk: '#a0670a', con: '#a8322d' }, RELI = { doc: '✓', mem: '💬', chk: '?', con: '⇄' };
  // обкладинка
  await newPage(); const cx = W / 2; g.textAlign = 'center'; g.fillStyle = '#6b2433'; g.font = `30px ${FF}`; g.fillText('◆   ◆   ◆', cx, 520);
  g.fillStyle = '#1d1a17'; g.font = `bold 78px ${FF}`; g.fillText('Сімейна книга', cx, 640); g.font = `36px ${FF}`; g.fillText(full(P[x]), cx, 730); g.font = `26px ${FF}`; g.fillStyle = '#6b5f55';
  g.fillText(`${life(P[x]) ? life(P[x]) + ' · ' : ''}${{ up: 'предки', down: 'нащадки', both: 'предки й нащадки', clan: 'уся родина' }[mode]} · ${L.length} людей`, cx, 785);
  if (P[x].portrait && imgs[P[x].portrait]) { g.save(); g.beginPath(); g.arc(cx, 1010, 150, 0, Math.PI * 2); g.clip(); cover(imgs[P[x].portrait], cx - 150, 860, 300, 300); g.restore(); }
  g.fillStyle = '#1d1a17'; g.font = `26px ${FF}`; g.fillText(SURN.join(' · '), cx, 1290); g.fillStyle = '#6b5f55'; g.font = `22px ${FF}`;
  g.fillText(`Складено ${new Date().toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })} з сайту «Наш родовід» (${location.host})`, cx, H - 220); g.fillText('Сайт створив і веде Максим Шутий', cx, H - 185); g.textAlign = 'left';
  // хто в книзі
  await newPage(); g.fillStyle = '#6b2433'; g.font = `bold 40px ${FF}`; g.fillText('Хто в книзі', ML, y + 40); y += 75;
  for (const gn of gens) { await para(genName(gn), { size: 26, bold: true, gap: 2 }); await para(L.filter(r => r.gen === gn).map(r => short(P[r.id]) + (life(P[r.id]) ? ` (${life(P[r.id])})` : '')).join(', '), { size: 23, lh: 33, gap: 14 }); }
  y += 10; await para('Позначки: ✓ підтверджено документом · 💬 зі спогадів · ? потребує перевірки · ⇄ суперечливі версії. Те, що записано в документах, подано як факт; відоме зі слів родичів — «за словами…»; здогадки — «Є припущення». Номери [1] — джерела в кінці книги.', { size: 20, lh: 29, color: '#6b5f55' });
  // біографії
  for (const gn of gens) {
    await newPage(); g.fillStyle = '#6b2433'; g.font = `bold 44px ${FF}`; g.fillText(genName(gn), ML, y + 44); g.fillRect(ML, y + 62, W - ML - MR, 2); y += 95;
    for (const r of L.filter(q => q.gen === gn).sort((a, b) => byBirth(a.id, b.id))) {
      const p = P[r.id], rl = relOf(p), par = [p.f, p.mo].filter(z => P[z]), sp = (SPOUSES[r.id] || []).filter(z => P[z.id]), ch = (KIDS[r.id] || []).slice().sort(byBirth);
      const phs = wPh ? S.data.photos.filter(z => photoOf(z, r.id) && !isVoice(z) && !z.pending && imgs[z.id]).sort((a, b) => (b.id === p.portrait) - (a.id === p.portrait)).slice(0, 4) : [];
      await need(300); const top = y;
      if (phs[0]) { cover(imgs[phs[0].id], ML, top, 200, 250); g.strokeStyle = '#c9bfb3'; g.strokeRect(ML, top, 200, 250); float = { x: ML + 230, bottom: top + 265 }; }
      else { g.fillStyle = '#efe9e0'; g.fillRect(ML, top, 110, 130); g.fillStyle = '#8a7d70'; g.font = `48px ${FF}`; g.textAlign = 'center'; g.fillText((p.n || '?')[0], ML + 55, top + 85); g.textAlign = 'left'; float = { x: ML + 140, bottom: top + 145 }; }
      await para(full(p), { size: 34, lh: 44, bold: true, gap: 0 });
      await para(`${years(p) || ''}   ${RELI[rl.k]} ${RELK[rl.k].t}${rl.c ? '   ⇄ ' + RELK.con.t : ''}`, { size: 21, lh: 31, color: RELC[rl.k], font: SF, gap: 4 });
      const dt = [p.b ? `нар. ${p.b}${p.bp ? ', ' + p.bp : ''}` : p.bp ? `родом: ${p.bp}` : '', p.d ? `пом. ${p.d}${p.dp ? ', ' + p.dp : ''}` : p.dead || p.dp ? `${p.sex === 'f' ? 'померла' : 'помер'}${p.dp ? ', ' + p.dp : ''}` : '', p.lp ? `жив${p.sex === 'f' ? 'ла' : ''}: ${p.lp}` : ''].filter(Boolean).join(' · ');
      if (dt) await para(dt, { size: 22, lh: 32, color: '#3d3530', gap: 2 });
      const kin = [par.length ? 'Батьки: ' + par.map(z => short(P[z])).join(' і ') + '.' : '', sp.length ? (p.sex === 'f' ? 'Чоловік: ' : 'Дружина: ') + sp.map(z => short(P[z.id]) + (z.date && !/не підтвердж/i.test(z.date) ? ` (шлюб ${z.date})` : '')).join('; ') + '.' : '', ch.length ? 'Діти: ' + ch.map(z => short(P[z])).join(', ') + '.' : ''].filter(Boolean).join(' ');
      if (kin) await para(kin, { size: 22, lh: 32, color: '#3d3530', gap: 6 });
      if (rl.c) await para('Суперечливі версії: ' + rl.c, { size: 21, lh: 30, color: '#a8322d', gap: 6 });
      if (p.note) for (const pp of plainLinks(p.note).split(/\n+/)) await para(pp, { size: 23, lh: 34, gap: 8 });
      const st = wSt ? S.data.stories.filter(z => z.target === r.id || z.target === 'iv:' + r.id) : [];
      if (st.length) { await para('СПОГАДИ', { size: 18, bold: true, color: '#6b5f55', font: SF, gap: 2 }); for (const z of st) await para(`«${plainLinks(z.text)}» — ${who(z.by)}, ${String(z.at || '').slice(0, 10)}`, { size: 22, lh: 32, italic: true, indent: 20, gap: 6 }); }
      const docs = wDc ? S.data.documents.filter(d => (d.people || []).includes(r.id) && d.type !== 'map').sort((a, b) => (yN(a.date) || 0) - (yN(b.date) || 0)) : [];
      if (docs.length) { await para('ЩО КАЖУТЬ ДОКУМЕНТИ', { size: 18, bold: true, color: '#6b5f55', font: SF, gap: 2 }); for (const d of docs) await para(`• ${d.title}${d.line ? ' — ' + plainLinks(d.line) : ''} [${cite(d)}]`, { size: 20, lh: 29, indent: 10, gap: 4 }); }
      if (float && y < float.bottom) y = float.bottom; float = null;
      if (phs.length > 1) { const gw = 300, gh = 225; await need(gh + 50); let gx = ML; for (const z of phs.slice(1)) { cover(imgs[z.id], gx, y, gw, gh); if (z.caption) { g.font = `17px ${SF}`; g.fillStyle = '#6b5f55'; g.fillText(lines(z.caption, `17px ${SF}`, gw)[0] || '', gx, y + gh + 22); } gx += gw + 25; } y += gh + 40; }
      y += 20; if (y + 40 < H - MB) { g.fillStyle = '#e4dcd1'; g.fillRect(ML, y, W - ML - MR, 1); y += 30; }
    }
  }
  if (srcs.length) { await newPage(); g.fillStyle = '#6b2433'; g.font = `bold 44px ${FF}`; g.fillText('Джерела', ML, y + 44); y += 85;
    for (const [i, d] of srcs.entries()) await para(`${i + 1}. ${d.title}${d.date ? ', ' + d.date : ''}${d.src ? '. ' + d.src : ''}${d.url ? ' ' + d.url : ''}`, { size: 19, lh: 27, gap: 8 }); }
  await finish(); say('Збираю PDF…');
  const blob = pdfFromJpegs(pages), fn = `simeina-knyha-${(short(P[x]) || 'rid').replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}.pdf`;
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fn; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
  say(`Готово: ${pages.length} сторінок, ${(blob.size / 1e6).toFixed(1)} МБ — файл у «Завантаженнях».`); const b_ = $('[data-act="fb-pdf"]'); if (b_) b_.disabled = false;
  ev('open', 'fbook-pdf', 'person:' + x);
}
async function makeFBook() {
  const x = FBX, mode = $('#fb-m').value, G = +$('#fb-g').value, wPh = $('#fb-ph').checked, wDc = $('#fb-dc').checked, wSt = $('#fb-st').checked, m = $('#fb-msg');
  m.className = 'msg'; m.textContent = 'Складаю…';
  const L = fbPeople(x, mode, G), ids = new Set(L.map(r => r.id));
  const gens = [...new Set(L.map(r => r.gen))].sort((a, b) => b - a);
  const srcs = [], srcIx = {}; const cite = d => { if (!(d.id in srcIx)) { srcIx[d.id] = srcs.length + 1; srcs.push(d); } return srcIx[d.id]; };
  const pl = t => esc(plainLinks(t)).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>');
  const ref = id => ids.has(id) ? `<a href="#fb-${id}">${esc(short(P[id]))}</a>` : esc(short(P[id]));
  const pdate = p => [p.b ? `нар. ${esc(p.b)}${p.bp ? ', ' + esc(p.bp) : ''}` : p.bp ? `родом: ${esc(p.bp)}` : '', p.d ? `пом. ${esc(p.d)}${p.dp ? ', ' + esc(p.dp) : ''}` : p.dead || p.dp ? `${p.sex === 'f' ? 'померла' : 'помер'}${p.dp ? ', ' + esc(p.dp) : ''}` : '', p.lp ? `жив${p.sex === 'f' ? 'ла' : ''}: ${esc(p.lp)}` : ''].filter(Boolean).join(' · ');
  const bio = id => { const p = P[id], r = relOf(p);
    const par = [p.f, p.mo].filter(y => P[y]), sp = (SPOUSES[id] || []).filter(s => P[s.id]), ch = (KIDS[id] || []).slice().sort(byBirth);
    const phs = wPh ? S.data.photos.filter(y => photoOf(y, id) && !isVoice(y) && !y.pending).sort((a, b) => (b.id === p.portrait) - (a.id === p.portrait)).slice(0, 4) : [];
    const docs = wDc ? S.data.documents.filter(d => (d.people || []).includes(id) && d.type !== 'map').sort((a, b) => (yN(a.date) || 0) - (yN(b.date) || 0)) : [];
    const st = wSt ? S.data.stories.filter(s => s.target === id || s.target === 'iv:' + id) : [];
    return `<article class="fb-p" id="fb-${id}"><div class="fb-ph">${phs[0] ? `<img src="${img('photo=' + phs[0].id)}" alt="">` : `<span>${esc((p.n || '?')[0])}</span>`}</div>
      <div class="fb-tx"><h3>${esc(full(p))}</h3><div class="fb-y">${esc(years(p) || '')} <span class="fb-rel rel-${r.k}">${RELK[r.k].i}${RELK[r.k].t}</span>${r.c ? ` <span class="fb-rel rel-con">${RELK.con.i}${RELK.con.t}</span>` : ''}</div>
      ${pdate(p) ? `<p class="fb-d">${pdate(p)}</p>` : ''}
      <p class="fb-k">${par.length ? `<b>Батьки:</b> ${par.map(ref).join(' і ')}. ` : ''}${sp.length ? `<b>${p.sex === 'f' ? 'Чоловік' : 'Дружина'}:</b> ${sp.map(s => ref(s.id) + (s.date && !/не підтвердж/i.test(s.date) ? ` (шлюб ${esc(s.date)})` : '')).join('; ')}. ` : ''}${ch.length ? `<b>Діти:</b> ${ch.map(ref).join(', ')}.` : ''}</p>
      ${r.c ? `<p class="fb-c">Суперечливі версії: ${esc(r.c)}</p>` : ''}
      ${p.note ? `<div class="fb-n"><p>${pl(p.note)}</p></div>` : ''}
      ${st.length ? `<div class="fb-st"><h4>Спогади</h4>${st.map(s => `<blockquote>${pl(s.text)}<cite>— ${esc(who(s.by))}, ${esc(String(s.at || '').slice(0, 10))}</cite></blockquote>`).join('')}</div>` : ''}
      ${docs.length ? `<div class="fb-dc"><h4>Що кажуть документи</h4><ul>${docs.map(d => `<li><b>${esc(d.title)}</b>${d.line ? ` — ${pl(d.line)}` : ''} <sup>[${cite(d)}]</sup></li>`).join('')}</ul></div>` : ''}
      ${phs.length > 1 ? `<div class="fb-gal">${phs.slice(1).map(y => `<figure><img src="${img('photo=' + y.id)}" alt=""><figcaption>${esc(y.caption || '')}</figcaption></figure>`).join('')}</div>` : ''}
      </div></article>`; };
  const outline = gens.map(g => `<li><b>${genName(g)}</b>: ${L.filter(r => r.gen === g).map(r => esc(short(P[r.id])) + (life(P[r.id]) ? ` <i>(${esc(life(P[r.id]))})</i>` : '')).join(', ')}</li>`).join('');
  const body = gens.map(g => `<section class="fb-gen"><h2>${genName(g)}</h2>${L.filter(r => r.gen === g).sort((a, b) => byBirth(a.id, b.id)).map(r => bio(r.id)).join('')}</section>`).join('');
  const html = `<div class="fb-cover"><div class="fb-orn">◆ ◆ ◆</div><h1>Сімейна книга</h1><div class="fb-sub">${esc(full(P[x]))}${life(P[x]) ? ` · ${esc(life(P[x]))}` : ''}</div>
      <div class="fb-sub2">${{ up: 'предки', down: 'нащадки', both: 'предки й нащадки', clan: 'уся родина' }[mode]} · ${L.length} людей · ${G} поколінь</div>
      <div class="fb-surn">${SURN.join(' · ')}</div><div class="fb-date">Складено ${new Date().toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })} з сайту «Наш родовід» (${esc(location.host)})</div><div class="fb-by">Сайт створив і веде Максим Шутий</div></div>
    <section class="fb-toc"><h2>Хто в книзі</h2><ul>${outline}</ul>
      <p class="fb-legend">${['doc', 'mem', 'chk', 'con'].map(k => `<span class="fb-rel rel-${k}">${RELK[k].i}${RELK[k].t}</span>`).join(' ')}</p>
      <p class="fb-note">Те, що записано в документах, подано як факт; відоме зі слів родичів — «за словами…»; здогадки — «Є припущення». Номери в дужках [1] — джерела в кінці книги.</p></section>
    ${body}
    ${srcs.length ? `<section class="fb-src"><h2>Джерела</h2><ol>${srcs.map(d => `<li><b>${esc(d.title)}</b>${d.date ? ', ' + esc(d.date) : ''}${d.src ? `. ${esc(d.src)}` : ''}${d.url ? ` <span class="fb-url">${esc(d.url)}</span>` : ''}</li>`).join('')}</ol></section>` : ''}`;
  document.getElementById('fbook')?.remove();
  const box = document.createElement('div'); box.id = 'fbook'; box.innerHTML = html; document.body.appendChild(box);
  const ims = [...box.querySelectorAll('img')]; let n = 0;
  m.textContent = ims.length ? `Завантажую фото: 0 з ${ims.length}…` : 'Готово';
  await Promise.all(ims.map(im => new Promise(ok => { const d = () => { n++; m.textContent = `Завантажую фото: ${n} з ${ims.length}…`; ok(); }; if (im.complete) d(); else { im.onload = im.onerror = d; } setTimeout(ok, 20000); })));
  closeLayer(); document.documentElement.classList.add('fb-print');
  const done = () => { document.documentElement.classList.remove('fb-print'); box.remove(); removeEventListener('afterprint', done); };
  addEventListener('afterprint', done); setTimeout(() => window.print(), 150);
  ev('open', 'fbook', 'person:' + x);
}

/* ───── Питання для інтерв'ю з родичами: сайт сам складає питання з прогалин у дереві ───── */
function ivRelatives(x) { // предки до прадідів + брати й сестри батьків + подружжя; lb — ким доводиться тому, кого розпитуємо
  const out = [], seen = new Set([x]), f = id => P[id]?.sex === 'f';
  const add = (id, lb, depth) => { if (!P[id] || seen.has(id)) return; seen.add(id); out.push({ id, lb, depth }); };
  const up = (id, side, depth) => { if (depth > 3) return; const p = P[id]; if (!p) return;
    for (const [k, fem] of [['f', 0], ['mo', 1]]) { const q = p[k]; if (!P[q]) continue;
      const w = depth === 1 ? (fem ? 'ваша мати' : 'ваш батько') : depth === 2 ? (fem ? 'ваша баба' : 'ваш дід') + side : (fem ? 'ваша прабаба' : 'ваш прадід') + side;
      add(q, w, depth); up(q, depth === 1 ? (fem ? ' по матері' : ' по батькові') : side, depth + 1); } };
  (SPOUSES[x] || []).forEach(s => add(s.id, f(s.id) ? 'ваша дружина' : 'ваш чоловік', 1));
  up(x, '', 1);
  const p = P[x]; [['f', 'батька'], ['mo', 'матері']].forEach(([k, w]) => { const par = P[p?.[k]]; if (!par) return; [par.f, par.mo].filter(y => P[y]).flatMap(y => KIDS[y] || []).forEach(s => { if (s !== par.id) add(s, (f(s) ? 'сестра ' : 'брат ') + w, 2); }); });
  return out.sort((a, b) => a.depth - b.depth);
}
function ivQuestions(x) {
  const Q = [], nm = id => short(P[id]), f = id => P[id]?.sex === 'f', g = (id, m, w) => f(id) ? w : m;
  const yr = id => yN(P[id].b) || 0, hasPh = id => S.data.photos.some(y => photoOf(y, id) && !isVoice(y));
  const self = P[x]; if (!self) return Q;
  const push = (id, k, t, why) => Q.push({ id, k, t, why });
  // про самого співрозмовника
  if (!self.bp) push(x, 'bp', 'Де ви народилися? У якій хаті, на якій вулиці, хто приймав пологи?', 'немає місця народження');
  if (!P[self.f] || !P[self.mo]) push(x, 'par', 'Як звали ваших батьків (повністю, з по батькові)? Звідки вони родом?', 'у дереві немає батька або матері');
  push(x, 'move', 'Коли й чому родина переїжджала — з села в місто, в інший край? Хто переїхав першим?', 'загальне');
  for (const r of ivRelatives(x)) {
    const id = r.id, p = P[id], who_ = `${r.lb} — ${nm(id)}`, alive = !p.d && !p.dead && yr(id) && yr(id) > 1935;
    if (!p.b) push(id, 'b', `Коли ${g(id, 'народився', 'народилася')} ${who_}? Хоч приблизно — рік, пора року.`, 'немає дати народження');
    else if (!p.bp && r.depth <= 3) push(id, 'bp', `Де ${g(id, 'народився', 'народилася')} ${who_}? У якому селі?`, 'немає місця народження');
    if (!p.d && (p.dead || (yr(id) && yr(id) < 1950))) push(id, 'd', `Коли ${g(id, 'помер', 'померла')} ${who_}? Де ${g(id, 'похований', 'похована')}?`, 'немає дати смерті');
    else if (p.d && !p.dp) push(id, 'dp', `Де ${g(id, 'похований', 'похована')} ${who_}? Чи збереглася могила?`, 'немає місця поховання');
    if (r.depth <= 2 && (!P[p.f] || !P[p.mo])) push(id, 'par', `Як звали батьків ${nm(id)} — ${r.lb.replace(/^ваш[а]? /, '')}? Звідки вони були родом?`, 'у дереві немає батьків');
    if (r.depth <= 2 && !/^(брат|сестра)/.test(r.lb)) { const par = [p.f, p.mo].filter(y => P[y]), sib = par.length ? [...new Set(par.flatMap(y => KIDS[y] || []))].filter(y => y !== id) : [];
      push(id, 'sib', sib.length ? `У дереві брати й сестри ${nm(id)}: ${sib.map(nm).join(', ')}. Чи були ще? Хтось помер малим?` : `Чи пам'ятаєте братів і сестер, які були в ${nm(id)} — ${r.lb.replace(/^ваш[а]? /, '')}? Як їх звали, де вони жили?`, sib.length ? 'перевірити, чи всі' : 'немає жодного брата чи сестри'); }
    if (f(id) && (SPOUSES[id] || []).length && !p.m) push(id, 'm', `Яке дівоче прізвище ${nm(id)}? З якого вона роду?`, 'немає дівочого прізвища');
    if (!f(id) && !p.war && yr(id) >= 1890 && yr(id) <= 1927) push(id, 'war', `Чи воював ${nm(id)} у Другу світову? Чи повернувся? Чи є нагороди, листи, фото у формі?`, 'не позначено про війну');
    if (!f(id) && !p.war && yr(id) >= 1865 && yr(id) < 1890) push(id, 'war', `Чи воював ${nm(id)} у Першу світову (1914–1918)?`, 'не позначено про війну');
    if (!hasPh(id) && !alive) push(id, 'ph', `Чи збереглися фото ${nm(id)}? Їх можна сфотографувати телефоном і додати сюди.`, 'немає фото');
    if (!p.lp && !String(p.note || '').trim() && r.depth <= 3) push(id, 'life', `Де ${g(id, 'жив', 'жила')} і ким ${g(id, 'працював', 'працювала')} ${nm(id)}? Яким${g(id, '', 'ою')} ${g(id, 'він був', 'вона була')} — що про ${g(id, 'нього', 'неї')} розповідали?`, 'нічого не відомо про життя');
    (SPOUSES[id] || []).forEach(s => { if (!s.date && P[s.id] && !(SPOUSES[s.id] || []).some(z => z.id === id && z.done)) { s.done = 1; if (r.depth <= 2) push(id, 'wed', `Коли й де одружилися ${nm(id)} і ${nm(s.id)}?`, 'немає дати шлюбу'); } });
  }
  (SPOUSES[x] || []).length; // (кешовані позначки done — лише на час підрахунку)
  Object.values(SPOUSES).forEach(L => L.forEach(s => delete s.done));
  push(x, 'docs', 'Чи є вдома старі документи: свідоцтва, трудові книжки, військові квитки, листи, листівки? Їх можна сфотографувати.', 'загальне');
  push(x, 'tales', 'Які родинні перекази ви чули — про походження прізвища, про війни, голод, переселення?', 'загальне');
  push(x, 'who', 'Хто з родичів пам\'ятає найбільше? До кого ще варто звернутися з цими питаннями?', 'загальне');
  return Q;
}
const IV_GEN = ['move', 'docs', 'tales', 'who'];
function ivOpen(x) { const A = new Set(S.data.stories.filter(s => /^iv:/.test(s.target)).map(s => s.target.slice(3) + '|' + (s.text.match(/^«([^»]*)»/) || [])[1])); return ivQuestions(x || startId()).filter(q => !IV_GEN.includes(q.k) && !A.has(q.id + '|' + q.t)); }
function ivNudge() { // «маячок»: раз на 3 дні після входу — нагадування, скільки питань про рідню ще без відповіді
  try { if (!S.me || S.view === 'iv') return; const k = 'rs_ivn', last = +localStorage.getItem(k) || 0; if (Date.now() - last < 3 * 864e5) return; const n = ivOpen().length; if (!n) return;
    localStorage.setItem(k, Date.now()); setTimeout(() => { const d = document.createElement('div'); d.className = 'ivnudge'; d.innerHTML = `<b>🎙 ${n} ${n % 10 === 1 && n % 100 !== 11 ? 'питання' : 'питань'} про вашу рідню чекають відповіді</b><span>Може, знаєте відповідь — або спитаєте бабусю чи дідуся?</span><div class="btns"><a class="btn small" href="#/iv">Подивитись</a><button class="btn line small" type="button">Пізніше</button></div>`; d.querySelector('button').onclick = () => d.remove(); d.querySelector('a').onclick = () => d.remove(); document.body.appendChild(d); setTimeout(() => d.remove(), 30000); }, 2500); } catch {}
}
function vIv() {
  const x = P[S.ui.ivWho] ? S.ui.ivWho : startId(), Q = ivQuestions(x), ans = id => S.data.stories.filter(s => s.target === 'iv:' + id);
  const groups = []; Q.forEach(q => { let gp = groups.find(g => g.id === q.id); if (!gp) groups.push(gp = { id: q.id, qs: [] }); gp.qs.push(q); });
  const lbOf = Object.fromEntries(ivRelatives(x).map(r => [r.id, r.lb]));
  return `<div class="lede"><h1>Питання для розмови</h1><p class="small muted">Сайт сам склав питання з того, чого ще бракує в дереві. Сядьте з бабусею чи дідусем, увімкніть запис — і йдіть по списку.</p></div>
  <div class="sec ivbar"><div class="f"><span>Кого розпитуємо: <b>${esc(full(P[x]))}</b> ${life(P[x]) ? `<span class="muted">(${esc(life(P[x]))})</span>` : ''}</span><input class="in" id="iv-q" type="search" placeholder="🔍 Інша людина — почніть писати ім'я" autocomplete="off"><div class="tagres" id="iv-r"></div></div>
    <div class="btns"><button class="btn line small" data-act="iv-me">Мене</button><button class="btn line small" data-act="iv-print">🖨 Роздрукувати</button></div>
    <p class="small muted">Питань: <b>${Q.length}</b>. Відповідь можна написати або записати голосом — її побачить Максим і внесе в дерево.</p></div>
  ${groups.map(gp => `<div class="sec ivg"><h3>${gp.id === x ? 'Про вас' : `${pLink(gp.id)} <span class="muted small">${esc(lbOf[gp.id] || '')}</span>`}</h3>
    <ol class="ivl">${gp.qs.map((q, i) => { const key = q.id + ':' + q.k, A = ans(q.id).filter(s => s.text.startsWith('«' + q.t + '»'));
      return `<li class="ivq${A.length ? ' done' : ''}"><div class="ivt">${esc(q.t)}${A.length ? ' <b class="ivok">✓ є відповідь</b>' : ''}</div>
      ${A.map(s => `<div class="iva">${esc(s.text.slice(q.t.length + 3).replace(/^\\s*—\\s*/, ''))}<i> — ${esc(who(s.by))}, ${esc(when(s.at))}</i></div>`).join('')}
      <div class="ivbtn"><button class="btn line small" data-act="iv-open" data-k="${esc(key)}">✍ Відповісти</button><button class="btn line small" data-act="iv-rec" data-id="${q.id}" data-q="${esc(q.t)}">🎙 Записати голосом</button></div>
      <div class="ivform" id="ivf-${esc(key)}" hidden><textarea class="in" placeholder="Що розповіли? Хто розповідав?"></textarea><div class="btns"><button class="btn small" data-act="iv-save" data-id="${q.id}" data-k="${esc(key)}" data-q="${esc(q.t)}">Зберегти відповідь</button><span class="msg"></span></div></div></li>`; }).join('')}</ol></div>`).join('')}`;
}
function vHelp() {
  const W = (CFG_().wanted || []), done = W.filter(x => x.done), M = missing();
  return `<div class="lede"><h1>Допоможіть знайти</h1><p class="small muted">Що ми шукаємо. Знаєте щось — напишіть, навіть «здається, баба казала…».</p></div>
  <div class="hgrid">
    <div class="sec"><h3>Питання від Максима ${canEdit() ? '<button class="btn line small" data-act="want-new">+ Питання</button>' : ''}</h3>${wantList()}
      ${done.length ? `<details class="small"><summary>Уже знайдено (${done.length})</summary><ul class="wantl done">${done.map(x => `<li><button class="wantc" data-act="want-open" data-id="${x.id}"><b>✓ ${esc(x.text)}</b>${x.answer ? `<span class="small">${esc(x.answer)}</span>` : ''}</button></li>`).join('')}</ul></details>` : ''}</div>
    <div class="sec"><h3>Хто на фото?</h3>${askGrid()}${askDone()}</div>
  </div>
  <div class="sec"><h3>Чиїх фото бракує</h3><p class="small muted">Найближчі предки без жодного фото. Може, у вас у альбомі є? Відкрийте картку → «Додати фото».</p><div class="row wrapmini">${M.noPhoto.map(mini).join('') || '<span class="muted small">Фото є в усіх — дякуємо!</span>'}</div></div>
  ${M.noDate.length ? `<div class="sec"><h3>Невідома дата народження</h3><div class="row wrapmini">${M.noDate.map(mini).join('')}</div></div>` : ''}
  ${M.noParents.length ? `<div class="sec"><h3>Не знаємо батьків</h3><p class="small muted">Тут обривається гілка — кожне ім'я відкриває ще покоління.</p><div class="row wrapmini">${M.noParents.map(mini).join('')}</div></div>` : ''}`;
}
function openWant(id) {
  const x = (CFG_().wanted || []).find(w => w.id === id); if (!x) return;
  const L = S.data.stories.filter(s => s.target === 'want:' + id);
  modal(`<h2>${esc(x.text)}</h2>${x.person && P[x.person] ? `<p class="small">Про кого: ${pLink(x.person)}</p>` : ''}${x.done ? `<p class="hypnote">Знайдено${x.answer ? ': ' + esc(x.answer) : ''}</p>` : ''}
    <h3>Відповіді</h3>${L.length ? storiesHtml(L) : '<p class="muted small">Ще ніхто не відповів.</p>'}
    <div class="sec" style="gap:8px"><textarea class="in" id="st-want:${id}" placeholder="Що знаєте або пам'ятаєте? Хто ще може знати?"></textarea>
    <div class="btns"><button class="btn" data-story="want:${id}">Відповісти</button>${canEdit() ? `<button class="btn line small" data-act="want-edit" data-id="${id}">Змінити</button>` : ''}<button class="btn line" data-act="close">Закрити</button><span class="msg" id="stm-want:${id}"></span></div></div>`);
}
function openWantEdit(id) {
  const x = (CFG_().wanted || []).find(w => w.id === id) || {};
  modal(`<h2>${id ? 'Змінити питання' : 'Нове питання'}</h2>
    <label class="f">Що шукаємо<textarea class="in" id="w-t" placeholder="Напр.: «Де похований Яків Шутий (†1949)?»">${esc(x.text || '')}</textarea></label>
    <label class="f">Про кого (необов'язково)${pick('w-p', x.person)}</label>
    ${id ? `<label class="small"><input type="checkbox" id="w-d"${x.done ? ' checked' : ''}> Знайдено</label><label class="f">Що знайшли<input class="in" id="w-a" value="${esc(x.answer || '')}"></label>` : ''}
    <div class="btns"><button class="btn" data-act="want-save" data-id="${id || ''}">Зберегти</button><button class="btn line" data-act="close">Скасувати</button>${id ? `<button class="btn danger small" data-act="want-del" data-id="${id}" style="margin-left:auto">Видалити</button>` : ''}<span class="msg" id="wmsg"></span></div>`);
}

/* ── Запросити одним дотиком ── */
const accSet = () => new Set(S.data.accounts || []);
function inviteText(p) {
  const link = CFG_().join ? location.origin + '/?join=' + CFG_().join : '';
  const nm = p ? String(p.n || '').replace(/\s*\(.*?\)/g, '') : '';
  return `${nm ? 'Привіт, ' + nm + '! ' : 'Привіт! '}Я зробив сайт нашого роду — там родинне дерево, старі документи з архівів, фото і спогади.${p ? ' Ти там теж є 🙂' : ''} Зареєструйся, щоб усе бачити й доповнювати: ${link}${CFG_().tg ? `\nА ще в нас є група в Telegram: ${CFG_().tg}` : ''}`;
}
function openInvite(pid) {
  const p = P[pid] || null, link = CFG_().join ? location.origin + '/?join=' + CFG_().join : '';
  if (!link) { modal(`<h2>Запросити родича</h2><p>${isOwner() ? 'Реєстрацію за посиланням вимкнено. Увімкніть її: Власнику → Доступи → «Посилання для реєстрації».' : 'Реєстрацію зараз вимкнено — напишіть Максиму.'}</p><div class="btns"><button class="btn line" data-act="close">Закрити</button></div>`); return; }
  const t = inviteText(p), enc = encodeURIComponent(t), tgl = (p?.links || []).find(l => l.t === 'tg'), ph = (p?.links || []).find(l => l.t === 'tel' || l.t === 'vb');
  modal(`<h2>Запросити ${p ? esc(short(p)) : 'родича'}</h2>
    <textarea class="in" id="inv-t" style="min-height:130px">${esc(t)}</textarea>
    <div class="invb">${navigator.share ? '<button class="btn" data-act="inv-share">Надіслати…</button>' : ''}
      <a class="btn line s-tg" href="https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(t.replace(link, '').trim())}" target="_blank" rel="noopener noreferrer"><span class="si">TG</span> Telegram</a>
      <a class="btn line s-vb" href="viber://forward?text=${enc}"><span class="si">Vb</span> Viber</a>
      <a class="btn line s-wa" href="https://wa.me/${ph && /^\+\d+$/.test(ph.u) ? ph.u.slice(1) : ''}?text=${enc}" target="_blank" rel="noopener noreferrer"><span class="si">WA</span> WhatsApp</a>
      ${ph ? `<a class="btn line" href="sms:${esc(ph.u)}?&body=${enc}">SMS</a>` : ''}
      <button class="btn line" data-act="inv-copy">Скопіювати</button></div>
    ${tgl ? `<p class="small muted">Або скопіюйте текст і відкрийте чат: <a href="${esc(tgl.u)}" target="_blank" rel="noopener noreferrer">${esc(socLabel(tgl))}</a></p>` : ''}
    <p class="small muted">Після реєстрації ви побачите заявку у «Власнику» і прив'яжете людину до її картки.</p>
    <div class="btns"><button class="btn line" data-act="close">Закрити</button><span class="msg" id="invmsg"></span></div>`);
}

/* ── ДНК ── */
const DNA_CO = ['MyHeritage', 'FamilyTreeDNA', 'Ancestry', '23andMe', 'GEDmatch', 'інше'];
function vDna() {
  const L = CFG_().dna || [], tested = Object.values(P).filter(p => p.dna);
  const so = S.ui.dnaSort || 'cm';
  const rows = L.slice().sort((a, b) => so === 'cm' ? (b.cm || 0) - (a.cm || 0) : so === 'name' ? a.name.localeCompare(b.name, 'uk') : String(b.at).localeCompare(String(a.at)));
  return `<div class="lede"><h1>ДНК-тести</h1><p class="small muted">Хто з нас здав тест і кого через нього знайшли. Самих ДНК-даних тут немає — лише імена й ступінь спорідненості.</p></div>
  <div class="hgrid"><div class="sec"><h3>Хто здав тест</h3>${tested.length ? `<div class="row wrapmini">${tested.map(p => `<span class="dnam">${mini(p.id)}<i>${esc(p.dna)}</i></span>`).join('')}</div>` : '<p class="muted small">Ще ніхто. Позначка ставиться на картці людини → «Зв\'язок» → «Змінити».</p>'}</div>
  <div class="sec"><h3>Як це працює</h3><ol class="small"><li>Купуєте набір (MyHeritage, FamilyTreeDNA, Ancestry) — пробірка поштою.</li><li>Через 4–8 тижнів у вашому акаунті — список «ДНК-збігів»: люди зі спільною ДНК і оцінкою спорідненості в сантиморганах (сМ).</li><li>Найкраще, коли тест здадуть 2–3 людини з різних гілок — тоді видно, через яку гілку кожен збіг.</li><li>Знайдених вносимо сюди й прив'язуємо до дерева.</li></ol><p class="small muted">Орієнтир: 3400 сМ — батьки/діти; ~850 — двоюрідні; ~200 — троюрідні; 50–100 — четвероюрідні.</p></div></div>
  <div class="sec"><h3>Знайдені через ДНК ${canEdit() ? '<button class="btn line small" data-act="dna-new">+ Додати збіг</button>' : ''}</h3>
    ${rows.length ? `<div class="tablebox"><table class="t"><thead><tr><th data-act="dna-sort" data-v="name" class="${so === 'name' ? 'on' : ''}">Хто</th><th>Де</th><th data-act="dna-sort" data-v="cm" class="${so === 'cm' ? 'on' : ''}">сМ</th><th>Ймовірно</th><th>Чий тест</th><th>Через кого в дереві</th><th></th></tr></thead><tbody>${rows.map(x => `<tr><td><b>${esc(x.name)}</b>${x.where ? `<br><span class="small muted">${esc(x.where)}</span>` : ''}</td><td class="small">${esc(x.co)}</td><td class="mono">${x.cm ?? '—'}</td><td class="small">${esc(x.rel)}</td><td class="small">${x.tester && P[x.tester] ? pLink(x.tester) : ''}</td><td class="small">${x.via && P[x.via] ? pLink(x.via) : '<span class="muted">ще не ясно</span>'}${x.note ? `<br><span class="muted">${esc(x.note)}</span>` : ''}</td><td>${canEdit() ? `<button class="btn line small" data-act="dna-edit" data-id="${x.id}">✎</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">Поки нікого.</p>'}</div>`;
}
function openDnaEdit(id) {
  const x = (CFG_().dna || []).find(d => d.id === id) || {};
  modal(`<h2>${id ? 'Змінити' : 'Новий'} ДНК-збіг</h2><div class="grid2">
    <label class="f">Ім'я (як у базі)<input class="in" id="dn-n" value="${esc(x.name || '')}"></label>
    <label class="f">Де живе<input class="in" id="dn-w" value="${esc(x.where || '')}" placeholder="Напр.: Канада, Торонто"></label>
    <label class="f">База<select class="in" id="dn-c">${DNA_CO.map(c => `<option${x.co === c ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
    <label class="f">Спільна ДНК, сМ<input class="in" id="dn-cm" inputmode="numeric" value="${x.cm ?? ''}"></label>
    <label class="f">Ймовірна спорідненість (з бази)<input class="in" id="dn-r" value="${esc(x.rel || '')}" placeholder="Напр.: троюрідний брат"></label>
    <label class="f">Чий тест показав збіг${pick('dn-t', x.tester)}</label>
    <label class="f">Через кого в дереві (якщо ясно)${pick('dn-v', x.via)}</label>
    <label class="f">Примітка<input class="in" id="dn-o" value="${esc(x.note || '')}"></label></div>
    <div class="btns"><button class="btn" data-act="dna-save" data-id="${id || ''}">Зберегти</button><button class="btn line" data-act="close">Скасувати</button>${id ? `<button class="btn danger small" data-act="dna-del" data-id="${id}" style="margin-left:auto">Видалити</button>` : ''}<span class="msg" id="dnmsg"></span></div>`);
}

/* ── Дерево-плакат ── */
function openPoster() {
  modal(`<h2>Дерево-плакат для друку</h2>
    <p class="small muted">Збирає дерево з усіма гілками, які зараз відкриті на сторінці «Дерево», у велику картинку з рамкою й заголовком. Відкрийте потрібні гілки (кнопки ▲ ▾ ▸), а потім натисніть «Зробити плакат».</p>
    <label class="f">Заголовок<input class="in" id="po-t" value="Наш родовід"></label>
    <label class="f">Підзаголовок<input class="in" id="po-s" value="Родинне дерево · Вороньки — Веприк — Лідин"></label>
    <label class="f">Формат<select class="in" id="po-f"><option value="A2">A2 (42×59 см)</option><option value="A1" selected>A1 (59×84 см)</option><option value="A0">A0 (84×119 см)</option><option value="fit">Як є, без полів</option></select></label>
    <label class="f">Орієнтація<select class="in" id="po-o"><option value="auto">Сама підбере</option><option value="land">Альбомна</option><option value="port">Книжкова</option></select></label>
    <div class="btns"><button class="btn" data-act="po-go">Зробити плакат</button><button class="btn line" data-act="close">Скасувати</button><span class="msg" id="pomsg"></span></div>
    <p class="small muted">Друкувати — у копіцентрі «широкоформатний друк», файл PNG 300 dpi. Скажіть, що це плакат на папері 180 г/м² або на полотні.</p>`);
}
async function posterMake() {
  const o = { t: $('#po-t').value.trim(), s: $('#po-s').value.trim(), f: $('#po-f').value, or: $('#po-o').value }, m = $('#pomsg');
  m.className = 'msg'; m.textContent = 'Будую плакат…';
  S.ui.poster = o; closeLayer();
  if (S.view !== 'tree') { location.hash = '#/tree'; await new Promise(r => setTimeout(r, 900)); }
  try { await treePng(o); } catch (e) { toast('Не вдалося зробити плакат: ' + (e.message || e)); } finally { S.ui.poster = null; }
}

/* ── Головна ── */
function vHome() {
  const me = P[S.me?.person_id], nm = String(S.me?.name || '').split(/\s+/)[0];
  const living = Object.values(P).filter(p => isLiving(p) && !accSet().has(p.id) && p.id !== S.me?.person_id).length;
  const VA = voicesOf().filter(x => !x.pending || isOwner() || x.by === S.me.id), VN = VA.length, V = VA.slice(-3).reverse();
  return `<div class="lede"><h1>Вітаємо${nm ? ', ' + esc(nm) : ''}!</h1><p class="small muted">Родинний архів: дерево, документи з архівів, фото, спогади й голоси наших.</p></div>
  ${statTiles()}
  <div class="hgrid">
    <div class="hcol">
            <div class="hcard h-iv${ivOpen().length ? ' pulse' : ''}"><h3>🎙 Питання для розмови ${ivOpen().length ? `<i class="ivcnt">${ivOpen().length}</i>` : ''} <a class="small" href="#/iv">усі →</a></h3><p class="small muted" style="margin:0 0 8px">Сайт сам склав питання з того, чого бракує в дереві. Знаєте відповідь — напишіть; не знаєте — спитайте старших.</p>${ivOpen().slice(0, 3).map(q => `<p class="small" style="margin:0 0 6px">• ${esc(q.t)}</p>`).join('')}<a class="btn small" href="#/iv">Відповісти на питання</a></div>
      ${tgCard()}
      <div class="h-today">${todayCard()}</div>
      <div class="hcard h-kin"><h3>Ким ми доводимось? <a class="small" href="#/kin">усе →</a></h3>${kinBox(S.ui.kinA || (me ? me.id : rootId()), S.ui.kinB || null)}</div>
      <div class="hcard h-voice"><h3>Голоси роду <a class="small" href="#/voices">усі${VN > 3 ? ' ' + VN : ''} →</a></h3>${V.length ? `<div class="vlist">${V.map(voiceRow).join('')}</div>` : '<p class="small muted">Ще немає жодного запису. Попросіть бабусю чи дідуся розповісти, як жили, — і запишіть просто з телефона. Це найцінніше, що можна зберегти.</p>'}<div class="btns"><button class="btn wine" data-act="v-rec">🎙 Записати історію</button></div></div>
    </div>
    <div class="hcol">
      <div class="hcard h-hyp"><h3>Припущення <a class="small" href="#/hyp">усі →</a></h3><p class="small muted">Те, що ще не підтверджено документами. Знаєте щось — підтвердіть, спростуйте чи доповніть.</p>${(() => { const all = hypItems().filter(x => x.cat === 'hyp' || x.cat === 'kin'), H = all.sort((a, b) => b.p - a.p).slice(0, 2); return H.length ? `<ul class="hypprev">${H.map(x => { const n = hypAns(x.id).length, pr = x.p >= 75 ? ['hi', 'Дуже ймовірно'] : x.p >= 50 ? ['mid', 'Ймовірно'] : ['lo', 'Можливо']; return `<li><button class="hpv" data-act="hyp-open" data-id="${esc(x.id)}"><span class="hpv-h"><span class="hyp-pr pr-${pr[0]}">${pr[1]}</span>${x.cat === 'kin' ? '<span class="hpv-k">можлива рідня</span>' : ''}</span><b>${esc(x.title)}</b><span class="hpv-t">${esc(String(x.text || '').slice(0, 140))}${String(x.text || '').length > 140 ? '…' : ''}</span><span class="hpv-f">${n ? '💬 ' + n + ' відповід.' : 'Ще ніхто не відповів — будьте першим'} <i>Щось знаю →</i></span></button></li>`; }).join('')}</ul><a class="btn line small hpv-all" href="#/hyp">Усі припущення (${all.length}) →</a>` : (TXT.hyps === undefined ? '<p class="small muted">Завантажую…</p>' : ''); })()}</div>
      <div class="hcard h-help"><h3>Допоможіть знайти <a class="small" href="#/help">усе →</a></h3>${wantList(4)}</div>

      <div class="hcard h-ask"><h3>Хто на фото? <a class="small" href="#/help">усе →</a></h3>${askGrid(6)}${askDone(false)}</div>
      <div class="hcard"><h3>Запросіть родичів</h3><p class="small muted">${living ? `У дереві ще ${living} живих родичів без доступу до сайту.` : ''} Надішліть посилання у Viber чи Telegram одним дотиком.</p><div class="btns"><button class="btn" data-act="inv" data-id="">Запросити</button><a class="btn line" href="#/people">Знайти людину</a></div></div>
      <div class="hcard links3">
        <a href="#/geo"><b>🗺 Карта роду</b><span>Де жили наші — з 1780-х до сьогодні</span></a>
        <a href="#/stats"><b>📊 Цифри роду</b><span>Імена, довгожителі, найбільші родини</span></a>
        <button data-act="poster"><b>🖼 Дерево-плакат</b><span>Велика картинка для друку на стіну</span></button>
        <a href="#/dna"><b>🧬 ДНК-тести</b><span>Як знайти родичів у світі</span></a>
        <a href="#/terms"><b>📖 Словник і джерела</b><span>Що за документи й що означають старі слова</span></a>
      </div>
    </div>
  </div>`;
}

/* ── Дії нових розділів ── */
const kinShort = (a, b) => { if (!a || !b || a === b || !P[a] || !P[b]) return ''; const r = kinship(a, b); return r?.word || ''; };
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset?.vsel) { S.ui[t.dataset.vsel] = t.value; S.ui.keepScroll = true; render(); return; }
  if (t.id === 'kin-a' || t.id === 'kin-b') { const v = pickVal(t.id); if (!v && t.value.trim()) return; S.ui[t.id === 'kin-a' ? 'kinA' : 'kinB'] = v; ev('open', 'kin', 'kin:' + (S.ui.kinA || '') + ':' + (S.ui.kinB || '')); S.ui.keepScroll = true; render(); }
  if (t.dataset?.st) { const k = t.dataset.st; if (k === 'stPer') { S.ui.stPer = t.value; if (t.value && t.value !== 'own') { const [a, b] = t.value.split('-'); S.ui.stY0 = a; S.ui.stY1 = b; } else if (!t.value) { S.ui.stY0 = S.ui.stY1 = ''; } } else S.ui[k] = t.value; S.ui.keepScroll = true; render(); }
});
// сортування таблиць кліком по заголовку (таблиці з класом sortable)
document.addEventListener('click', e => {
  const th = e.target.closest('table.sortable th[data-sort]'); if (!th) return;
  const tb = th.closest('table').tBodies[0], i = +th.dataset.sort, num = !!th.dataset.num, dir = th.dataset.dir === 'asc' ? 'desc' : 'asc';
  th.closest('tr').querySelectorAll('th').forEach(x => { delete x.dataset.dir; x.classList.remove('on'); }); th.dataset.dir = dir; th.classList.add('on');
  const val = r => { const c = r.cells[i]?.textContent.trim() || ''; return num ? (parseFloat(c.replace(/[^\d.-]/g, '')) || 0) : c; };
  [...tb.rows].sort((a, b) => { const x = val(a), y = val(b); const c = num ? x - y : String(x).localeCompare(String(y), 'uk'); return dir === 'asc' ? c : -c; }).forEach(r => tb.appendChild(r));
});
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-act],[data-phask]'); if (!t) return;
  const a = t.dataset.act, id = t.dataset.id;
  try {
    if (t.dataset.phask != null) { const pid = t.dataset.phask; if (!pid) return; const on = !(CFG_().photoAsk || {})[pid];
      if (!on) { closeLayer(); photoTag([pid], 0, null, { title: 'Хто ж на фото?', save: 'Зберегти й прибрати з «Хто на фото?»', note: 'Оберіть людей з дерева — фото з’явиться в них на картці.', done: async () => { const r = await api('/api/data', { body: { op: 'photo.ask', id: pid, on: false } }); S.data.cfg.photoAsk = r.photoAsk; } }); return; } const r = await api('/api/data', { body: { op: 'photo.ask', id: pid, on } }); S.data.cfg.photoAsk = r.photoAsk; closeLayer(); S.ui.keepScroll = true; render(); toast(on ? 'Фото додано в «Хто на фото?» — родичі побачать його на головній' : 'Прибрано з «Хто на фото?»'); return; }
    if (!a) return;
    if (a === 'tg-set') return openTgSet();
    if (a === 'tg-save') { const m = $('#tgmsg'); try { const r = await api('/api/data', { body: { op: 'cfg.tg', url: $('#tg-u').value.trim() } }); S.data.cfg.tg = r.tg; closeLayer(); S.ui.keepScroll = true; render(); toast('Збережено'); } catch (err) { m.className = 'msg err'; m.textContent = err.message === 'bad_url' ? 'Потрібне посилання виду https://t.me/+… або https://t.me/назва' : errText(err); } return; }
    if (a === 'kin-swap') { const x = S.ui.kinA || pickVal('kin-a'), y = S.ui.kinB || pickVal('kin-b'); S.ui.kinA = y; S.ui.kinB = x; S.ui.keepScroll = true; render(); return; }
    if (a === 'kin-go') { e.preventDefault(); S.ui.kinA = S.me?.person_id; S.ui.kinB = id; location.hash = '#/kin'; return; }
    if (a === 'ask-open') return openAsk(id);
    if (a === 'ask-rot') { const ph = S.data.photos.find(x => x.id === id); if (!canRot(ph)) return; t.closest('.ask-rot')?.querySelectorAll('button').forEach(b => { b.disabled = true; }); toast('Повертаю…');
      try { const bm = await photoBitmap(id); const c = document.createElement('canvas'); c.width = bm.height; c.height = bm.width; const g = c.getContext('2d'); g.translate(c.width / 2, c.height / 2); g.rotate((t.dataset.dir === 'r' ? 1 : -1) * Math.PI / 2); g.drawImage(bm, -bm.width / 2, -bm.height / 2); bm.close?.();
        await photoReplace(id, await canvasJpeg(c)); closeLayer(); await load(); S.ui.keepScroll = true; render(); openAsk(id); toast('Фото повернуто. Оригінал лишився.'); }
      catch (err) { t.closest('.ask-rot')?.querySelectorAll('button').forEach(b => { b.disabled = false; }); toast(errText(err)); } return; }
    if (a === 'ask-zoom') { const ph = S.data.photos.find(x => x.id === id); if (ph) viewer({ title: ph.caption || 'Хто на фото?', pages: [img('photo=' + id)], people: P[ph.person] ? [ph.person] : [] }); return; }
    if (a === 'rt-new') { modal(`<h2>Новий маршрут</h2><div class="sec" style="gap:10px"><label class="f">Назва<input class="in" id="rn-t" maxlength="120" placeholder="Напр.: «Вороньки бабусі Насті»"></label><label class="f">Про маршрут <small class="muted">(не обов'язково)</small><textarea class="in" id="rn-i" maxlength="2000" placeholder="Чиї це місця, які роки…"></textarea></label><div class="btns"><button class="btn" data-act="rt-create">Створити й ставити точки</button><button class="btn line" data-act="close">Скасувати</button><span class="msg" id="rn-m"></span></div></div>`); return; }
    if (a === 'rt-create') { const t_ = $('#rn-t').value.trim(); if (!t_) { const m = $('#rn-m'); m.className = 'msg err'; m.textContent = 'Напишіть назву.'; return; } t.disabled = true; const res = await rtSave(null, { title: t_, intro: $('#rn-i').value.trim(), pts: [] }); closeLayer(); S.ui.rtEd = res.id; S.ui.rtI = -1; location.hash = href('routes', res.id); return; }
    if (a === 'rt-edit') { S.ui.rtEd = S.arg; render(); return; }
    if (a === 'rt-done') { const r = RTS().find(x => x.id === S.arg); t.disabled = true; try { await rtSave(r, { title: $('#rt-t').value.trim() || r.title, intro: $('#rt-i').value.trim() }); } catch (e) { toast(errText(e)); } S.ui.rtEd = null; S.ui.rtI = -1; render(); toast('Маршрут збережено'); return; }
    if (a === 'rt-del') { if (t.dataset.armed !== '1') { t.dataset.armed = '1'; t.textContent = 'Точно видалити маршрут?'; return; } await api('/api/data', { body: { op: 'route.del', id: S.arg } }).then(res => { S.data.cfg.routes = res.routes; }); location.hash = '#/routes'; return; }
    if (a === 'map-base') { S.ui.rtBase = t.dataset.v; S.ui.keepScroll = true; render(); return; }
    if (a === 'rt-ll') { const r = RTS().find(x => x.id === S.arg), ll = parseLL($('#rt-ll')?.value); if (!ll) { toast('Не розпізнав координати. Приклад: 50°41\'10.2"N 31°38\'02.9"E або 50.68617, 31.63414'); return; }
      const G = S.ui.rtG; if (G) { [G.cx, G.cy] = merc(ll[0], ll[1]); G.z = Math.max(G.z, 16); G.paint?.(); } rtPointForm(r, null, ll); return; }
    if (a === 'rt-z') { const G = S.ui.rtG; if (G) { G.z = Math.max(4, Math.min(18, G.z + +t.dataset.v)); G.paint(); } return; }
    if (a === 'rt-pick' || a === 'rt-go') { const r = RTS().find(x => x.id === S.arg); if (!r?.pts.length) return; let i = a === 'rt-pick' ? +t.dataset.v : Math.max(0, Math.min(r.pts.length - 1, (S.ui.rtI ?? -1) + +t.dataset.v)); S.ui.rtI = i;
      const G = S.ui.rtG; if (G) { const [wx, wy] = merc(r.pts[i].la, r.pts[i].lo); G.cx = wx; G.cy = wy; G.z = Math.max(G.z, 15); }
      S.ui.keepScroll = true; render(); document.getElementById('rtp-' + i)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
    if (a === 'face-tag') { faceTag(t.dataset.v, null, t.dataset.p); return; }
    if (a === 'rt-ph') { openPhoto(t.dataset.v); return; }
    if (a === 'rt-yt') { const v = t.dataset.v; if (!/^[\w-]{11}$/.test(v)) return; const w = document.createElement('div'); w.className = 'rtyt'; w.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${v}?autoplay=1&rel=0" title="Відео" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe><button type="button" class="btn line small" data-act="rt-ytx">Закрити відео</button>`; t.closest('.rtmed').after(w); return; }
    if (a === 'rt-ytx') { t.closest('.rtyt')?.remove(); return; }
    if (a === 'rt-pe') { const r = RTS().find(x => x.id === S.arg); rtPointForm(r, +t.dataset.v); return; }
    if (a === 'rp-save') { t.disabled = true; try { await RTF?.(); } catch (e) { t.disabled = false; const m = $('#rp-m'); if (m) { m.className = 'msg err'; m.textContent = errText(e); } } return; }
    if (a === 'rt-up' || a === 'rt-dn' || a === 'rt-pd') { const r = RTS().find(x => x.id === S.arg), k = +t.dataset.v, pts = r.pts.slice();
      if (a === 'rt-pd') { if (t.dataset.armed !== '1') { t.dataset.armed = '1'; t.textContent = 'видалити?'; return; } pts.splice(k, 1); } else { const j = a === 'rt-up' ? k - 1 : k + 1; [pts[k], pts[j]] = [pts[j], pts[k]]; }
      await rtSave(r, { pts }); S.ui.keepScroll = true; render(); return; }
    if (a === 'w-save') { const m = $('#w-msg'), v = id => $('#' + id).value.trim(); if (!v('w-w') || !v('w-m')) { m.className = 'msg err'; m.textContent = 'Напишіть слово і що воно означає.'; return; }
      t.disabled = true; try { const r = await api('/api/data', { body: { op: 'word.save', id: t.dataset.id || '', w: v('w-w'), m: v('w-m'), ex: v('w-ex'), pl: v('w-pl') } }); S.data.cfg.words = r.words; S.ui.wEdit = null; S.ui.keepScroll = true; render(); toast('Слово збережено — дякуємо!'); } catch (e) { t.disabled = false; m.className = 'msg err'; m.textContent = errText(e); } return; }
    if (a === 'w-edit') { S.ui.wEdit = t.dataset.id; render(); $('#wform')?.scrollIntoView({ block: 'start' }); return; }
    if (a === 'w-cancel') { S.ui.wEdit = null; render(); return; }
    if (a === 'w-del') { if (t.dataset.armed !== '1') { t.dataset.armed = '1'; t.textContent = 'точно видалити?'; return; } const r = await api('/api/data', { body: { op: 'word.del', id: t.dataset.id } }); S.data.cfg.words = r.words; S.ui.keepScroll = true; render(); toast('Видалено'); return; }
    if (a === 'w-jump') { document.getElementById('w-' + t.dataset.l)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    if (a === 'fb-open') { openFBook(t.dataset.id); return; }
    if (a === 'fb-pdf') { t.disabled = true; fbPdf().catch(e => { console.warn(e); t.disabled = false; const m = $('#fb-msg'); if (m) { m.className = 'msg err'; m.textContent = errText(e); } }); return; }
    if (a === 'fb-make') { t.disabled = true; makeFBook().catch(e => { t.disabled = false; const m = $('#fb-msg'); if (m) { m.className = 'msg err'; m.textContent = errText(e); } }); return; }
    if (a === 'iv-who') { S.ui.ivWho = t.dataset.id; scrollTo(0, 0); render(); return; }
    if (a === 'iv-me') { S.ui.ivWho = startId(); render(); return; }
    if (a === 'iv-print') { window.print(); return; }
    if (a === 'iv-open') { const f = document.getElementById('ivf-' + t.dataset.k); if (f) { f.hidden = !f.hidden; f.querySelector('textarea')?.focus(); } return; }
    if (a === 'iv-rec') { openRec(t.dataset.id); const c = $('#rec-c'); if (c) c.value = 'Відповідь: ' + t.dataset.q.slice(0, 180); return; }
    if (a === 'iv-save') { const f = document.getElementById('ivf-' + t.dataset.k), ta = f.querySelector('textarea'), m = f.querySelector('.msg'); const v = ta.value.trim(); if (!v) { m.className = 'msg err'; m.textContent = 'Напишіть відповідь.'; return; }
      t.disabled = true; try { const r = await api('/api/data', { body: { op: 'story.add', target: 'iv:' + t.dataset.id, text: `«${t.dataset.q}» — ${v}` } }); S.data.stories.push(r.story); S.ui.keepScroll = true; render(); toast('Відповідь збережено — дякуємо!'); } catch (e) { t.disabled = false; m.className = 'msg err'; m.textContent = errText(e); } return; }
    if (a === 'bk-run' || a === 'bk-ged') return isOwner() && backupRun(a === 'bk-run');
    if (a === 'ask-new') return openAskNew({ person: t.dataset.p || '' });
    if (a === 'ask-send') return askSend(t);
    if (a === 'ask-off') { closeLayer();
      photoTag([id], 0, null, { title: 'Хто ж на фото?', save: 'Зберегти й прибрати з «Хто на фото?»', note: 'Оберіть людей з дерева — фото з’явиться в них на картці. Підказки родичів залишаться під фото.',
        done: async () => { const r = await api('/api/data', { body: { op: 'photo.ask', id, on: false } }); S.data.cfg.photoAsk = r.photoAsk; } }); return; }
    if (a === 'ask-back') { const r = await api('/api/data', { body: { op: 'photo.ask', id, on: true } }); S.data.cfg.photoAsk = r.photoAsk; S.ui.keepScroll = true; render(); toast('Фото знову в «Хто на фото?»'); return; }
    if (a === 'v-rec') return openRec(id);
    if (a === 'rec-go') return recToggle();
    if (a === 'rec-cancel') { recStop(); closeLayer(); return; }
    if (a === 'rec-mode') { if (!REC) return; const d = t.dataset; REC.mode = d.v; document.querySelectorAll('[data-act="rec-mode"]').forEach(b => b.classList.toggle('on', b.dataset.v === d.v)); $('.rec-p').hidden = d.v !== 'p'; $('.rec-fam').hidden = d.v !== 'fam'; return; }
    if (a === 'rec-save') {
      if (!REC?.blob) return; const m = $('#recmsg');
      if (!REC.pid) { const v = REC.mode === 'fam' ? $('#rec-fam')?.value : $('#rec-p')?.value; if (!v) { m.className = 'msg err'; m.textContent = 'Оберіть, про кого ця розповідь (або «Загальна історія роду»).'; return; } REC.pid = v; }
      t.disabled = true; m.className = 'msg'; m.textContent = 'Зберігаю…';
      try { const r = await voiceUpload(REC.pid, $('#rec-c').value.trim(), REC.blob, (i, n) => { m.textContent = `Надсилаю… частина ${i + 1} з ${n}, не закривайте вікно`; }); const pid = REC.pid; recStop(); await load(); closeLayer(); S.ui.keepScroll = true; render(); toast(r.pending ? 'Запис збережено — з\'явиться для всіх після підтвердження Максимом' : 'Голосовий спогад збережено'); ev('open', 'voice', 'person:' + pid); }
      catch (err) { t.disabled = false; m.className = 'msg err'; m.textContent = err.message === 'type' ? 'Цей формат не підтримується. Підійдуть mp3, m4a, wav, ogg, webm.' : errText(err); }
      return;
    }
    if (a === 'v-play') {
      const row = t.closest('.vrow'), au = row?.querySelector('audio'); if (!au) return;
      if (!au.src) { t.textContent = '…'; try { au.src = await voiceUrl(id); } catch { t.textContent = '!'; toast('Не вдалося відкрити запис'); return; } }
      au.hidden = false; t.hidden = true; au.play().catch(() => {}); ev('open', 'voice', 'photo:' + id); return;
    }
    if (a === 'geo-k') { S.ui.geoK = t.dataset.k; S.ui.geoY = new Date().getFullYear(); if (S.ui.geo) S.ui.geo.cx = null; return; }
    if (a === 'geo-w') { S.ui.geoW = t.dataset.v; t.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === t)); S.ui.geo?.paint?.(); return; }
    if (a === 'geo-z') { const G = S.ui.geo; if (G) { G.z = Math.max(4, Math.min(17, G.z + +t.dataset.v)); G.paint(); } return; }
    if (a === 'geo-pin') { S.ui.geoK = t.dataset.k; S.ui.geo?.paint?.(); $('#geolist')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); return; }
    if (a === 'geo-place') { S.ui.geoPlacing = t.dataset.k; $('#geomap')?.classList.add('placing'); $('#geomap')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); toast(`Клацніть на карті, де «${t.dataset.k}»`); return; }
    if (a === 'geo-unplace') { const r = await api('/api/data', { body: { op: 'place.set', name: t.dataset.k, clear: true } }); S.data.cfg.places = r.places; S.ui.keepScroll = true; render(); return; }
    if (a === 'geo-play') {
      const r = $('#geo-y'); if (!r) return; if (S.ui.geoTimer) { clearInterval(S.ui.geoTimer); S.ui.geoTimer = null; t.textContent = '▶ Програти історію'; return; }
      let y = +r.min; t.textContent = '⏸ Зупинити'; S.ui.geoTimer = setInterval(() => { const rr = $('#geo-y'); if (!rr || y > +rr.max) { clearInterval(S.ui.geoTimer); S.ui.geoTimer = null; const b = $('[data-act="geo-play"]'); if (b) b.textContent = '▶ Програти історію'; return; } rr.value = y; S.ui.geoY = y; $('#geo-yl').textContent = y; S.ui.geo?.paint?.(); y += 2; }, 120); return;
    }
    if (a === 'want-open') return openWant(id);
    if (a === 'want-new') return openWantEdit('');
    if (a === 'want-edit') return openWantEdit(id);
    if (a === 'want-save') { const m = $('#wmsg'); try { const r = await api('/api/data', { body: { op: 'want.save', id, text: $('#w-t').value.trim(), person: pickVal('w-p') || '', done: !!$('#w-d')?.checked, answer: $('#w-a')?.value || '' } }); S.data.cfg.wanted = r.wanted; closeLayer(); S.ui.keepScroll = true; render(); toast('Збережено'); } catch (err) { m.className = 'msg err'; m.textContent = err.message === 'empty' ? 'Напишіть, що шукаємо.' : errText(err); } return; }
    if (a === 'want-del') { if (t.dataset.armed !== '1') { t.dataset.armed = '1'; t.textContent = 'Точно видалити?'; return; } const r = await api('/api/data', { body: { op: 'want.del', id } }); S.data.cfg.wanted = r.wanted; closeLayer(); S.ui.keepScroll = true; render(); return; }
    if (a === 'inv') return openInvite(id);
    if (a === 'inv-copy') { const v = $('#inv-t').value; try { await navigator.clipboard.writeText(v); } catch { $('#inv-t').select(); document.execCommand?.('copy'); } $('#invmsg').textContent = 'Скопійовано — вставте в чат.'; ev('open', 'invite', 'copy'); return; }
    if (a === 'inv-share') { try { await navigator.share({ text: $('#inv-t').value }); ev('open', 'invite', 'share'); } catch {} return; }
    if (a === 'dna-new') return openDnaEdit('');
    if (a === 'dna-edit') return openDnaEdit(id);
    if (a === 'dna-sort') { S.ui.dnaSort = t.dataset.v; render(); return; }
    if (a === 'dna-save') { const m = $('#dnmsg'), v = k => ($('#' + k)?.value || '').trim(); try { const r = await api('/api/data', { body: { op: 'dna.save', id, name: v('dn-n'), where: v('dn-w'), co: v('dn-c'), cm: v('dn-cm'), rel: v('dn-r'), tester: pickVal('dn-t') || '', via: pickVal('dn-v') || '', note: v('dn-o') } }); S.data.cfg.dna = r.dna; closeLayer(); S.ui.keepScroll = true; render(); toast('Збережено'); } catch (err) { m.className = 'msg err'; m.textContent = err.message === 'empty' ? "Вкажіть ім'я." : errText(err); } return; }
    if (a === 'dna-del') { if (t.dataset.armed !== '1') { t.dataset.armed = '1'; t.textContent = 'Точно видалити?'; return; } const r = await api('/api/data', { body: { op: 'dna.del', id } }); S.data.cfg.dna = r.dna; closeLayer(); S.ui.keepScroll = true; render(); return; }
    if (a === 'poster') return openPoster();
    if (a === 'po-go') return posterMake();
  } catch (err) { toast(errText(err)); }
});

/* ═════════ Припущення: усе, що ще не підтверджено (13.10) ═════════ */
const hHash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return (h >>> 0).toString(36); };
const plainMd = t => String(t || '').replace(/\[\[[pd]:[a-z0-9_-]+\|([^\]]+)\]\]/gi, '$1').replace(/\*\*?([^*]+)\*\*?/g, '$1').replace(/^#+\s*/gm, '');
const hypSent = t => { // речення з «Є припущення» (і наступне, якщо воно пояснює)
  const out = []; const S_ = String(t || '').split(/(?<=[.!?])\s+/);
  S_.forEach((s, i) => { if (/Є припущення|не підтвердж|не перевірено/i.test(s)) out.push(s + (S_[i + 1] && !/Є припущення/.test(S_[i + 1]) && S_[i + 1].length < 220 ? ' ' + S_[i + 1] : '')); });
  return out;
};
function hypItems() {
  const L = [], cur = loadText('hyps', true);
  (cur?.items || []).forEach(x => L.push({ ...x, src: x.src || [], cat: x.kind === 'kin' ? 'kin' : 'hyp', p: x.p ?? 40 }));
  Object.values(P).forEach(p => {
    if (p.hyp) L.push({ p: 42, id: 'pt:' + p.id, cat: 'tree', title: `${full(p)} — місце в дереві не підтверджено`, text: 'Картка стоїть у дереві як гіпотеза: зв\'язок з батьками чи дітьми ще не підтверджено документами.', basis: '', people: [p.id] });
    hypSent(p.note).forEach((s, i) => L.push({ p: 40, id: 'pn:' + p.id + ':' + hHash(s), cat: 'card', title: full(p), text: s, people: [p.id] }));
  });
  S.data.unions.forEach(u => { if (P[u.a] && P[u.b] && /не підтвердж/i.test(u.date || '')) L.push({ p: 45, id: 'u:' + u.id, cat: 'tree', title: `${short(P[u.a])} і ${short(P[u.b])} — шлюб не підтверджено`, text: 'Спільні діти є, але запису про шлюб ще не знайдено.', people: [u.a, u.b] }); });
  S.data.documents.filter(d => d.type !== 'map').forEach(d => hypSent(d.text).forEach(s => L.push({ p: 40, id: 'pd:' + d.id + ':' + hHash(s), cat: 'card', title: d.title, text: s, docs: [d.id], people: (d.people || []).filter(x => P[x]).slice(0, 4) })));
  const hist = loadText('history', true);
  if (hist?.md) hist.md.split(/\n\s*\n/).forEach(par => { if (/Є припущення/.test(par) && !/^#/.test(par.trim())) hypSent(plainMd(par)).forEach(s => L.push({ p: 35, id: 'ph:' + hHash(s), cat: 'hist', title: '«Історія роду»', text: s, people: [...par.matchAll(/\[\[p:([a-z0-9_-]+)\|/gi)].map(m => m[1]).filter(x => P[x]).slice(0, 5) })); });
  const seen = new Set(); return L.filter(x => !seen.has(x.id) && seen.add(x.id));
}
const HYPCAT = [['', 'Усі'], ['kin', 'Можлива рідня'], ['hyp', 'Наші припущення'], ['tree', 'У дереві'], ['card', 'У картках і документах'], ['hist', 'В «Історії роду»']];
const hypAns = id => S.data.stories.filter(s => s.target === 'hyp:' + id);
const VERD = { yes: ['✓', 'Підтверджую — так і є'], no: ['✗', 'Спростовую — було не так'], add: ['✎', 'Доповнюю'] };
const verdOf = s => (String(s.text).match(/^\[(yes|no|add)\]\s*/) || [])[1] || 'add';
const ansText = s => String(s.text).replace(/^\[(yes|no|add)\]\s*/, '');
// Автоматичний «ланцюжок»: щойно пов'язане припущення хтось підтвердив або спростував — це позначається «⚡ Перегляньте»
function hypChg(x, all) {
  let seen = 0; try { seen = +localStorage.getItem('rs_hrev:' + x.id) || 0; } catch {}
  const own = Math.max(seen, ...hypAns(x.id).map(s => +new Date(s.at) || 0));
  const out = []; for (const r of hypRel(x, all)) { const V = hypAns(r.h.id).filter(s => verdOf(s) !== 'add' && +new Date(s.at) > own); if (V.length) out.push({ h: r.h, v: verdOf(V[V.length - 1]), at: V[V.length - 1].at, a: r.a }); }
  return out;
}
function hypCard(x, all) {
  const A = hypAns(x.id), c = { yes: 0, no: 0, add: 0 }; A.forEach(s => c[verdOf(s)]++); const CH = all ? hypChg(x, all) : [];
  return `<article class="hyp-c hc-${x.cat}${CH.length ? ' hyp-chg' : ''}">${CH.length ? `<div class="hypchg">⚡ <b>Змінилось пов'язане припущення:</b> ${CH.slice(0, 3).map(r => `«<button class="lnk" data-act="hyp-open" data-id="${esc(r.h.id)}">${esc(r.h.title)}</button>» — ${r.v === 'yes' ? 'підтвердили' : 'спростували'}`).join('; ')}. Перегляньте — можливо, це відкриває щось і тут.${isOwner() ? ` <button class="btn line small" data-act="hyp-seen" data-id="${esc(x.id)}">✓ Переглянуто</button>` : ''}</div>` : ''}
    <div class="hyp-h"><span class="hyp-tag">${esc((HYPCAT.find(k => k[0] === x.cat) || [])[1] || '')}</span><span class="hyp-pr pr-${x.p >= 75 ? 'hi' : x.p >= 50 ? 'mid' : 'lo'}" title="Наскільки ймовірно, за нашою оцінкою">${x.p >= 75 ? 'Дуже ймовірно' : x.p >= 50 ? 'Ймовірно' : 'Можливо'}<i style="--w:${x.p}%"></i></span>${A.length ? `<span class="hyp-v">${c.yes ? `<b class="vy">✓ ${c.yes}</b>` : ''}${c.no ? `<b class="vn">✗ ${c.no}</b>` : ''}${c.add ? `<b class="va">✎ ${c.add}</b>` : ''}</span>` : ''}</div>
    <h3>${esc(x.title)}</h3><p>${glossify(mdLinks(esc(x.text)))}</p>
    ${x.basis ? `<p class="hyp-b"><b>На чому базується:</b> ${esc(x.basis)}</p>` : ''}
    ${(x.people || []).length ? `<div class="hyp-p">${x.people.filter(id => P[id]).map(mini).join('')}</div>` : ''}
    ${(x.docs || []).length || (x.src || []).length ? `<div class="hyp-s">${(x.docs || []).filter(id => S.data.documents.some(d => d.id === id)).map(id => `<a href="#" data-doc="${id}">📄 ${esc(S.data.documents.find(d => d.id === id).title)}</a>`).join('')}${(x.src || []).map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">↗ ${esc(s.name)}</a>`).join('')}</div>` : ''}
    <div class="btns"><button class="btn small" data-act="hyp-open" data-id="${esc(x.id)}">Щось знаю, можу доповнити</button>${A.length ? `<button class="btn line small" data-act="hyp-open" data-id="${esc(x.id)}">Відповіді (${A.length})</button>` : ''}</div>
  </article>`;
}
function vHyp() {
  const all = hypItems(), cat = S.ui.hypCat || '', q = (S.ui.hypQ || '').toLowerCase();
  const chgN = all.filter(x => hypChg(x, all).length).length;
  const L = all.filter(x => (cat === 'chg' ? hypChg(x, all).length : !cat || x.cat === cat) && (!q || [x.title, x.text, x.basis].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => (b.p - a.p) || ({ hyp: 0, kin: 1, tree: 2, card: 3, hist: 4 }[a.cat] - { hyp: 0, kin: 1, tree: 2, card: 3, hist: 4 }[b.cat])); // зверху — найімовірніші
  const n = k => all.filter(x => !k || x.cat === k).length;
  const intro = loadText('hyps', true)?.intro || 'Тут усе, що ще не підтверджено документами. Знаєте щось — натисніть «Щось знаю, можу доповнити».';
  return `<div class="lede"><h1>Припущення</h1><p class="small muted">${esc(intro)}</p></div>
  <div class="hypbar"><div class="seg">${HYPCAT.filter(([k]) => !k || n(k)).map(([k, t]) => `<button data-act="hyp-cat" data-v="${k}" class="${cat === k ? 'on' : ''}">${t} <i>${n(k)}</i></button>`).join('')}${chgN ? `<button data-act="hyp-cat" data-v="chg" class="${cat === 'chg' ? 'on' : ''}">⚡ Переглянути <i>${chgN}</i></button>` : ''}</div>
    <input class="in search" id="hyp-q" type="search" value="${esc(S.ui.hypQ || '')}" placeholder="Пошук: ім'я, село…" aria-label="Пошук"></div>
  <div class="hyp-l">${L.map(x => hypCard(x, all)).join('') || '<p class="muted">Нічого не знайдено.</p>'}</div>`;
}
// Пов'язані припущення: ті самі люди (сильний зв'язок) або їхні батьки, діти, подружжя (слабший). Якщо одне підтвердиться чи спростується — ці треба переглянути.
function hypRel(x, all) {
  const mine = new Set(x.people || []), near = new Set(); mine.forEach(id => { const p = P[id]; if (!p) return; [p.f, p.mo, ...(KIDS[id] || []), ...(SPOUSES[id] || []).map(s => s.id)].forEach(y => y && !mine.has(y) && near.add(y)); });
  return all.filter(h => h.id !== x.id).map(h => { const pp = h.people || []; const a = pp.filter(y => mine.has(y)).length, b = pp.filter(y => near.has(y)).length; return { h, w: a * 3 + b, a, b }; }).filter(r => r.w).sort((p, q) => q.w - p.w).filter((r, i, A) => r.h.title !== x.title && A.findIndex(z => z.h.title === r.h.title) === i).slice(0, 10);
}
function openHyp(id) {
  const all_ = hypItems(), x = all_.find(h => h.id === id); if (!x) return; const REL_ = hypRel(x, all_);
  const A = hypAns(id);
  modal(`<h2>${esc(x.title)}</h2><p>${glossify(mdLinks(esc(x.text)))}</p>${x.basis ? `<p class="small muted"><b>На чому базується:</b> ${esc(x.basis)}</p>` : ''}
    ${REL_.length ? `<details class="hyprel"${REL_.some(r => r.a) ? ' open' : ''}><summary>🔗 Пов'язані припущення (${REL_.length}) — якщо це підтвердиться чи спростується, їх треба переглянути</summary><ul>${REL_.map(r => `<li><button class="lnk" data-act="hyp-open" data-id="${esc(r.h.id)}">${esc(r.h.title)}</button> <span class="small muted">${r.a ? 'ті самі люди' : 'їхня найближча рідня'}</span></li>`).join('')}</ul></details>` : ''}
    <h3>Що кажуть родичі</h3>${A.length ? `<div class="hyp-ans">${A.map(s => `<div class="story"><div><b class="v-${verdOf(s)}">${VERD[verdOf(s)][0]} ${VERD[verdOf(s)][1]}</b><br>${glossify(esc(ansText(s)))}</div><div class="m"><span>${esc(who(s.by))} · ${esc(when(s.at))}</span>${isOwner() || s.by === S.me.id ? `<button data-delstory="${s.id}">видалити</button>` : ''}</div></div>`).join('')}</div>` : '<p class="muted small">Ще ніхто не відповів. Будьте першим!</p>'}
    <div class="sec" style="gap:8px">
      <div class="verd">${Object.entries(VERD).map(([k, [ic, t]]) => `<label class="vd vd-${k}"><input type="radio" name="hyp-v" value="${k}"${k === 'add' ? ' checked' : ''}> <span>${ic} ${t}</span></label>`).join('')}</div>
      <textarea class="in" id="hyp-t" placeholder="Що знаєте? Звідки (хто розповідав, який документ, фото)? Навіть «здається, баба казала…» — теж допоможе."></textarea>
      <div class="btns"><button class="btn" data-act="hyp-send" data-id="${esc(id)}">Надіслати</button><button class="btn line" data-act="close">Закрити</button><span class="msg" id="hypmsg"></span></div></div>`);
}
document.addEventListener('input', e => { if (e.target.id === 'wq') { S.ui.wq = e.target.value; clearTimeout(S.ui.wqT); S.ui.wqT = setTimeout(() => { const p = e.target.selectionStart; S.ui.keepScroll = true; render(); const i = $('#wq'); if (i) { i.focus(); i.setSelectionRange(p, p); } }, 250); return; } if (e.target.id === 'iv-q') { const L = personFind(e.target.value), r = $('#iv-r'); if (r) r.innerHTML = e.target.value.trim() ? L.map(p => `<button type="button" class="tagopt" data-act="iv-who" data-id="${p.id}">${ph(p)}<span><b>${esc(full(p))}</b><i>${esc(life(p) || '')}</i></span></button>`).join('') || '<p class="muted small">Нікого не знайдено.</p>' : ''; return; } if (e.target.id === 'vq') { S.ui.vq = e.target.value; clearTimeout(S.ui.vqT); S.ui.vqT = setTimeout(() => { const p = e.target.selectionStart; S.ui.keepScroll = true; render(); const i = $('#vq'); if (i) { i.focus(); i.setSelectionRange(p, p); } }, 250); return; } if (e.target.id === 'hyp-q') { S.ui.hypQ = e.target.value; clearTimeout(S.ui.hypT); S.ui.hypT = setTimeout(() => { const p = e.target.selectionStart; S.ui.keepScroll = true; render(); const i = $('#hyp-q'); if (i) { i.focus(); i.setSelectionRange(p, p); } }, 250); } });
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-act]'); if (!t) return; const a = t.dataset.act;
  if (a === 'hyp-cat') { S.ui.hypCat = t.dataset.v; S.ui.keepScroll = true; render(); return; }
  if (a === 'hyp-open') return openHyp(t.dataset.id);
  if (a === 'hyp-seen') { try { localStorage.setItem('rs_hrev:' + t.dataset.id, Date.now()); } catch {} S.ui.keepScroll = true; render(); return; }
  if (a === 'hyp-send') {
    const txt = $('#hyp-t').value.trim(), v = (document.querySelector('input[name="hyp-v"]:checked') || {}).value || 'add', m = $('#hypmsg');
    if (!txt && v === 'add') { m.className = 'msg err'; m.textContent = 'Напишіть кілька слів.'; return; }
    t.disabled = true;
    try { const r = await api('/api/data', { body: { op: 'story.add', target: 'hyp:' + t.dataset.id, text: `[${v}] ${txt || VERD[v][1]}` } }); S.data.stories.push(r.story); S.ui.keepScroll = true; render(); openHyp(t.dataset.id); toast('Дякуємо! Максим побачить вашу відповідь.'); }
    catch (err) { t.disabled = false; m.className = 'msg err'; m.textContent = errText(err); }
  }
});

/* «Другі шапки» (вкладки, фільтри, сортування) закріплені під верхньою шапкою й складаються одна під одну */
const STICKY_SEL = 'main .pghead, main .plbar, main .mapbar, main .famchips, main .geobar, main .stbar, main .hypbar, main .bar1, main .qfilter';
function stickBars() {
  const hdr = document.querySelector('header.top'), h0 = hdr && getComputedStyle(hdr).position !== 'static' ? hdr.offsetHeight : 0;
  document.documentElement.style.setProperty('--toph', h0 + 'px');
  let top = h0;
  const book = !!document.querySelector('main .bk-book, main .bk-bar'); // у книзі шапка не прилипає — інакше накриває сторінку книги
  document.querySelectorAll(STICKY_SEL).forEach(el => { if (el.closest('.modal')) return; if (book) { el.classList.remove('stk'); el.style.top = ''; return; } el.classList.add('stk'); el.style.top = top + 'px'; top += el.offsetHeight; });
  document.documentElement.style.setProperty('--stkh', top + 'px'); // для прокрутки до якорів
}
addEventListener('resize', () => { clearTimeout(window.__stkT); window.__stkT = setTimeout(stickBars, 150); });
document.addEventListener('click', e => { const a = e.target.closest('[data-act="fam-jump"]'); if (!a) return; e.preventDefault(); const el = document.getElementById('fam-' + a.dataset.id); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stkh')) || 120) - 8, behavior: 'smooth' }); });
/* ───── Рендер ───── */
function render() {
  const app = $('#app');
  if (S.gate) { app.innerHTML = S.gate(); return; }
  if (!S.me) { app.innerHTML = vLogin(); return; }
  if (!S.data) { app.innerHTML = top() + '<main class="wrap"><p class="muted">Завантаження…</p></main>'; return; }
  if (!S.data.persons.length && isOwner()) { app.innerHTML = vSeed(); return; }
  curTarget = null;
  const V = { routes: vRoutes, words: vWords, fbook: () => { setTimeout(() => openFBook(startId()), 0); return vHome(); }, iv: vIv, home: vHome, terms: vTerms, hyp: vHyp, voices: vVoices, kin: vKin, stats: vStats, help: vHelp, geo: vGeo, dna: vDna, tree: vTree, p: vPerson, families: vFamilies, fam: vFamily, people: vPeople, docs: vDocs, admin: vAdmin, q: vQuestions, maps: vMaps, villages: vVillages }[S.view] || vHome;
  const sy = window.scrollY;
  const bkKeep = document.getElementById('bk'); // книгу не перебудовуємо, якщо сторінка та сама — щоб нічого не блимало
  app.innerHTML = top() + `<main class="wrap${S.view === 'tree' ? ' wide' : ''}">${V()}</main>${S.view === 'tree' ? '' : creditHtml()}`;
  if (!introSeen() && !document.querySelector('.introlay')) document.body.insertAdjacentHTML('beforeend', `<div class="introlay">${introHtml(true)}</div>`);
  if (S.ui.keepScroll) { window.scrollTo(0, sy); S.ui.keepScroll = false; }
  if (S.view === 'tree') requestAnimationFrame(vpMount);
  if (S.view === 'geo') requestAnimationFrame(geoMount);
  if (S.view === 'routes' && S.arg) requestAnimationFrame(rtMount);
  if (S.view === 'stats') requestAnimationFrame(stFold);
  if (S.data && S.me && !ivNudge.done) { ivNudge.done = 1; ivNudge(); }
  stickBars();
  if (S.ui.pp) ppPaint(); else document.body.classList.remove('pp-on');
  const bkNew = document.getElementById('bk');
  if (bkNew && bkKeep && BOOK.key && bkKeep.querySelector('.bk-book')?.children.length) bkNew.replaceWith(bkKeep);
  else if (bkNew) requestAnimationFrame(bookMount); else if (SND.music && !SND.music.paused) SND.stopMusic();
  if (S.view === 'fam' && S.arg) {} // окрема сторінка родини
  const key = S.view + ':' + (S.arg || '');
  if (S.ui.lastView !== key) { S.ui.lastView = key; ev('view', S.view, curTarget); if (curTarget) ev('open', S.view, curTarget); }
  if (S.view === 'admin' && isOwner() && !S.admin.loading && !S.admin[{ stats: 'stats', access: 'members', history: 'revs' }[S.admin.tab || 'stats']]) { S.admin.loading = true; loadAdmin().finally(() => { S.admin.loading = false; }); }
}

/* ───── Події ───── */
document.addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target;
  try {
    if (f.id === 'login') { $('#lg-m').textContent = 'Перевіряю…'; const r = await api('/api/auth?a=login', { body: { email: $('#lg-e').value, password: $('#lg-p').value }, noRedirect: true }); S.me = r.member; introMark(); await load(); render(); window.scrollTo(0, 0); autoImport(); }
    if (f.id === 'register') {
      const m = $('#rg-m'), v = k => ($('#rg-' + k)?.value || '').trim();
      const data = Object.fromEntries(['s', 'n', 'pt', 'm', 'sex', 'b', 'bp', 'live', 'phone', 'father', 'mother', 'gpf', 'gpm', 'spouse', 'sibs', 'link'].map(k => [k, v(k)]));
      data.kidsL = readKids($('#rg-kids')); data.kids = data.kidsL.map(k => k.n + (k.b ? ', ' + k.b : '')).join('; ');
      if (!data.father && !data.mother) { m.className = 'msg err'; m.textContent = ERR.parents; return; }
      const btn = f.querySelector('button[type=submit]'); if (btn.disabled) return; btn.disabled = true; m.className = 'msg'; m.textContent = 'Надсилаю…';
      try { await api('/api/auth?a=register', { body: { c: S.join, email: v('email'), password: $('#rg-pass').value, data }, noRedirect: true }); S.gate = regDone; render(); window.scrollTo(0, 0); }
      catch (err) { btn.disabled = false; m.className = 'msg err'; m.textContent = errText(err); }
      return;
    }
    if (f.id === 'accept') { const t = new URLSearchParams(location.search).get('invite'); const r = await api('/api/auth?a=accept', { body: { t, name: $('#ac-n').value, password: $('#ac-p').value }, noRedirect: true }); history.replaceState(null, '', '/'); S.gate = null; S.me = r.member; await load(); render(); }
    if (f.id === 'setup') { await api('/api/setup?a=init', { body: { token: $('#su-t').value, name: $('#su-n').value, email: $('#su-e').value, password: $('#su-p').value }, noRedirect: true }); S.gate = null; await start(); }
  } catch (err) { const m = f.querySelector('.msg'); if (m) { m.textContent = errText(err); m.className = 'msg err'; } }
});
document.addEventListener('input', e => {
  if (e.target.id === 'q') { S.ui.q = e.target.value; const pos = e.target.selectionStart; render(); const q = $('#q'); q.focus(); q.setSelectionRange(pos, pos); }
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.id === 'tfam') { S.ui.tf ||= {}; S.ui.tf.fam = t.value; render(); return; }
  if (['tcenter', 'tsort'].includes(t.id)) { S.ui.tf ||= {}; if (t.id === 'tcenter') S.ui.tf.center = t.value; if (t.id === 'tsort') S.ui.tf.sort = t.value; delete S.ui.vp?.all; render(); return; }
  if (t.dataset.upload) { const fs = [...t.files]; t.value = ''; if (fs.length === 1 && /^image\//.test(fs[0].type)) return openAskNew({ person: t.dataset.upload, file: fs[0] }); return upload(t.dataset.upload, fs); }
  if (t.dataset.udate) { const v = t.value.trim(); try { await api('/api/data', { body: { op: 'union.date', id: t.dataset.udate, date: v } }); const u = S.data.unions.find(x => x.id === t.dataset.udate); if (u) u.date = v; index(); toast('Дату шлюбу збережено'); } catch (er) { toast('Не вдалося зберегти дату шлюбу'); } return; }
  if (t.dataset.docup) return uploadDoc(t.dataset.docup, [...t.files]);
  if (t.dataset.docbulk) return uploadBulk([...t.files]);
  if (t.dataset.docpage) return uploadPages(t.dataset.docpage, [...t.files]);
  if (t.dataset.mapup) return uploadMap([...t.files]);
  if (t.dataset.role) { try { await api('/api/admin?a=member', { body: { id: t.dataset.role, role: t.value } }); toast('Права змінено'); } catch (err) { toast(errText(err)); } }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#layer').innerHTML) closeLayer(); });
document.addEventListener('click', e => { // людина → бічна панель (не перехід на сторінку)
  const a = e.target.closest('a.nd[data-pp], .pp-p[data-pp], a.mini, tr.click[data-go]');
  if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
  const id = a.dataset.pp || a.dataset.go || decodeURIComponent((a.getAttribute('href') || '').split('/').pop() || '');
  if (!P[id]) return; e.preventDefault(); e.stopImmediatePropagation();
  if (S.ui.pp === id && !a.closest('#pp')) { ppClose(); return; } // другий клік по тій самій людині — закрити панель
  S.ui.ppTab = S.ui.ppTab || 'life'; ppOpen(id, !!a.closest('#pp'));
}, true);
document.addEventListener('click', e => { document.querySelectorAll('details.umenu[open], details.tmore[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; }); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.ui.pp && !document.querySelector('.pv,.scrim,.msh-scrim')) ppClose(); });
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-toh],[data-tmode],[data-act],[data-add],[data-doc],[data-photo],[data-story],[data-delstory],[data-unlink],[data-portrait],[data-delphoto],[data-famedit],[data-go],[data-atab],[data-per],[data-member],[data-k],[data-revert],[data-reset],[data-revoke],[data-active],[data-close-scrim],[data-pg],[data-zoom]');
  if (!t) return;
  if (t.hasAttribute('data-close-scrim')) { if (e.target === t) closeLayer(); return; }
  const d = t.dataset;
  try {
    if (d.tmode) { S.ui.tmode = d.tmode; delete S.ui.vp?.[d.tmode]; delete S.ui.vp?.all; render(); return; }
    if (d.go) { location.hash = href('p', d.go); return; }
    if (d.toh) { e.preventDefault(); document.getElementById(d.toh)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (d.doc) { e.preventDefault(); return openDoc(d.doc); }
    if (d.photo) { e.preventDefault(); return openPhoto(d.photo, d.pctx); }
    if (d.add) { const base = P[S.arg]; return openAdd(d.add, d.add === 'new' ? null : base); }
    if (d.story) {
      const ta = document.getElementById('st-' + d.story), m = document.getElementById('stm-' + d.story);
      if (!ta.value.trim()) { m.textContent = 'Напишіть кілька слів.'; return; }
      t.disabled = true; const r = await api('/api/data', { body: { op: 'story.add', target: d.story, text: ta.value } });
      S.data.stories.push(r.story); S.ui.keepScroll = true; render();
      if (/^photo:/.test(d.story)) { openAsk(d.story.slice(6)); toast('Дякуємо за підказку!'); return; }
      if (/^want:/.test(d.story)) { openWant(d.story.slice(5)); toast('Дякуємо!'); return; }
      toast('Спогад збережено'); return;
    }
    if (d.delstory) { if (t.dataset.armed !== '1') { t.dataset.armed = '1'; t.textContent = 'точно видалити?'; return; } await api('/api/data', { body: { op: 'story.delete', id: d.delstory } }); S.data.stories = S.data.stories.filter(s => s.id !== d.delstory); S.ui.keepScroll = true; render(); return; }
    if (d.unlink) { await api('/api/data', { body: { op: 'union.remove', id: d.unlink } }); S.data.unions = S.data.unions.filter(u => u.id !== d.unlink); index(); openEdit(P[S.ui.editing]); return; }
    if (d.portrait) { const x = S.data.photos.find(y => y.id === d.portrait); const pid = [S.ui.phCtx, S.view === 'p' ? S.arg : null].find(z => z && P[z] && photoOf(x, z)) || x.person; /* людина, чиї фото відкрито (власне або де її позначено) */ return cropPortrait(x.id, pid); }
    if (d.delphoto) { if (t.dataset.armed !== '1') { t.dataset.armed = '1'; t.textContent = 'Точно видалити?'; return; } await api('/api/data', { body: { op: 'photo.delete', id: d.delphoto } }); S.data.photos = S.data.photos.filter(x => x.id !== d.delphoto); closeLayer(); S.ui.keepScroll = true; render(); return; }
    if (d.famedit) { const f = FAM[d.famedit]; modal(`<h2>${esc(f.title)}</h2><p class="small muted">Абзаци розділяйте порожнім рядком. Жирний текст: **так**.</p><textarea class="in" id="fe" style="min-height:300px">${esc(htmlToText(f.story || ''))}</textarea><div class="btns"><button class="btn" data-act="famsave">Зберегти</button><button class="btn line" data-act="close">Скасувати</button><span class="msg" id="emsg"></span></div>`); S.ui.famEditing = f.id; return; }
    if (d.atab) { S.admin.tab = d.atab; S.admin.err = null; render(); return loadAdmin(); }
    if (d.per) { S.admin.period = d.per; if (d.per !== 'custom') { render(); return loadAdmin(); } render(); return; }
    if (d.member !== undefined) { S.admin.member = d.member && S.admin.member !== d.member ? d.member : null; // другий клік по тому самому рядку — згорнути
      if (!S.admin.member) { S.admin.log = null; S.ui.keepScroll = true; render(); return; } S.admin.log = null; if (!S.admin.stats) return loadAdmin(); // лише журнал — загальні цифри не перезавантажуємо, щоб не «стрибали»
      { const { from, to } = periodRange(); try { S.admin.log = await api(`/api/admin?a=log&id=${S.admin.member}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`); } catch (err) { toast(errText(err)); } S.ui.keepScroll = true; render(); return; } }
    if (d.k && t.tagName === 'TH') { S.admin.dir = S.admin.sort === d.k ? -(S.admin.dir || -1) : -1; S.admin.sort = d.k; render(); return; }
    if (d.revert) { if (t.dataset.armed !== '1') { t.dataset.armed = '1'; t.textContent = 'Точно відкотити?'; return; } await api('/api/admin?a=revert', { body: { id: d.revert } }); await load(); S.admin.revs = null; await loadAdmin(); toast('Відкочено'); return; }
    if (d.reset) { const r = await api('/api/admin?a=reset', { body: { member_id: d.reset } }); modal(`<h2>Посилання для нового пароля</h2><p>Надішліть його особисто. Діє 7 днів, одноразове.</p><input class="in mono" value="${esc(r.link)}" readonly><div class="btns"><button class="btn" data-act="copy" data-v="${esc(r.link)}">Скопіювати</button><button class="btn line" data-act="close">Готово</button></div>`); return; }
    if (d.revoke) { await api('/api/admin?a=revoke', { body: { member_id: d.revoke } }); toast('Сеанси завершено'); S.admin.members = null; return loadAdmin(); }
    if (d.active) { if (t.dataset.armed !== '1' && d.v === 'false') { t.dataset.armed = '1'; t.textContent = 'Точно вимкнути?'; return; } await api('/api/admin?a=member', { body: { id: d.active, active: d.v === 'true' } }); S.admin.members = null; return loadAdmin(); }
    const act = d.act; if (!act) return;
    if (act === 'gsearch') { e.preventDefault(); if (S.view !== 'people') location.hash = '#/people'; setTimeout(() => $('#q')?.focus(), 80); return; }
    if (act === 'pp-close') { ppClose(); return; }
    if (act === 'pp-back') { const h = S.ui.ppHist || []; if (h.length) { S.ui.pp = h.pop(); ppPaint(); } return; }
    if (act === 'pp-tab') { S.ui.ppTab = d.v; ppPaint(); return; }
    if (act === 'pp-tree') { const id = S.ui.pp; S.ui.tf ||= {}; S.ui.tf.center = id; if (S.ui.tmode === 'ped') S.ui.tmode = 'all'; delete S.ui.vp?.all; if (S.view !== 'tree') location.hash = '#/tree'; else render(); return; }
    if (act === 'mini-tog') { S.ui.mini = !S.ui.mini; render(); return; }
    if (act === 't-me') { S.ui.tf ||= {}; S.ui.tf.center = startId(); S.ui.findId = startId(); delete S.ui.vp?.all; delete S.ui.vp?.ped; if (S.view === 'tree' && S.arg) location.hash = '#/tree'; else render(); return; }
    if (act === 'close') { closeLayer(); return; }
    if (act === 'upd-reload') { t.disabled = true; t.textContent = 'Оновлюю…'; try { const ks = await caches?.keys?.(); for (const k of ks || []) await caches.delete(k); } catch {} location.reload(); return; }
    if (act === 'devs') { S.ui.devs = S.ui.devs === d.id ? null : d.id; S.ui.keepScroll = true; render(); return; }
    if (act === 'devout' || act === 'devothers') {
      if (act === 'devothers' && t.dataset.armed !== '1') { t.dataset.armed = '1'; t.textContent = 'Так, вийти на всіх інших'; return; }
      const r = await api('/api/admin?a=revoke', { body: act === 'devout' ? { member_id: d.id, k: d.dk } : { member_id: d.id, others: true } });
      toast(r.n ? `Вихід виконано: ${r.n}` : 'Готово'); S.admin.members = null; S.ui.keepScroll = true; return loadAdmin();
    }
    if (act === 'mdel') { const x = S.admin.members.members.find(y => y.id === t.dataset.id); if (!x) return;
      if (t.dataset.armed !== '1') { t.dataset.armed = '1'; t.textContent = 'Точно видалити назавжди?'; setTimeout(() => { if (t.isConnected) { t.dataset.armed = ''; t.textContent = 'Видалити акаунт'; } }, 5000); return; }
      t.disabled = true; await api('/api/admin?a=delete', { body: { id: x.id } }); toast(`Акаунт «${x.name || x.email}» видалено`); S.admin.members = null; return loadAdmin(); }
    if (act === 'ridbook') { S.ui.ridPlain = false; render(); return; }
    if (act === 'fam-tab') { S.ui.ftab = d.v; render(); return; }
    if (act === 'map-tab') { S.ui.mtab = d.v; render(); return; }
    if (act === 'map-v') { S.ui.mapv = d.v; S.ui.keepScroll = true; render(); return; }
    if (act === 'map-form') { S.ui.mapform = !S.ui.mapform; S.ui.keepScroll = true; render(); return; }
    if (act === 'map-over') return openOverlay(d.id);
    if (act.startsWith('q-') && await qHandle(act, t, d)) return;
    if (/^(to-|jl-|jr-)/.test(act)) { e.preventDefault(); if (await joinHandle(act, t, d)) return; }
    if (act === 'ph-ok' || act === 'ph-no' || act === 'ph-done') { if (act === 'ph-no' && t.dataset.armed !== '1') { t.dataset.armed = '1'; t.textContent = 'Точно відхилити?'; return; } t.disabled = true; try { await api('/api/admin?a=photo_ok', { body: { id: t.dataset.id, ok: act === 'ph-ok', done: act === 'ph-done' } }); toast(act === 'ph-ok' ? 'Фото тепер бачать усі' : act === 'ph-done' ? 'Позначено «Вирішено» — фото прибрано з черги' : 'Фото відхилено'); } catch (err) { toast(errText(err)); } await load(); if (S.admin) S.admin.pph = null; if (S.view === 'admin') await loadAdmin(); S.ui.keepScroll = true; render(); return; }
    if (act === 'hs-all') { const ds = [...document.querySelectorAll('details.hsec[data-hs]')].filter(x => /^\d+$/.test(x.dataset.hs)); const open = !ds.every(x => x.open); ds.forEach(x => { x.open = open; }); return; }
    if (act === 't-png') { if (t.disabled) return; t.disabled = true; const o = t.textContent; t.textContent = 'Готую картинку…'; try { await treePng(); } catch (err) { console.error(err); toast('Не вдалося зробити картинку'); } t.disabled = false; t.textContent = o; return; }
    if (act === 't-open') { S.ui.tf ||= {}; S.ui.tf.allOpen = !S.ui.tf.allOpen; if (!S.ui.tf.allOpen) { S.ui.exp = {}; S.ui.sibx = {}; S.ui.kidx = {}; } delete S.ui.vp?.all; render(); return; }
    if (act === 'import') { if (t.disabled) return; t.disabled = true; $('#imp-m').textContent = 'Імпортую…'; let r = { result: [] }; for (let k = 0; k < 25; k++) { const x = await api('/api/setup?a=import', { body: {} }); r.result.push(...(x.result || [])); if (!x.more) break; } const ok = (r.result || []).filter(x => / ok/.test(x)).length; $('#imp-m').textContent = ok ? `Додано: ${ok}. ${(r.result || []).join(' · ')}` : 'Нового немає — усе вже імпортовано.'; t.disabled = false; delete TXT.history; delete TXT.villages; BOOK.key = ''; await load(); return; }
    if (act === 'intro-close') { introMark(); document.querySelector('.introlay')?.remove(); return; }
    if (act === 'msheet') { mSheet(); return; }
    if (act === 'mshclose') { if (e.target.closest('.msh') && !e.target.closest('a')) return; $('#layer').innerHTML = ''; document.documentElement.classList.remove('msh-open'); return; }
    if (act === 'logout') { $('#layer').innerHTML = ''; document.documentElement.classList.remove('msh-open'); await api('/api/auth?a=logout', { body: {} }).catch(() => {}); S.me = null; S.data = null; render(); return; }
    if (act === 'docform') { S.ui.docform = !S.ui.docform; S.ui.keepScroll = true; render(); setTimeout(() => $('#dtitle')?.focus(), 30); return; }
    if (act === 'edit') return openEdit(P[S.arg]);
    if (act === 'soc-edit') return openSoc(P[S.arg]);
    if (act === 'soc-save') {
      if (t.disabled) return; t.disabled = true;
      const links = Object.keys(SOC).map(k => ({ t: k, u: ($('#sc-' + k)?.value || '').trim() })).filter(x => x.u);
      const m = $('#scmsg'); m.textContent = 'Зберігаю…'; m.className = 'msg';
      try {
        const r = await api('/api/data', { body: { op: 'person.links', id: S.ui.socFor, links, dna: $('#sc-dna')?.value || '', lp: ($('#sc-lp')?.value || '').trim() } });
        const bad = links.filter(x => !(r.person.links || []).some(y => y.t === x.t));
        await load(); render();
        if (bad.length) { openSoc(P[S.ui.socFor]); bad.forEach(x => { const i = $('#sc-' + x.t); if (i) { i.value = x.u; i.classList.add('bad'); } }); const mm = $('#scmsg'); mm.className = 'msg err'; mm.textContent = 'Не вдалося прочитати: ' + bad.map(x => SOC[x.t][0]).join(', ') + '. Перевірте посилання або номер.'; return; }
        closeLayer(); toast('Збережено');
      } catch (e2) { t.disabled = false; m.className = 'msg err'; m.textContent = errText(e2); }
      return;
    }
    if (act === 'history') { e.preventDefault(); const r = await api(`/api/admin?a=revisions&entity=person&id=${encodeURIComponent(S.arg)}`); modal(`<h2>Історія змін</h2>${revList(r.revisions)}<div class="btns"><button class="btn line" data-act="close">Закрити</button></div>`); return; }
    if (act === 'dup-merge') { // головна картка — та, що з фото; усе з другої переходить у неї
      const [keep, drop] = dupKeep(t.dataset.a, t.dataset.b);
      if (t.dataset.armed !== '1') { t.dataset.armed = '1'; t.textContent = 'Так, це одна людина — об\'єднати'; return; }
      t.disabled = true; try { await api('/api/data', { body: { op: 'person.merge', keep, drop } }); } catch (e2) { t.disabled = false; toast(errText(e2)); return; }
      await load(); if (S.ui.pp === drop) S.ui.pp = keep; if (S.view === 'p') location.hash = href('p', keep); render(); toast('Картки об\'єднано'); return;
    }
    if (act === 'dup-no') { t.disabled = true; const r = await api('/api/data', { body: { op: 'dup.no', a: t.dataset.a, b: t.dataset.b } }); S.data.cfg.notDup = r.notDup; render(); if (S.ui.pp) ppPaint(); toast('Добре, більше не питатиму'); return; }
    if (act === 'lk-pick') { $('#lk-p').value = d.v; return; }
    if (act === 'lk-do') {
      const m = $('#lkmsg'), other = personByLabel($('#lk-p').value);
      if (!other) { m.className = 'msg err'; m.textContent = 'Оберіть людину зі списку-підказки.'; return; }
      if (t.disabled) return; t.disabled = true;
      try { if (d.kind === 'spouse') await api('/api/data', { body: { op: 'union.add', a: d.base, b: other, date: '' } });
        else await api('/api/data', { body: { op: 'person.link', kind: d.kind, base: d.base, other } }); }
      catch (e2) { t.disabled = false; m.className = 'msg err'; m.textContent = e2.message === 'has_parent' ? 'У цієї людини вже вказано іншого батька чи матір — змініть це в її картці.' : errText(e2); return; }
      await load(); closeLayer(); S.ui.keepScroll = true; render(); toast('Прив\'язано'); return;
    }
    if (act === 'save' || act === 'create') {
      if (t.disabled) return; t.disabled = true; // захист від подвійного натискання
      const data = readForm(); const m = $('#emsg'); m.textContent = 'Зберігаю…'; m.className = 'msg';
      const cur = act === 'save' ? P[S.ui.editing] : null;
      const body = cur ? { op: 'person.save', id: cur.id, v: cur.v, data: { ...data, ...(cur.portrait ? { portrait: cur.portrait } : {}), ...(cur.pc ? { pc: cur.pc } : {}) } } : { op: 'person.save', data, link: S.ui.adding?.link || {} };
      if (!cur && t.dataset.force === '1') body.force = true;
      let r; try { r = await api('/api/data', { body }); } catch (e2) {
        t.disabled = false;
        if (e2.message === 'dupe') { const dd = (e2.data?.dupes || []).filter(x => P[x]); m.className = 'msg err dupask';
          m.innerHTML = `<b>Можливо, ця людина вже є в дереві:</b> ${dd.map(x => `<a href="${href('p', x)}" data-act="close">${esc(full(P[x]))}${years(P[x]) ? ' (' + esc(years(P[x])) + ')' : ''}</a>`).join(', ')}. Відкрийте її картку й доповніть там — або, якщо це інша людина, натисніть «Створити картку» ще раз.`;
          t.dataset.force = '1'; t.textContent = 'Ні, це інша людина — створити'; return; }
        m.className = 'msg err'; m.textContent = errText(e2); return; }
      await load(); closeLayer(); toast(cur ? 'Збережено' : 'Картку створено');
      location.hash = href('p', r.person.id); render(); return;
    }
    if (act === 'link-spouse') { const b = $('#e-sp').value; if (!b) return; const r = await api('/api/data', { body: { op: 'union.add', a: S.ui.editing, b, date: $('#e-spd').value } }); S.data.unions.push(r.union); index(); openEdit(P[S.ui.editing]); return; }
    if (act === 'merge') {
      const lv = $('#mg-p').value.trim(), m = $('#emsg'); // однакові підписи у двох карток — беремо ту, що НЕ відкрита
      const other = (Object.values(P).find(p => p.id !== S.ui.editing && plabel(p) === lv) || Object.values(P).find(p => p.id !== S.ui.editing && full(p) === lv))?.id;
      if (!other || other === S.ui.editing) { m.className = 'msg err'; m.textContent = 'Оберіть другу картку зі списку-підказки.'; return; }
      if (t.dataset.armed !== '1') { t.dataset.armed = '1'; t.textContent = `Так, «${short(P[other])}» — це та сама людина`; return; }
      t.disabled = true; await api('/api/data', { body: { op: 'person.merge', keep: S.ui.editing, drop: other } }); const keep = S.ui.editing; closeLayer(); await load(); location.hash = href('p', keep); render(); toast('Картки об\'єднано'); return;
    }
    if (act === 'delete') { if (t.dataset.armed !== '1') { t.dataset.armed = '1'; t.textContent = 'Точно видалити? Натисніть ще раз'; return; } await api('/api/data', { body: { op: 'person.delete', id: S.ui.editing } }); closeLayer(); await load(); location.hash = '#/people'; return; }
    if (act === 'famsave') { const story = textToHtml($('#fe').value); await api('/api/data', { body: { op: 'family.story', id: S.ui.famEditing, story } }); FAM[S.ui.famEditing].story = story; closeLayer(); S.ui.keepScroll = true; render(); toast('Збережено'); return; }
    if (act === 'iv-gen') { const w = ['kalyna', 'verba', 'sonce', 'lypa', 'zoria', 'rodyna', 'vyshnia', 'barvinok', 'ridnyi', 'dubok']; const r = crypto.getRandomValues(new Uint32Array(2)); $('#iv-pw').value = w[r[0] % w.length] + String(1000 + r[1] % 9000); return; }
    if (act === 'create-acc') { const m = $('#ivmsg'), login = $('#iv-email').value.trim().toLowerCase(), pw = $('#iv-pw').value.trim();
      if (!login) { m.textContent = 'Впишіть логін'; m.className = 'msg err'; return; }
      if (pw.length < 8) { m.textContent = 'Впишіть пароль (від 8 символів) або натисніть «Придумати»'; m.className = 'msg err'; return; }
      try { await api('/api/admin?a=create', { body: { name: $('#iv-name').value, login, password: pw, role: $('#iv-role').value, person_id: $('#iv-person').value } }); }
      catch (er) { m.textContent = /exists/.test(er.message) ? 'Такий логін уже зайнятий' : /email/.test(er.message) ? 'Логін: пошта або слово від 3 символів' : 'Не вдалося створити'; m.className = 'msg err'; return; }
      const out = `Сайт: ${location.origin}\nЛогін: ${login}\nПароль: ${pw}`; S.admin.members = null; await loadAdmin();
      modal(`<h2>Акаунт створено</h2><p>Передайте людині особисто:</p><textarea class="in mono" readonly rows="3">${esc(out)}</textarea><div class="btns" style="margin-top:10px"><button class="btn" data-act="close">Готово</button></div>`); return; }
    if (act === 'medit') { const x = (S.admin.members?.members || []).find(y => y.id === t.dataset.id); if (!x) return;
      const opts = '<option value="">—</option>' + Object.values(P).sort((p1, p2) => short(p1).localeCompare(short(p2), 'uk')).map(p1 => `<option value="${p1.id}"${p1.id === x.person_id ? ' selected' : ''}>${esc(full(p1))}${yearOf(p1.b) ? ' (' + yearOf(p1.b) + ')' : ''}</option>`).join('');
      modal(`<h2>Редагувати акаунт</h2><p class="small muted">Старий пароль подивитися не можна — він зберігається зашифрованим, і навіть сайт його не знає. Якщо людина забула — задайте новий тут і передайте їй.</p>
        <label class="f">Ім'я<input class="in" id="me-n" value="${esc(x.name || '')}"></label>
        <label class="f">Логін (пошта або коротке слово)<input class="in" id="me-l" value="${esc(x.email)}" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
        <label class="f">Хто це в дереві<select class="in" id="me-p">${opts}</select></label>
        <label class="f">Новий пароль (залиште порожнім, якщо не міняєте)<div class="btns" style="flex-wrap:nowrap"><input class="in mono" id="me-pw" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" minlength="8" placeholder="від 8 символів"><button type="button" class="btn line small" data-act="me-gen">Придумати</button></div></label>
        <div class="btns"><button class="btn" data-act="me-save" data-id="${x.id}">Зберегти</button><button class="btn line" data-act="close">Скасувати</button><span class="msg" id="me-msg"></span></div><div id="me-out"></div>`); return; }
    if (act === 'me-gen') { const w = ['kalyna', 'verba', 'sonce', 'lypa', 'zoria', 'rodyna', 'vyshnia', 'barvinok', 'ridnyi', 'dubok']; const r = crypto.getRandomValues(new Uint32Array(2)); $('#me-pw').value = w[r[0] % w.length] + String(1000 + r[1] % 9000); return; }
    if (act === 'me-save') { const id = t.dataset.id, msg = $('#me-msg'), pw = $('#me-pw').value.trim(), login = $('#me-l').value.trim().toLowerCase();
      if (pw && pw.length < 8) { msg.textContent = 'Пароль — від 8 символів'; msg.className = 'msg err'; return; }
      try { await api('/api/admin?a=member', { body: { id, name: $('#me-n').value, login, person_id: $('#me-p').value, password: pw } }); }
      catch (er) { msg.textContent = /exists/.test(er.message) ? 'Такий логін уже зайнятий' : /email/.test(er.message) ? 'Логін: пошта або слово від 3 символів (літери, цифри, крапка)' : 'Не вдалося зберегти'; msg.className = 'msg err'; return; }
      msg.textContent = 'Збережено'; msg.className = 'msg ok';
      if (pw) $('#me-out').innerHTML = `<div class="sec" style="margin-top:12px"><p style="margin:0 0 6px">Передайте людині (особисто):</p><textarea class="in mono" readonly rows="3">Сайт: ${location.origin}\nЛогін: ${login}\nПароль: ${pw}</textarea><p class="small muted">Старі входи цієї людини закрито — їй треба зайти з новим паролем.</p></div>`;
      S.admin.members = null; loadAdmin(); return; }
    if (act === 'invite') { const m = $('#ivmsg'); const r = await api('/api/admin?a=invite', { body: { name: $('#iv-name').value, email: $('#iv-email').value, role: $('#iv-role').value, person_id: $('#iv-person').value } }); m.textContent = 'Готово'; m.className = 'msg ok'; $('#ivlink').innerHTML = `<div class="btns" style="margin-top:8px"><input class="in mono" value="${esc(r.link)}" readonly style="max-width:520px"><button class="btn line small" data-act="copy" data-v="${esc(r.link)}">Скопіювати</button></div>`; return; }
    if (act === 'copy') { try { await navigator.clipboard.writeText(d.v); toast('Скопійовано'); } catch { toast('Виділіть і скопіюйте вручну'); } return; }
    if (act === 'per-apply') { S.admin.from = $('#pf').value; S.admin.to = $('#pt').value; return loadAdmin(); }
    if (act === 'seed') { $('#sd-m').textContent = 'Імпортую… це може зайняти хвилину.'; const r = await api('/api/setup?a=seed', { body: {} }); toast(`Імпортовано: ${r.persons} людей, ${r.documents} документів`); await load(); render(); return; }
  } catch (err) { const m = $('#emsg') || $('#upmsg'); if (m) { m.textContent = errText(err); m.className = 'msg err'; } else toast(errText(err)); t.disabled = false; }
});
const htmlToText = h => h.replace(/<\/p>\s*<p>/g, '\n\n').replace(/<b>(.*?)<\/b>/g, '**$1**').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
const textToHtml = t => t.trim().split(/\n\s*\n/).map(p => `<p>${esc(p).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>')}</p>`).join('\n');

/* ───── Завантаження фото: зменшуємо в браузері, далі — на сервер ───── */
// Фото зберігаємо якомога ближче до оригіналу: якщо файл JPEG/PNG/WebP і до 4 МБ — як є; інакше — найкраща якість, що вміщається в 4 МБ.
/* Версії фото (редактор і власник): оброблене замість сирого, поворот, обрізка, розрізання. Оригінал сервер зберігає сам, автор фото не змінюється. */
const verOf = id => id ? (S.data?.photos.find(y => y.id === id)?.ver || (S.admin?.pph || []).find(y => y.id === id)?.ver || null) : null;
const dayOf = t => t ? new Date(t).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
async function photoBitmap(id) { const r = await fetch(img('photo=' + id), { credentials: 'same-origin', cache: 'no-store' }); if (!r.ok) throw new Error('http_' + r.status); return createImageBitmap(await r.blob()); }
function cropCanvas(bm, b) { const W = bm.width, H = bm.height, x = Math.round(b.x * W), y = Math.round(b.y * H), w = Math.max(1, Math.round(b.w * W)), h = Math.max(1, Math.round(b.h * H)); const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(bm, x, y, w, h, 0, 0, w, h); return c; }
const canvasJpeg = (c, q = 0.93) => new Promise((ok, bad) => c.toBlob(b => b ? ok(b) : bad(new Error('type')), 'image/jpeg', q));
async function photoReplace(id, blob) {
  const full = await bestPhoto(blob), thumb = await toJpeg(blob, 420, 0.78);
  await api(`/api/upload?replace=${encodeURIComponent(id)}`, { raw: full });
  await api(`/api/upload?kind=thumb&replace=${encodeURIComponent(id)}`, { raw: thumb }).catch(() => {});
}
async function bestPhoto(f) {
  if (/^image\/(jpeg|png|webp)$/.test(f.type) && f.size <= 4e6) return f;
  for (const [mx, q] of [[6000, 0.92], [4800, 0.9], [4000, 0.88], [3200, 0.86], [2400, 0.84], [1600, 0.8]]) { const b = await toJpeg(f, mx, q); if (b.size <= 4e6) return b; }
  throw new Error('too_large');
}
function toJpeg(file, max, q) {
  return new Promise((ok, bad) => {
    const u = URL.createObjectURL(file); const im = new Image();
    im.onload = () => { const k = Math.min(1, max / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); c.toBlob(b => b ? ok(b) : bad(new Error('type')), 'image/jpeg', q); };
    im.onerror = () => { URL.revokeObjectURL(u); bad(new Error('type')); };
    im.src = u;
  });
}
async function upload(personId, files) {
  const m = $('#upmsg'); let n = 0, pend = false;
  for (const f of files) {
    try {
      m.className = 'msg'; m.textContent = `Завантажую ${n + 1} з ${files.length}…`;
      let full, thumb = null;
      if (f.type === 'application/pdf') { if (f.size > 4e6) throw new Error('too_large'); full = f; }
      else { full = await bestPhoto(f); thumb = await toJpeg(f, 420, 0.78); }
      const r = await api(`/api/upload?person=${encodeURIComponent(personId)}&caption=${encodeURIComponent(prompt2())}&h=${f.type === 'application/pdf' ? '' : await fileHash(f)}`, { raw: full });
      if (thumb) await api(`/api/upload?kind=thumb&photo=${r.id}`, { raw: thumb }).catch(() => {});
      if (r.pending) pend = true; n++; if (f.type !== 'application/pdf') (upload.ids ||= []).push(r.id);
    } catch (err) { console.warn("[upload]", err); m.className = "msg err"; m.textContent = `«${f.name}»: ${errText(err)}`; }
  }
  if (n) { await load(); S.ui.keepScroll = true; render(); toast(pend ? `Надіслано фото: ${n}. Вони з'являться для всіх після підтвердження Максимом.` : `Додано фото: ${n}`); }
  const ids = upload.ids || []; upload.ids = []; if (ids.length) photoTag(ids, 0, personId);
}
// «Позначити обличчя»: на фото для кожної позначеної людини — квадрат на обличчі. Зберігається в settings.photo_faces,
// а людям без головного фото (або з цим фото головним) обличчя стає аватаркою (person.portrait + pc).
const facesOf = id => (CFG_().photoFaces || {})[id] || {};
function faceTag(id, after, pid) {
  const x = S.data.photos.find(y => y.id === id); if (!x) return;
  const people = [x.person, ...tagsOf(id)].filter(y => P[y]); if (!people.length) { toast('Спершу позначте, хто на фото.'); return; }
  const F = JSON.parse(JSON.stringify(facesOf(id))); let act = people.includes(pid) ? pid : people.find(y => !F[y]) || people[0];
  const mk = {}; people.forEach(y => { mk[y] = !P[y].portrait || P[y].portrait === id; });
  modal(`<h2>Чиє обличчя де?</h2><p class="muted small">Оберіть людину нижче й клацніть на її обличчя на фото. Рамку можна перетягнути; розмір — повзунком або коліщатком миші.</p>
    <div class="fcnow" id="fc-now"></div>
    <div class="crp fcbox" id="fc"><img src="${img('photo=' + id)}" alt="" draggable="false"><div id="fc-b"></div></div>
    <label class="crp-z">Розмір рамки <input type="range" id="fc-z" min="2" max="60" value="12"></label>
    <div class="fcppl" id="fc-p"></div>
    <div class="btns"><button class="btn" id="fc-ok">Зберегти</button><button class="btn line" data-act="close">Скасувати</button><span class="msg" id="fc-m"></span></div>`);
  const box = $('#fc'), im = box.querySelector('img'), lay = $('#fc-b'), z = $('#fc-z');
  let r = 1;
  const cl = b => { b.s = Math.max(.01, Math.min(b.s, 1, 1 / r)); b.x = Math.max(0, Math.min(b.x, 1 - b.s)); b.y = Math.max(0, Math.min(b.y, 1 - b.s * r)); b.r = r; return b; };
  const paint = () => { const W = im.clientWidth, H = im.clientHeight; if (!W) return;
    lay.innerHTML = people.filter(y => F[y]).map(y => { const b = F[y]; return `<div class="fcb${y === act ? ' on' : ''}" data-fp="${y}" style="left:${b.x * W}px;top:${b.y * H}px;width:${b.s * W}px;height:${b.s * W}px"><span>${esc(short(P[y]))}</span></div>`; }).join('');
    $('#fc-p').innerHTML = people.map(y => `<div class="fcrow${y === act ? ' on' : ''}"><button type="button" class="tagc fcpick" data-fa="${y}">${F[y] ? '✓' : '○'} ${esc(short(P[y]))}</button>${F[y] ? `<label class="small"><input type="checkbox" data-fm="${y}"${mk[y] ? ' checked' : ''}> головне фото${P[y].portrait && P[y].portrait !== id ? ' <span class="muted">(зараз інше)</span>' : ''}</label><button type="button" class="btn line small" data-fx="${y}">прибрати</button>` : '<span class="small muted">не позначено</span>'}</div>`).join('');
    if (F[act]) z.value = Math.round(F[act].s * 100);
    $('#fc-now').innerHTML = `Зараз позначаєте: <b>${esc(short(P[act]))}</b> — ${F[act] ? 'рамку можна посунути або обрати іншу людину нижче' : 'торкніться його/її обличчя на фото'}`; };
  const init = () => { r = im.naturalHeight / im.naturalWidth || 1; Object.values(F).forEach(cl); paint(); };
  if (im.complete && im.naturalWidth) init(); else im.onload = init;
  let drag = null;
  box.addEventListener('pointerdown', e => { e.preventDefault(); const R_ = im.getBoundingClientRect(), fb = e.target.closest('[data-fp]');
    if (fb) { act = fb.dataset.fp; const b = F[act]; drag = { px: e.clientX, py: e.clientY, x: b.x, y: b.y }; box.setPointerCapture(e.pointerId); paint(); return; }
    const isNew = !F[act], s0 = F[act]?.s || Object.values(F)[0]?.s || .12; F[act] = cl({ x: (e.clientX - R_.left) / R_.width - s0 / 2, y: (e.clientY - R_.top) / R_.height - s0 * r / 2, s: s0 }); if (isNew) { const nx = people.find(y => !F[y]); if (nx) act = nx; } paint(); }); // нова рамка — одразу наступна людина без рамки
  box.addEventListener('pointermove', e => { if (!drag) return; const b = F[act]; b.x = drag.x + (e.clientX - drag.px) / im.clientWidth; b.y = drag.y + (e.clientY - drag.py) / im.clientHeight; cl(b); paint(); });
  const end = () => { drag = null; }; box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
  const resize = ns => { const b = F[act]; if (!b) return; const cx = b.x + b.s / 2, cy = b.y + b.s * r / 2; b.s = ns; b.x = cx - b.s / 2; b.y = cy - b.s * r / 2; cl(b); paint(); };
  z.addEventListener('input', () => resize(z.value / 100));
  box.addEventListener('wheel', e => { if (!F[act]) return; e.preventDefault(); resize(F[act].s * (e.deltaY > 0 ? 1.08 : 1 / 1.08)); }, { passive: false });
  $('#fc-p').addEventListener('click', e => { const a = e.target.closest('[data-fa]'), xb = e.target.closest('[data-fx]');
    if (a) { act = a.dataset.fa; paint(); } if (xb) { delete F[xb.dataset.fx]; paint(); } });
  $('#fc-p').addEventListener('change', e => { const c = e.target.closest('[data-fm]'); if (c) mk[c.dataset.fm] = c.checked; });
  window.addEventListener('resize', paint, { once: true });
  $('#fc-ok').onclick = async () => { const m = $('#fc-m'), btn = $('#fc-ok'); btn.disabled = true; m.className = 'msg'; m.textContent = 'Зберігаю…';
    try { const res = await api('/api/data', { body: { op: 'photo.faces', id, faces: F } }); S.data.cfg.photoFaces = res.photoFaces; let n = 0;
      for (const y of people) if (F[y] && mk[y] && canEdit()) { const rr = await api('/api/data', { body: { op: 'person.portrait', id: y, photo: id, pc: { x: F[y].x, y: F[y].y, s: F[y].s, r } } }); Object.keys(P[y]).forEach(k => { if (k === 'pc') delete P[y].pc; }); Object.assign(P[y], rr.person); n++; }
      closeLayer(); S.ui.keepScroll = true; render(); toast(n ? `Збережено. Обличчя стало головним фото: ${n}` : 'Збережено'); after?.(); }
    catch (err) { btn.disabled = false; m.className = 'msg err'; m.textContent = errText(err); } };
}
// Одразу після завантаження: підпис і «хто на фото» (вибір людей з дерева)
function photoTag(ids, k, personId, opt = {}) {
  const id = ids[k]; const x = S.data.photos.find(y => y.id === id); if (!x) { if (k + 1 < ids.length) photoTag(ids, k + 1, personId); return; }
  let sel = [personId, ...tagsOf(id)].filter(y => P[y]);
  const chips = () => sel.map(y => `<span class="tagc">${esc(short(P[y]))}${y === personId ? '' : `<button type="button" data-rm="${y}" aria-label="Прибрати">×</button>`}</span>`).join('');
  modal(`<h2>${opt.title || 'Хто на фото?'}${ids.length > 1 ? ` <small class="muted">${k + 1} з ${ids.length}</small>` : ''}</h2>
    <div class="ask-prev"><img src="${img('photo=' + id, true)}" alt=""></div>
    <div class="sec" style="gap:10px">
      <label class="f">Підпис<textarea class="in" id="tg-c" maxlength="500" placeholder="Хто, коли, де. Напр.: «Весілля Івана й Ольги, Веприк, 1972»">${esc(x.caption || '')}</textarea></label>
      <div class="f"><span>Хто на фото <small class="muted">— оберіть людей з дерева</small></span><div class="tagl" id="tg-l">${chips()}</div>
        <input class="in" id="tg-q" type="search" placeholder="🔍 Почніть писати ім'я, напр. «Настя» або «Шутий Іван»" autocomplete="off" enterkeyhint="search"><div class="tagres" id="tg-r"></div></div>
      ${opt.note ? `<p class="muted small">${opt.note}</p>` : ''}<div class="btns"><button class="btn" id="tg-save">${opt.save || (k + 1 < ids.length ? 'Зберегти й далі' : 'Зберегти')}</button>${canEdit() || x.by === S.me?.id ? '<button class="btn line" id="tg-face" title="Обвести обличчя кожного — і воно стане фото в його картці">🙂 Позначити обличчя</button>' : ''}<button class="btn line" data-act="close">${opt.done ? 'Скасувати' : 'Пропустити'}</button><span class="msg" id="tg-m"></span></div></div>`);
  const paint = () => { $('#tg-l').innerHTML = chips(); };
  const q = $('#tg-q'), res = $('#tg-r');
  const find = () => { const L = personFind(q.value).filter(p => !sel.includes(p.id)); res.innerHTML = q.value.trim() ? (L.length ? L.map(p => `<button type="button" class="tagopt" data-pick="${p.id}">${ph(p)}<span><b>${esc(full(p))}</b><i>${esc(life(p) || '')}</i></span><em>＋</em></button>`).join('') : '<p class="muted small">Нікого не знайдено. Спробуйте інакше: лише ім’я або прізвище.</p>') : ''; };
  q.addEventListener('input', find);
  res.addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (!b) return; sel.push(b.dataset.pick); paint(); q.value = ''; res.innerHTML = ''; q.focus(); });
  $('#tg-l').addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (b) { sel = sel.filter(y => y !== b.dataset.rm); paint(); } });
  if ($('#tg-face')) $('#tg-face').onclick = async () => { const m = $('#tg-m'); m.className = 'msg'; m.textContent = 'Зберігаю…';
    try { const c = $('#tg-c').value.trim(); if (c !== (x.caption || '')) { await api('/api/data', { body: { op: 'photo.caption', id, caption: c } }); x.caption = c; }
      const others = sel.filter(y => y !== x.person); if (others.join() !== tagsOf(id).join()) { const r = await api('/api/data', { body: { op: 'photo.people', id, people: others } }); S.data.cfg.photoPeople = r.photoPeople; (r.persons || []).forEach(q => { if (P[q.id]) Object.assign(P[q.id], q); }); }
      closeLayer(); faceTag(id); } catch (err) { m.className = 'msg err'; m.textContent = errText(err); } };
  $('#tg-save').onclick = async () => { const b = $('#tg-save'), m = $('#tg-m'); b.disabled = true; m.className = 'msg'; m.textContent = 'Зберігаю…';
    try { if (opt.done && !sel.length && $('#tg-c').value.trim() === (x.caption || '').trim()) { b.disabled = false; m.className = 'msg err'; m.textContent = 'Напишіть, хто на фото, або оберіть людину з дерева'; return; }
      const c = $('#tg-c').value.trim(); if (c !== (x.caption || '')) { await api('/api/data', { body: { op: 'photo.caption', id, caption: c } }); x.caption = c; }
      const others = sel.filter(y => y !== x.person); if (others.join() !== tagsOf(id).join()) { const r = await api('/api/data', { body: { op: 'photo.people', id, people: others } }); S.data.cfg.photoPeople = r.photoPeople; (r.persons || []).forEach(q => { if (P[q.id]) Object.assign(P[q.id], q); }); }
      if (opt.done) await opt.done(sel);
      closeLayer(); if (opt.reopen) { S.ui.keepScroll = true; render(); openPhoto(id); toast(sel.length ? 'Збережено: ' + sel.map(y => short(P[y])).join(', ') : 'Збережено'); return; } S.ui.keepScroll = true; render(); if (k + 1 < ids.length) photoTag(ids, k + 1, personId, opt); else toast(opt.done ? (sel.length ? `Готово: фото тепер на картці — ${sel.map(y => short(P[y])).join(', ')}` : 'Готово') : 'Збережено'); }
    catch (err) { b.disabled = false; m.className = 'msg err'; m.textContent = errText(err); } };
}
async function uploadPages(id, files) {
  let n = 0; files.sort((x, y) => x.name.localeCompare(y.name));
  for (const f of files) { try { toast(`Завантажую сторінку ${n + 1}…`); let full = await toJpeg(f, 2600, 0.85); if (full.size > 4e6) full = await toJpeg(f, 1800, 0.8); const r = await api(`/api/upload?doc=${id}`, { raw: full }); await api(`/api/upload?doc=${id}&kind=thumb&page=${r.page}`, { raw: await toJpeg(f, 420, 0.78) }).catch(() => {}); n++; } catch (err) { toast(`«${f.name}»: ${errText(err)}`); } }
  if (n) { await load(); closeLayer(); openDoc(id); toast(`Додано сторінок: ${n}`); }
}
async function uploadBulk(files) {
  files.sort((x, y) => x.name.localeCompare(y.name));
  const m = $('#dmsg'); const ids = S.data.documents.map(d => d.id).sort((x, y) => y.length - x.length); let n = 0, skip = [];
  for (const f of files) {
    const base = f.name.toLowerCase(); const id = ids.find(x => base === x || base.startsWith(x + '-') || base.startsWith(x + '.') || base.startsWith(x + '_'));
    if (!id) { skip.push(f.name); continue; }
    try {
      m.className = 'msg'; m.textContent = `Завантажую ${n + 1}… (${f.name})`;
      let full = await toJpeg(f, 2600, 0.85); if (full.size > 4e6) full = await toJpeg(f, 1800, 0.8);
      const r = await api(`/api/upload?doc=${id}`, { raw: full });
      await api(`/api/upload?doc=${id}&kind=thumb&page=${r.page}`, { raw: await toJpeg(f, 420, 0.78) }).catch(() => {});
      n++;
    } catch (err) { console.warn('[bulk]', err); skip.push(f.name + ' (' + errText(err) + ')'); }
  }
  await load(); S.ui.keepScroll = true; render(); toast(`Додано сканів: ${n}${skip.length ? '. Пропущено: ' + skip.join(', ') : ''}`);
}
async function uploadDoc(personId, files) {
  const m = $('#dmsg'); const title = ($('#dtitle')?.value || '').trim();
  if (!title) { m.className = 'msg err'; m.textContent = 'Вкажіть назву документа.'; return; }
  const meta = { title, date: ($('#ddate')?.value || '').trim(), src: ($('#dsrc')?.value || '').trim(), people: [personId] };
  const id = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); let n = 0;
  for (const f of files) {
    try {
      m.className = 'msg'; m.textContent = `Завантажую сторінку ${n + 1} з ${files.length}…`;
      let full = await toJpeg(f, 2600, 0.85); if (full.size > 4e6) full = await toJpeg(f, 1800, 0.8);
      const r = await api(`/api/upload?doc=${id}${n ? '' : '&meta=' + encodeURIComponent(JSON.stringify(meta))}`, { raw: full });
      await api(`/api/upload?doc=${id}&kind=thumb&page=${r.page}`, { raw: await toJpeg(f, 420, 0.78) }).catch(() => {});
      n++;
    } catch (err) { console.warn('[doc]', err); m.className = 'msg err'; m.textContent = `«${f.name}»: ${errText(err)}`; }
  }
  if (n) { S.ui.docform = false; await load(); S.ui.keepScroll = true; render(); toast(`Документ додано (сторінок: ${n})`); }
}
const prompt2 = () => ''; // підпис додається після завантаження (в перегляді)

/* ───── Старт ───── */
async function start() {
  parse();
  const inv = new URLSearchParams(location.search).get('invite');
  if (inv) {
    try { const i = await api('/api/auth?a=invite&t=' + encodeURIComponent(inv), { noRedirect: true }); S.gate = () => vInvite(i); }
    catch { S.gate = () => gate(`<p class="msg err" style="text-align:center">${ERR.invalid}</p>`); }
    return render();
  }
  const jc = new URLSearchParams(location.search).get('join');
  if (jc) {
    try { await api('/api/auth?a=join&c=' + encodeURIComponent(jc), { noRedirect: true }); S.join = jc; } catch { S.gate = () => gate(`<p class="msg err" style="text-align:center">${ERR.invalid_join}</p><p style="text-align:center"><a href="/">До входу</a></p>`); return render(); }
  }
  // три запити одночасно, а не по черзі: чи сайт налаштований, хто увійшов, і самі дані дерева
  const [st, me, data] = await Promise.allSettled([api('/api/setup?a=status', { noRedirect: true }), api('/api/auth?a=me', { noRedirect: true }), api('/api/data', { noRedirect: true })]);
  if (st.status === 'fulfilled' && !st.value.initialized) { S.gate = vSetup; return render(); }
  S.me = me.status === 'fulfilled' ? me.value.member : null;
  if (S.me) { if (data.status === 'fulfilled') { S.data = data.value; index(); } else { render(); await load(); } }
  render();
  autoImport();
  if (S.me) setTimeout(() => { loadText('history', true); loadText('villages', true); }, 1200); // заздалегідь, поки людина дивиться дерево — «Історія» відкриється одразу
  setTimeout(checkUpdate, 4000);
}
// Власнику: нові фото й картки, які підготував Claude (seed/import), додаються самі — раз за сеанс, повторно нічого не дублюється
async function autoImport() { // кожне відкриття сайту будь-ким: сервер перевіряє, чи є нове, і вносить сам (якщо нічого — миттєво)
  const ok = await syncNow();
  if (ok && isOwner()) toast(`Додано нових матеріалів від Claude: ${ok}`);
}
/* Пошук у дереві: підказки одразу під час введення, по всіх людях (не лише видимих) */
function tqMatches(q) {
  q = q.trim().toLowerCase(); if (!q) return [];
  const words = q.split(/\s+/);
  const txt = p => [p.s, p.n, p.pt, p.m, yearOf(p.b)].filter(Boolean).join(' ').toLowerCase();
  return Object.values(P).filter(p => { const t = txt(p); return words.every(w => t.includes(w)); })
    .sort((a, b) => ((S.ui.tl?.N || {})[b.id] ? 1 : 0) - ((S.ui.tl?.N || {})[a.id] ? 1 : 0) || full(a).localeCompare(full(b), 'uk')).slice(0, 8);
}
function tqShow() {
  const inp = $('#tq'); let box = document.getElementById('tsug');
  const list = inp ? tqMatches(inp.value) : [];
  if (!inp || !inp.value.trim() || document.activeElement !== inp) { box?.remove(); return; }
  if (!box) { box = document.createElement('div'); box.id = 'tsug'; box.className = 'tsug'; document.body.appendChild(box); }
  const r = inp.closest('.tsearch').getBoundingClientRect();
  box.style.cssText = `left:${Math.max(8, r.left)}px;top:${r.bottom + 6}px;width:${Math.min(innerWidth - 16, Math.max(r.width, 300))}px`;
  box.innerHTML = list.length ? list.map((p, i) => `<button type="button" class="tsug-i${i ? '' : ' on'}" data-tfind="${p.id}">${avatar(p)}<span><b>${esc(full(p))}</b><small>${esc([life(p), (S.ui.tl?.N || {})[p.id] ? '' : (p.sex === 'f' ? 'відкриє дерево від неї' : p.sex === 'm' ? 'відкриє дерево від нього' : 'відкриє дерево від цієї людини')].filter(Boolean).join(' · '))}</small></span></button>`).join('') : '<div class="tsug-no">Нікого не знайдено</div>';
}
function tqPick(id) {
  if (!P[id]) return; document.getElementById('tsug')?.remove();
  S.ui.tf ||= {}; S.ui.tf.q = '';
  if (!(S.ui.tl?.N || {})[id]) { S.ui.tf.center = id; delete S.ui.vp?.all; }
  S.ui.findId = id; S.ui.pp = id; render();
}
document.addEventListener('input', e => { if (e.target.id === 'tq') tqShow(); if (e.target.id === 'trq') { S.ui.trq = e.target.value; const pos = e.target.selectionStart; render(); const i = $('#trq'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } } });
document.addEventListener('focusin', e => { if (e.target.id === 'tq') tqShow(); });
document.addEventListener('keydown', e => {
  if (e.target.id !== 'tq') return;
  const items = [...document.querySelectorAll('#tsug .tsug-i')]; let i = items.findIndex(x => x.classList.contains('on'));
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!items.length) return; items[i]?.classList.remove('on'); i = (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items[i].classList.add('on'); }
  else if (e.key === 'Enter') { e.preventDefault(); if (items[i]) tqPick(items[i].dataset.tfind); }
  else if (e.key === 'Escape') { e.target.value = ''; document.getElementById('tsug')?.remove(); }
});
document.addEventListener('pointerdown', e => { const b = e.target.closest('[data-tfind]'); if (b) { e.preventDefault(); tqPick(b.dataset.tfind); return; } if (!e.target.closest('#tsug,#tq')) document.getElementById('tsug')?.remove(); }, true);
addEventListener('resize', () => document.getElementById('tsug') && tqShow());

/* Усі довгі списки людей (select) — з пошуком як на дереві: вводиш — лишаються лише ті, хто підходить */
function pselEnhance(root) {
  (root || document).querySelectorAll('select:not([data-psel]):not(#tfam):not(.ov-sel)').forEach(sel => {
    if (sel.options.length < 20 || sel.multiple) return;
    sel.dataset.psel = '1';
    const inp = document.createElement('input');
    inp.type = 'search'; inp.className = 'in psel-in'; inp.autocomplete = 'off';
    const first = sel.options[0];
    inp.placeholder = (first && !first.value && first.text && first.text !== '—') ? first.text : 'Почніть вводити ім\'я…';
    const cur = sel.options[sel.selectedIndex]; inp.value = cur && cur.value ? cur.text : '';
    if (sel.style.maxWidth) inp.style.maxWidth = sel.style.maxWidth;
    if (sel.getAttribute('aria-label')) inp.setAttribute('aria-label', sel.getAttribute('aria-label'));
    sel.style.display = 'none'; sel.after(inp);
    inp._sel = sel;
  });
}
function pselShow(inp) {
  const sel = inp._sel; let box = document.getElementById('psug');
  if (!sel || document.activeElement !== inp) { box?.remove(); return; }
  const words = inp.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const opts = [...sel.options].filter(o => o.value && words.every(w => o.text.toLowerCase().includes(w))).slice(0, 40);
  if (!box) { box = document.createElement('div'); box.id = 'psug'; box.className = 'tsug'; document.body.appendChild(box); }
  const r = inp.getBoundingClientRect(); const below = innerHeight - r.bottom > 260 || r.top < 260;
  box.style.cssText = `left:${Math.max(8, Math.min(r.left, innerWidth - Math.max(r.width, 300) - 8))}px;${below ? `top:${r.bottom + 6}px` : `bottom:${innerHeight - r.top + 6}px`};width:${Math.min(innerWidth - 16, Math.max(r.width, 300))}px`;
  box.innerHTML = opts.length ? opts.map((o, i) => { const p = P[o.value]; return `<button type="button" class="tsug-i${i ? '' : ' on'}" data-pselv="${esc(o.value)}">${p ? avatar(p) : ''}<span><b>${esc(o.text)}</b>${p && life(p) ? `<small>${esc(life(p))}</small>` : ''}</span></button>`; }).join('') : '<div class="tsug-no">Нікого не знайдено</div>';
  box._inp = inp;
}
function pselPick(inp, v) {
  const sel = inp._sel; if (!sel) return; sel.value = v; const o = sel.options[sel.selectedIndex];
  inp.value = v && o ? o.text : ''; document.getElementById('psug')?.remove();
  sel.dispatchEvent(new Event('change', { bubbles: true })); sel.dispatchEvent(new Event('input', { bubbles: true }));
}
document.addEventListener('input', e => { if (e.target.classList?.contains('psel-in')) pselShow(e.target); });
document.addEventListener('focusin', e => { if (e.target.classList?.contains('psel-in')) { e.target.select(); pselShow(e.target); } });
document.addEventListener('focusout', e => { const t = e.target; if (!t.classList?.contains('psel-in')) return; setTimeout(() => { if (document.activeElement === t) return; document.getElementById('psug')?.remove(); const sel = t._sel; if (!sel) return; if (!t.value.trim()) { if (sel.value && sel.options[0] && !sel.options[0].value) pselPick(t, ''); } else { const o = sel.options[sel.selectedIndex]; t.value = o && o.value ? o.text : ''; } }, 150); });
document.addEventListener('keydown', e => {
  const t = e.target; if (!t.classList?.contains('psel-in')) return;
  const items = [...document.querySelectorAll('#psug .tsug-i')]; let i = items.findIndex(x => x.classList.contains('on'));
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!items.length) return; items[i]?.classList.remove('on'); i = (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items[i].classList.add('on'); items[i].scrollIntoView({ block: 'nearest' }); }
  else if (e.key === 'Enter') { e.preventDefault(); if (items[i]) pselPick(t, items[i].dataset.pselv); }
  else if (e.key === 'Escape') { document.getElementById('psug')?.remove(); }
});
document.addEventListener('pointerdown', e => { const b = e.target.closest('[data-pselv]'); if (b) { e.preventDefault(); const box = document.getElementById('psug'); if (box?._inp) pselPick(box._inp, b.dataset.pselv); } }, true);
new MutationObserver(() => pselEnhance()).observe(document.documentElement, { childList: true, subtree: true });

/* Перейти на сторінку книги: номер у полі → Enter */
function bookGoPage(n) {
  const N = BOOK.pages.length, max = BOOK.spread ? N - 1 : N; n = Math.max(1, Math.min(max, Math.round(+n || 1)));
  const t = BOOK.spread ? n : n - 1;
  if (!S.ui.bkOpen) { S.ui.bkOpen = true; SND.startMusic(); S.ui.bkPos = t; bookRender(); } else bookFlip(0, t);
  setTimeout(bookCounter, 50);
}
document.addEventListener('keydown', e => { if (!e.target.classList?.contains('bk-pgin')) return; e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); const v = e.target.value; e.target.closest('.bk-pg').textContent = ''; bookGoPage(v); } else if (e.key === 'Escape') { e.target.closest('.bk-pg').textContent = ''; bookCounter(); } }, true);
document.addEventListener('focusout', e => { if (!e.target.classList?.contains('bk-pgin')) return; const t = e.target; setTimeout(() => { if (!t.isConnected) return; const v = t.value, p = t.closest('.bk-pg'); p.textContent = ''; const N = BOOK.pages.length, cur = S.ui.bkOpen ? (BOOK.spread ? S.ui.bkPos || 1 : (S.ui.bkPos || 0) + 1) : 0; if (+v && +v !== cur) bookGoPage(v); else bookCounter(); }, 120); });

// Власний випадний список для полів «оберіть людину» (замість <datalist>: у Safari він не відкривається по кліку й шукає лише з початку)
(() => {
  let box = null, inp = null, opts = [], ext = [], cur = -1, items = [];
  // додаткові слова для пошуку: дівоче прізвище, прізвище чоловіка/дружини («Янок» знайде Маню Шуту, дружину Миколи Янка)
  const extOf = p => { if (!p) return null; const sp = (SPOUSES[p.id] || []).map(x => P[x.id]).filter(Boolean); const t = [p.m, ...sp.map(q => q.s), ...sp.map(q => q.m)].filter(Boolean).join(' ');
    return { t, h: sp.length ? (p.sex === 'f' ? 'чоловік: ' : p.sex === 'm' ? 'дружина: ' : 'подружжя: ') + sp.map(q => short(q)).join(', ') : '' }; };
  const norm = v => String(v || '').toLowerCase().replace(/[’ʼ`]/g, "'").replace(/ё/g, 'е');
  const ensure = () => { if (!box) { box = document.createElement('div'); box.id = 'acbox'; box.setAttribute('role', 'listbox'); document.body.appendChild(box);
    box.addEventListener('mousedown', e => { const o = e.target.closest('[data-ai]'); e.preventDefault(); if (o) choose(+o.dataset.ai); }); } return box; };
  const place = () => { if (!inp || !box || !inp.isConnected) return hide(); const r = inp.getBoundingClientRect(); const below = innerHeight - r.bottom, up = below < 220 && r.top > below;
    Object.assign(box.style, { left: r.left + 'px', width: Math.max(r.width, 260) + 'px', top: up ? '' : r.bottom + 2 + 'px', bottom: up ? innerHeight - r.top + 2 + 'px' : '', maxHeight: Math.max(160, Math.min(320, (up ? r.top : below) - 12)) + 'px' }); };
  const hide = () => { if (box) box.style.display = 'none'; inp = null; cur = -1; };
  const show = all => {
    const q = all ? '' : norm(inp.value).trim(), ws = q.split(/[\s,()]+/).filter(Boolean);
    items = opts.map((v, i) => { const x = ext[i] || { t: '', h: '' }, n = norm(v), nx = n + ' ' + norm(x.t); if (!ws.every(w => nx.includes(w))) return null; const viaX = ws.some(w => !n.includes(w)); const sc = ws.reduce((a, w) => a + (new RegExp('(^|[\\s(\'-])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(n) ? 0 : 1), 0); return { v, i, sc: sc + (viaX ? 0.5 : 0), h: viaX ? x.h : '' }; }).filter(Boolean).sort((a, b) => a.sc - b.sc || a.i - b.i).slice(0, 80);
    const b = ensure(); cur = -1;
    b.innerHTML = items.length ? items.map((o, k) => `<div class="aco" data-ai="${k}" role="option">${esc(o.v)}${o.h ? `<small>${esc(o.h)}</small>` : ''}</div>`).join('') : '<div class="aco none">Нікого не знайдено — перевірте написання</div>';
    b.style.display = 'block'; b.scrollTop = 0; place();
  };
  const mark = k => { const els = box.querySelectorAll('[data-ai]'); if (!els.length) return; cur = (k + els.length) % els.length; els.forEach((e, j) => e.classList.toggle('on', j === cur)); els[cur].scrollIntoView({ block: 'nearest' }); };
  const choose = k => { const o = items[k]; if (!o || !inp) return; const t = inp; t.value = o.v; hide(); t.dispatchEvent(new Event('input', { bubbles: true })); t.dispatchEvent(new Event('change', { bubbles: true })); };
  const bind = t => { if (!t.dataset.dl) { const id = t.getAttribute('list'); if (!id) return false; t.dataset.dl = id; t.removeAttribute('list'); } const dl = document.getElementById(t.dataset.dl); if (!dl) return false; opts = [...dl.options].map(o => o.value).filter(Boolean); const byL = new Map(Object.values(P).map(p => [plabel(p), p])); ext = opts.map(v => extOf(byL.get(v))); inp = t; return true; };
  const isAc = t => t?.matches?.('input[list], input[data-dl]');
  document.addEventListener('focusin', e => { const t = e.target; if (!isAc(t) || !bind(t)) return; show(true); try { t.select(); } catch {} });
  document.addEventListener('click', e => { const t = e.target; if (isAc(t) && t !== inp && bind(t)) show(true); else if (isAc(t) && box?.style.display === 'none') { bind(t); show(true); } });
  document.addEventListener('input', e => { if (e.target === inp && e.isTrusted) show(false); });
  document.addEventListener('keydown', e => { if (e.target !== inp || !box || box.style.display === 'none') { if (isAc(e.target) && e.key === 'ArrowDown' && bind(e.target)) { show(true); e.preventDefault(); } return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); mark(cur + 1); } else if (e.key === 'ArrowUp') { e.preventDefault(); mark(cur - 1); }
    else if (e.key === 'Enter' && cur >= 0) { e.preventDefault(); e.stopPropagation(); choose(cur); } else if (e.key === 'Escape') { e.stopPropagation(); hide(); } }, true);
  document.addEventListener('focusout', e => { if (e.target === inp) setTimeout(() => { if (document.activeElement !== inp) hide(); }, 120); });
  addEventListener('scroll', e => { if (inp && box?.style.display !== 'none' && !box.contains(e.target)) place(); }, true);
  addEventListener('resize', () => inp && place());
})();

start();
})();
