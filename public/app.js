/* Рід Шутих — інтерфейс. Ванільний JS, стан у S, render() перебудовує #app.
   Усі дані — лише через /api (сесія в HttpOnly-cookie). Жодних ключів і прямих звернень до бази. */
(function () {
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { me: null, data: null, view: 'tree', arg: null, ui: {}, admin: {} };
/* Нова версія сайту: раз на 5 хв і при поверненні на вкладку звіряємо /version.json; якщо змінилась — смужка «Оновити» */
const BUILD = '202610130725';
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
  if (!r.ok) { const e = new Error(j.error || 'http_' + r.status); e.status = r.status; throw e; }
  return j;
}
const ERR = { wrong: 'Невірна пошта або пароль.', too_many: 'Забагато спроб. Зачекайте 15 хвилин.', weak: 'Пароль має бути не коротший за 8 символів.', invalid: 'Посилання недійсне або вже використане. Попросіть Максима надіслати нове.', conflict: 'Хтось щойно змінив цю картку. Оновіть сторінку й спробуйте ще раз.', forbidden: 'У вас немає прав на цю дію.', exists: 'Людина з такою поштою вже має доступ.', email: 'Перевірте адресу пошти.', too_large: 'Файл завеликий (до 4 МБ).', type: 'Підходять фото JPG, PNG, WEBP або PDF.', token: 'Невірний код налаштування.', name: 'Вкажіть хоча б ім\'я або прізвище.', branch: 'Доповнювати можна лише свою гілку: себе, батьків, дітей, братів і сестер.', empty: 'Напишіть кілька слів.', pending: 'Вашу заявку ще розглядають. Максим відкриє доступ найближчим часом — тоді увійдете з цією поштою й паролем.', exists_login: 'З цією поштою вже є доступ — просто увійдіть.', parents: 'Вкажіть хоча б батька або матір — так ми знайдемо вас у дереві.', invalid_join: 'Посилання для реєстрації недійсне або вимкнене. Попросіть у Максима нове.', bad_person: 'Такої картки немає в дереві.', about: 'Вкажіть, кого шукаємо: ім\'я, роки, село.', too_many_q: 'У вас уже багато нових запитань — зачекайте відповіді на них.' };
const errText = e => ERR[e.message] || 'Не вдалося. Спробуйте ще раз.';
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
  // покоління відносно Максима: батьки +1, діти −1, подружжя — те саме
  GEN = {}; const r = rootId(); if (r) { GEN[r] = 0; const q = [r]; while (q.length) { const id = q.shift(), g = GEN[id], p = P[id];
    const step = (x, v) => { if (x && P[x] && GEN[x] === undefined) { GEN[x] = v; q.push(x); } };
    step(p.f, g + 1); step(p.mo, g + 1); (KIDS[id] || []).forEach(k => step(k, g - 1)); (SPOUSES[id] || []).forEach(s => step(s.id, g)); } }
}
let GEN = {};
const GENNAME = g => g === 0 ? 'Покоління Максима' : g === 1 ? 'Покоління батьків' : g === 2 ? 'Покоління дідів' : g === 3 ? 'Прадіди' : g === 4 ? 'Прапрадіди' : g > 4 ? `${g - 2}-ті прадіди` : g === -1 ? 'Діти' : g === -2 ? 'Онуки' : 'Нащадки';
async function load() { S.data = await api('/api/data'); index(); }
const yearOf = s => { const m = String(s || '').match(/(\d{4})/); return m ? (String(s).trim().startsWith('~') ? '≈' : '') + m[1] : ''; };
const life = p => { const b = yearOf(p.b), d = yearOf(p.d); return d ? `${b || '?'}–${d}` : b ? `н. ${b}` : ''; };
const full = p => [p.n, p.pt, p.s].filter(Boolean).join(' ');
const short = p => [p.n, p.s].filter(Boolean).join(' ') || '(без імені)';
const byBirth = (a, b) => (yearOf(P[a]?.b).replace('≈', '') || '9999').localeCompare(yearOf(P[b]?.b).replace('≈', '') || '9999');
const img = (q, thumb) => `/api/file?${q}${thumb ? '&thumb=1' : ''}`;
const portrait = p => p.portrait ? img('photo=' + encodeURIComponent(p.portrait), true) : null;
const ph = p => { const u = portrait(p); return `<span class="ph">${u ? `<img src="${u}" alt="" loading="lazy">` : esc((p.n || '?')[0])}</span>`; };
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
const mini = id => { const p = P[id]; if (!p) return ''; return `<a class="mini${p.hyp ? ' hyp' : ''}" href="${href('p', id)}">${ph(p)}<span><b>${esc(short(p))}</b><em>${esc(life(p))}</em></span></a>`; };

/* ───── Маршрути ───── */
function parse() {
  const h = location.hash.replace(/^#\/?/, ''); const [v, a] = h.split('/');
  S.view = v || 'tree'; S.arg = a ? decodeURIComponent(a) : null;
}
addEventListener('hashchange', () => { parse(); if (S.view === 'p') { S.ui.pp = null; S.ui.ppHist = []; } render(); window.scrollTo(0, 0); });

/* ───── Шапка ───── */
function top() {
  const nav = [['tree', 'Дерево'], ['families', 'Історія'], ['people', 'Люди'], ['docs', 'Архів'], ['maps', 'Місця'], ['q', 'Запитання й уточнення']];
  const cur = S.view === 'p' ? 'people' : S.view === 'fam' ? 'families' : S.view;
  const qb = qBadge() || 0, jb = isOwner() ? (S.data?.joinPending || 0) : 0;
  const me = { n: String(S.me.name || S.me.email || '?').split(/\s+/)[0], s: String(S.me.name || '').split(/\s+/)[1] || '' };
  return `<header class="top"><div class="wrap topw">
    <a class="brand" href="#/tree">Рід Шутих<small>Родинний архів</small></a>
    <nav class="nav" aria-label="Розділи">${nav.map(([k, t]) => `<a href="${href(k)}"${k === 'q' ? ' class="nav-q"' : k === 'families' ? ' class="nav-hist"' : ''}${cur === k ? ' aria-current="page"' : ''}${k === 'q' ? ' title="Запитання й уточнення: бачите помилку чи знаєте щось — напишіть"' : ''}>${t}${k === 'q' && qb ? `<i class="bn-badge in">${qb}</i>` : ''}</a>`).join('')}</nav>
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
function aboutMore(p, docs) {
  const plain = t => esc(String(t || '').replace(/\[\[[pd]:[a-z0-9_]+\|([^\]]+)\]\]/gi, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|[^*])\*([^*]+)\*/g, '$1$2'));
  const ds = docs.filter(d => d.text || d.line).slice(0, 8);
  const rid = ridMentions(p.id);
  return `${ds.length ? `<div class="abt-g"><h4>Що кажуть документи</h4>${ds.map(d => `<div class="abt-d"><a href="#" data-doc="${d.id}">${esc(d.title)}</a>${d.date ? ` <span class="muted small mono">${esc(d.date)}</span>` : ''}<p>${glossify(esc([d.text, d.line && d.line !== 'Весь бланк.' ? 'Запис: ' + d.line : ''].filter(Boolean).join(' ')))}</p></div>`).join('')}</div>` : ''}
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
const avatar = (p, cls = '') => { const u = portrait(p); return `<span class="av ${cls}">${u ? `<img src="${u}" alt="" loading="lazy">` : esc(initials(p))}</span>`; };
const years = p => { const b = yearOf(p.b), d = yearOf(p.d); return d ? `${b || '?'} – ${d}` : b ? (String(p.b).startsWith('~') ? '≈' + b : b) : ''; };
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
const kdBadge = p => { const a = childAge(p); return a ? `<i class="kd" title="${esc(a.txt)}">†</i>` : ''; };

function famSelect(f) {
  return `<select class="in tfam" id="tfam" aria-label="Гілка"><option value="">Усі гілки</option>${Object.values(FAM).map(x => `<option value="${x.id}"${f.fam === x.id ? ' selected' : ''}>${esc(x.title)}</option>`).join('')}</select>`;
}
/* бічна панель: клік по людині — не перехід на сторінку, а панель праворуч (на телефоні — шторка знизу) */
function ppHtml(id) {
  const p = P[id]; if (!p) return '';
  const tab = S.ui.ppTab || 'life';
  const par = [p.f, p.mo].filter(x => P[x]), sp = SPOUSES[p.id] || [], ch = (KIDS[p.id] || []).slice().sort(byBirth);
  const sib = par.length ? [...new Set(par.flatMap(x => KIDS[x] || []))].filter(x => x !== p.id && P[x]).sort(byBirth) : [];
  const docs = S.data.documents.filter(d => (d.people || []).includes(p.id) && d.type !== 'map').sort((a, b) => yearOf(a.date).localeCompare(yearOf(b.date)));
  const fams = (p.fam || []).filter(f => FAM[f]);
  const ev = [];
  if (p.b || p.bp) ev.push([yearOf(p.b) || '?', 'Народження', p.b && /\d\d\.\d\d/.test(p.b) ? p.b : '', p.bp]);
  sp.forEach(s => P[s.id] && ev.push([yearOf(s.date) || '', `Шлюб — ${short(P[s.id])}`, s.date && /\d\d\.\d\d/.test(s.date) ? s.date : '', '']));
  ch.forEach(c => ev.push([yearOf(P[c].b) || '', `${P[c].sex === 'f' ? 'Народилася донька' : P[c].sex === 'm' ? 'Народився син' : 'Народилася дитина'} ${String(P[c].n || '').replace(/\s*\(.*?\)/g, '')}`, '', '']));
  if (p.d || p.dp) ev.push([yearOf(p.d) || '?', 'Завершення життєвого шляху', p.d && /\d\d\.\d\d/.test(p.d) ? p.d : '', p.dp]);
  const yk = e => e[1] === 'Народження' ? '0' : e[1].startsWith('Завершення') ? '9' : e[0] ? '1' + e[0] : '5';
  ev.sort((a, b) => yk(a).localeCompare(yk(b)));
  const row = x => `<button type="button" class="pp-p" data-pp="${x}">${avatar(P[x], 'sm')}<span><b>${esc(short(P[x]))}</b><i>${esc(years(P[x]))}${childAge(P[x]) ? ' · †' : ''}</i></span></button>`;
  const grp = (t, ids) => ids.length ? `<div class="pp-g"><h4>${t}</h4>${ids.map(row).join('')}</div>` : '';
  const docRow = d => `<button type="button" class="pp-doc" data-doc="${d.id}">${d.pages ? `<img src="${img('doc=' + d.id + '&page=0', true)}" alt="" loading="lazy">` : '<span class="ph"></span>'}<span><b>${esc(d.title)}</b><i>${esc([d.date, d.place].filter(Boolean).join(' · '))}</i></span>${IC.ext}</button>`;
  const life = `<ol class="tl">${ev.map(e => `<li><b>${esc(String(e[0] || ''))}${e[0] ? ' · ' : ''}${esc(e[1])}</b>${e[2] ? `<span class="tl-d">${esc(e[2])}</span>` : ''}${e[3] ? `<span class="tl-pl">${IC.pin}${esc(e[3])}</span>` : ''}</li>`).join('') || '<li class="muted">Дат поки немає.</li>'}</ol>
    ${(() => { const t = p.note || (ridMentions(p.id)[0] || '').replace(/\[\[[pd]:[a-z0-9_]+\|([^\]]+)\]\]/gi, '$1').replace(/\*\*?([^*]+)\*\*?/g, '$1') || docs.map(d => d.text).filter(Boolean)[0] || ''; return t ? `<div class="pp-note">${esc(t.length > 420 ? t.slice(0, 420).replace(/\s\S*$/, '') + '…' : t)}</div>` : ''; })()}
    ${docs[0] ? `<div class="pp-g"><h4>Джерело</h4>${docRow(docs[0])}</div>` : ''}`;
  const fam = grp('Батьки', par) + grp('Чоловік / дружина', sp.map(x => x.id).filter(x => P[x])) + grp('Діти', ch) + grp('Брати й сестри', sib) || '<p class="muted">Родичів поки не додано.</p>';
  const src = docs.length ? docs.map(docRow).join('') : '<p class="muted">Документів поки немає.</p>';
  const back = (S.ui.ppHist || []).length;
  return `<aside class="pp" id="pp" aria-label="Людина у дереві">
    <div class="pp-top"><button type="button" class="pp-ic" data-act="pp-back"${back ? '' : ' disabled'} title="Назад">${IC.back}</button><span>Людина у дереві</span><button type="button" class="pp-ic" data-act="pp-close" title="Закрити">${IC.x}</button></div>
    <div class="pp-sc" id="pp-sc">
      <div class="pp-head">${avatar(p, 'lg')}<h2>${esc(full(p))}</h2>${p.m && p.m !== p.s ? `<div class="pp-m">з дому ${esc(p.m)}</div>` : ''}<div class="pp-y">${esc(years(p))}</div>${childAge(p) ? `<div class="pp-kd">† ${esc(childAge(p).txt)}</div>` : ''}
        <div class="pp-chips">${fams.map(f => `<a class="chip2" href="${href('fam', f)}">${IC.leaf}${esc(FAM[f].title)}</a>`).join('')}${p.hyp ? '<span class="chip2 hyp">гіпотеза</span>' : ''}</div></div>
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
  const h = ppHtml(id); if (old) old.outerHTML = h; else $('#app').insertAdjacentHTML('beforeend', h);
  document.body.classList.add('pp-on');
  document.querySelectorAll(`.nd[data-id="${id}"]`).forEach(e => e.classList.add('sel'));
}
function ppClose() { S.ui.pp = null; S.ui.ppHist = []; ppPaint(); }

/* ───── Телефон: нижнє меню й шторка «Ще» (як у KRental CRM: 4 розділи + «Ще», кнопки ≥44 px, під великим пальцем) ───── */
const MI = {
  tree: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.2"/><circle cx="5.5" cy="18.5" r="2.2"/><circle cx="18.5" cy="18.5" r="2.2"/><path d="M12 7.2v5.3M5.5 16.3v-1.8a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1.8"/></svg>',
  families: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2A4.5 4.5 0 0 1 21 18.5"/></svg>',
  docs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 6.5 20V4a.5.5 0 0 1 .5-.5z"/><path d="M14 3.5V8h4M9.5 12h5M9.5 15.5h5"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  maps: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3.5 6.5 9 4l6 2.5L20.5 4v13.5L15 20l-6-2.5-5.5 2.5z"/><path d="M9 4v13.5M15 6.5V20"/></svg>',
  q: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4.5 5.5h15v10h-8l-4 3.5v-3.5h-3z"/><path d="M10.3 8.6a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.7.6-.7 1.1M12 13.3v.1"/></svg>',
  admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 19 6v5.5c0 4.2-3 7.4-7 9-4-1.6-7-4.8-7-9V6z"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4.5h4.5v15H14M10 8l-4 4 4 4M6 12h9.5"/></svg>',
};
function mNav(cur) {
  const more = ['maps', 'q', 'admin', 'p'].includes(cur) && cur !== 'p' ? 'more' : cur;
  const B = [['tree', 'Дерево'], ['families', 'Історія'], ['people', 'Люди'], ['docs', 'Архів']];
  const badge = (qBadge() || 0) + (isOwner() ? (S.data?.joinPending || 0) : 0);
  return `<nav class="bnav" aria-label="Розділи">${B.map(([k, t]) => `<a href="${href(k)}" class="${more === k ? 'on' : ''}">${MI[k]}<span>${t}</span></a>`).join('')}<button type="button" data-act="msheet" class="${more === 'more' ? 'on' : ''}">${MI.more}<span>Ще</span>${badge ? `<i class="bn-badge">${badge}</i>` : ''}</button></nav>`;
}
function mSheet() {
  const L = [['q', 'Запитання й уточнення', qBadge() || ''], ['maps', 'Місця: карти й історія сіл', ''], ...(isOwner() ? [['admin', 'Власнику', S.data?.joinPending || '']] : [])];
  $('#layer').innerHTML = `<div class="msh-scrim" data-act="mshclose"><div class="msh" role="dialog" aria-modal="true" aria-label="Ще"><div class="msh-grip"></div>
    ${L.map(([k, t, n]) => `<a class="msh-row" href="${href(k)}" data-act="mshclose">${MI[k]}<span>${t}</span>${n ? `<i class="bn-badge in">${n}</i>` : ''}<b>›</b></a>`).join('')}
    <div class="msh-me">${esc(S.me.name || S.me.email || '')}</div>
    <button class="msh-row out" data-act="logout">${MI.out}<span>Вийти</span></button></div></div>`;
  document.documentElement.classList.add('msh-open');
}

/* ───── Дерево предків ───── */
function node(id) { const p = P[id]; return `<a class="nd${p.hyp ? ' hyp' : ''}${p.root ? ' root' : ''}" href="${href('p', id)}">${ph(p)}<span><b>${esc(short(p))}</b><i>${esc(p.pt || '')}</i><span class="y">${esc(life(p))}</span></span></a>`; }
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
    ${treeBar(tabs, `<div class="legend"><span><i class="sw r"></i>Від кого рахуємо</span><span><i class="sw"></i>Підтверджено документами</span><span><i class="sw h"></i>Гіпотеза</span></div>`)}
    <div class="vp" id="vp" data-mode="ped"><div class="stage" id="stage"><div class="treebox ped"><div class="gens">${Array.from({ length: depthMax + 1 }, (_, i) => `<div><b>${R[i] || i + 1}</b>${i ? (L[i] || i + '-ті прадіди') : 'Покоління'}</div>`).join('')}</div>${t}</div></div>${vpCtl(false)}</div>`;
}
const vpCtl = mini => `<div class="vpctl"><button data-zoom-in title="Збільшити">+</button><button data-zoom-out title="Зменшити">−</button><button data-zoom-fit title="Показати все">⤢</button><button data-full title="На весь екран">⛶</button>${mini ? `<button type="button" data-act="mini-tog" class="${S.ui.mini ? 'on' : ''}" title="Мінікарта: показати / сховати">▦</button>` : ''}</div>${mini ? `<canvas class="minimap" id="minimap" width="220" height="140"${S.ui.mini ? '' : ' hidden'}></canvas>` : ''}`;

/* ── Дерево згори вниз: людина в центрі, над нею батьки, діди…; біля кожного предка — брати й сестри ── */
const T2 = { W: 216, H: 76, GX: 22, GY: 92, PAD: 60 };
const tname = p => [String(p.n || '').replace(/\s*\([^)]*\)/g, ''), p.s].filter(Boolean).join(' ') || '(без імені)'; // у дереві — без «(Настя)», повне ім'я в підказці
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
  function up(c, r, side) { // блок предків людини c (c у x=0, ряд r)
    const B = mk(); const all = sibs(c).filter(x => x === c || (P[x] && !seen.has(x)));
    const dflt = !SIBX[c] && !f.allOpen && SIBX[c] !== 0 && r === 0; const g = (SIBX[c] || f.allOpen || dflt) ? all : [c]; if (dflt && all.length > 1) DS[c] = 1; /* відкриті одразу лише брати й сестри центральної людини; решта — кнопкою ▸N */ if (all.length > g.length) (hid[c] ||= {}).sib = all.length - 1;
    let order = g.filter(x => x !== c); order = side === 'L' ? [...order, c] : side === 'R' ? [c, ...order] : g;
    const ci = order.indexOf(c); order.forEach((id, i) => { seen.add(id); add(B, id, (i - ci) * P2, r); });
    const p = P[c]; let fa = p.f && P[p.f] && !seen.has(p.f) ? p.f : null, mo = p.mo && P[p.mo] && !seen.has(p.mo) ? p.mo : null;
    if ((fa || mo) && r >= DEF && !EXP[c] && !f.allOpen) { (hid[c] ||= {}).up = true; fa = mo = null; }
    if (fa || mo) {
      let F = fa ? up(fa, r + 1, mo ? 'L' : 'C') : null; let M = mo ? up(mo, r + 1, fa ? 'R' : 'C') : null;
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
  const A = S.ui.tmode === 'desc' ? (() => { const B = mk(); add(B, center, 0, 0); return B; })() : up(center, 0, (SPOUSES[center] || []).some(x => P[x.id]) ? 'L' : 'C'); /* є подружжя праворуч — брати й сестри ліворуч, щоб не накладались */ const D = down(center, 0); D.n = D.n.filter(o => o.id !== center); // центр уже в A
  D.n.forEach(o => add(A, o.id, o.x, o.r));
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
        <button class="btn line small" data-act="t-open">${f.allOpen ? 'Згорнути все' : 'Розгорнути все'}</button>${extra}</div></details></div>`;
}
function vAll(tabs) {
  const center = treeCenter(); const L = layoutTD(center); S.ui.tl = L; const f = S.ui.tf || {}; const V = new Set(Object.keys(L.N));
  const cx = id => L.N[id].x + T2.W / 2, top = id => L.N[id].y, bot = id => L.N[id].y + T2.H, midY = id => L.N[id].y + T2.H / 2;
  let lines = '', rings = ''; const done = new Set();
  V.forEach(id => (SPOUSES[id] || []).forEach(s => { const k = [id, s.id].sort().join('|'); if (done.has(k) || !V.has(s.id) || L.N[s.id].r !== L.N[id].r) return; done.add(k);
    const [a, b] = cx(id) < cx(s.id) ? [id, s.id] : [s.id, id]; lines += `<path d="M${L.N[a].x + T2.W} ${midY(a)}H${L.N[b].x}" class="ln sp"/>`; const rx = (L.N[a].x + T2.W + L.N[b].x) / 2, ry = midY(a); rings += `<g class="ring" transform="translate(${rx} ${ry})"><circle r="12"/><circle cx="-3" r="4.2" class="r2"/><circle cx="3" r="4.2" class="r2"/></g>`; }));
  const fam = {}; V.forEach(id => { const ps = [P[id].f, P[id].mo].filter(x => x && V.has(x)); if (ps.length) (fam[ps.sort().join('|')] ||= []).push(id); });
  Object.entries(fam).forEach(([k, kids]) => { const ps = k.split('|'); const two = ps.length === 2 && L.N[ps[0]].r === L.N[ps[1]].r;
    const px = two ? (cx(ps[0]) + cx(ps[1])) / 2 : cx(ps[0]), py = two ? midY(ps[0]) : bot(ps[0]);
    const by = top(kids[0]) - T2.GY / 2; const xs = kids.map(cx); const x1 = Math.min(px, ...xs), x2 = Math.max(px, ...xs);
    lines += `<path d="M${px} ${py}V${by}M${x1} ${by}H${x2}${xs.map(x => `M${x} ${by}V${top(kids[0])}`).join('')}" class="ln"/>`; });
  const q = (f.q || '').trim().toLowerCase();
  const cards = [...V].map(id => { const p = P[id], n = L.N[id]; const hit = q && full(p).toLowerCase().includes(q);
    const dim = f.fam && !(p.fam || []).includes(f.fam);
    return `<a class="nd t2${p.hyp ? ' hyp' : ''}${id === center ? ' root' : ''}${hit ? ' hit' : ''}${S.ui.pp === id ? ' sel' : ''}${dim ? ' dim' : ''}" href="${href('p', id)}" style="left:${n.x}px;top:${n.y}px" data-id="${id}" data-pp="${id}" title="${esc(full(p) + (p.m && p.m !== p.s ? ' (з дому ' + p.m + ')' : '') + (life(p) ? ', ' + life(p) : ''))}">${avatar(p)}<span><b>${esc(tname(p))}</b><span class="y">${esc(years(p))}</span></span>${kdBadge(p)}</a>`; }).join('');
  const tog = Object.entries(S.ui.hid || {}).filter(([id]) => L.N[id]).map(([id, h]) => { const n = L.N[id]; let s = '';
    if (h.up) s += `<button class="tg up" data-exp="${id}" style="left:${n.x + T2.W / 2 - 15}px;top:${n.y - 26}px" title="Показати батьків">▲</button>`;
    if (h.kids) s += `<button class="tg kid" data-kidx="${id}" style="left:${n.x + T2.W / 2 - 18}px;top:${n.y + T2.H - 9}px" title="Показати дітей">▾${h.kids}</button>`;
    if (h.sib) s += `<button class="tg sib" data-sibx="${id}" style="left:${n.x + T2.W - 44}px;top:${n.y - 15}px" title="Показати братів і сестер (${h.sib})">▸${h.sib}</button>`;
    return s; }).join('') + Object.keys(S.ui.exp || {}).concat(Object.keys(S.ui.sibx || {}).filter(k => S.ui.sibx[k]), Object.keys(S.ui.dsib || {}), Object.keys(S.ui.kidx || {})).filter(id => L.N[id] && !(S.ui.hid || {})[id]).map(id => { const n = L.N[id]; return `<button class="tg cl" data-coll="${id}" style="left:${n.x + T2.W - 44}px;top:${n.y - 15}px" title="Згорнути">◂−</button>`; }).join('');
  const opts = Object.values(P).sort((x, y) => short(x).localeCompare(short(y), 'uk')).map(x => `<option value="${x.id}"${x.id === center ? ' selected' : ''}>${esc(full(x))}${yearOf(x.b) ? ' (' + yearOf(x.b) + ')' : ''}</option>`).join('');
  const glabels = L.rows.map((r, i) => `<div class="glab" style="top:${i * (T2.H + T2.GY) + T2.PAD - 50}px">${r === 0 ? 'Від кого будуємо' : r > 0 ? (['', 'Батьки', 'Діди', 'Прадіди', 'Прапрадіди'][r] || (r - 2) + '-ті прадіди') : r === -1 ? 'Діти' : r === -2 ? 'Онуки' : 'Нащадки'}</div>`).join('');
  return `${treeHead()}
    ${treeBar(tabs, `<span class="small muted">${V.size} осіб у дереві</span>${isOwner() ? `<button class="btn line small" data-act="t-png" title="Велика картинка PNG — саме ті родичі, що зараз відкриті в дереві">⤓ Завантажити картинкою (PNG)</button>` : ''}`)}
    <div class="vp all" id="vp" data-mode="all" data-center="${center}"><div class="stage" id="stage" style="width:${L.w}px;height:${L.h}px">${glabels}<svg class="lines" width="${L.w}" height="${L.h}">${lines}${rings}</svg>${cards}${tog}</div>${vpCtl(true)}</div>
    `;
}

/* ── Дерево картинкою (власнику): малюємо відкрите зараз дерево на canvas у великій роздільності ── */
async function treePng() {
  const L = S.ui.tl, st = $('#stage'); if (!L || !st) return;
  if (document.fonts?.ready) await document.fonts.ready;
  const HEAD = 110, w = L.w, h = L.h + HEAD + 40;
  let k = Math.min(3, Math.sqrt(200e6 / (w * h)), 16000 / w, 16000 / h); k = Math.max(0.5, Math.floor(k * 4) / 4); // до 3× (чітко при друку), у межах можливостей браузера
  const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
  const g = c.getContext('2d'); g.scale(k, k);
  const css = getComputedStyle(document.documentElement), cv = (n, d) => (css.getPropertyValue(n) || '').trim() || d;
  const PAPER = cv('--paper', '#F7F4EF'), WINE = cv('--wine', '#7A2E3B'), INK = cv('--ink', '#1E1B17'), MUT = cv('--muted', '#7A7368'), HYP = cv('--hyp', '#B08A3E');
  const fD = cv('--f-display', 'Georgia, serif'), fB = cv('--f-body', 'sans-serif'), fM = cv('--f-mono', 'monospace');
  g.fillStyle = PAPER; g.fillRect(0, 0, w, h);
  // заголовок
  const cen = P[treeCenter()];
  g.fillStyle = WINE; g.font = `700 40px ${fD}`; g.textBaseline = 'alphabetic'; g.fillText('Рід Шутих — родинне дерево', 60, 62);
  g.fillStyle = MUT; g.font = `15px ${fB}`; g.fillText(`Від кого будуємо: ${cen ? full(cen) : ''} · осіб у дереві: ${Object.keys(L.N).length} · ${new Date().toLocaleDateString('uk-UA')} · shutyi.com.ua`, 60, 92);
  g.translate(0, HEAD);
  // підписи поколінь
  st.querySelectorAll('.glab').forEach(el => { g.fillStyle = WINE; g.globalAlpha = .55; g.font = `700 22px ${fD}`; g.fillText(el.textContent, 8, parseFloat(el.style.top) + 24); g.globalAlpha = 1; });
  // лінії та кільця з того самого SVG, що на екрані
  g.lineWidth = 1.6; g.strokeStyle = '#B7AC9E'; st.querySelectorAll('svg.lines path').forEach(pth => g.stroke(new Path2D(pth.getAttribute('d'))));
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
    g.save(); g.shadowColor = 'rgba(60,40,30,.12)'; g.shadowBlur = 10; g.shadowOffsetY = 3; rr(x, y, W, H, 12); g.fillStyle = '#fff'; g.fill(); g.restore();
    rr(x, y, W, H, 12); g.lineWidth = id === center ? 2 : 1; g.strokeStyle = p.hyp ? HYP : id === center ? WINE : '#EAE3D9'; if (p.hyp) g.setLineDash([5, 4]); g.stroke(); g.setLineDash([]);
    const ax = x + 14 + 25, ay = y + H / 2; g.save(); g.beginPath(); g.arc(ax, ay, 25, 0, 7); g.closePath(); g.fillStyle = '#EADFD8'; g.fill(); g.clip();
    if (ims[id]) { const im = ims[id], s2 = Math.max(50 / im.width, 50 / im.height); g.drawImage(im, ax - im.width * s2 / 2, ay - im.height * s2 / 2, im.width * s2, im.height * s2); }
    else { g.fillStyle = '#4B3A35'; g.font = `19px ${fD}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(initials(p), ax, ay + 1); g.textAlign = 'left'; }
    g.restore(); g.textBaseline = 'alphabetic';
    const tx = x + 14 + 50 + 14, tw = W - (tx - x) - 12; g.fillStyle = INK; g.font = `17px ${fD}`;
    const nl = wrap(tname(p), tw, 2), yr = years(p); const blockH = nl.length * 19 + (yr ? 17 : 0); let ty = y + (H - blockH) / 2 + 15;
    nl.forEach(l => { g.fillText(l, tx, ty); ty += 19; });
    if (yr) { g.fillStyle = MUT; g.font = `13px ${fB}`; g.fillText(yr, tx, ty + 1); }
    if (childAge(p)) { g.fillStyle = WINE; g.font = `700 15px ${fD}`; g.fillText('†', x + W - 18, y + 20); } }
  const blob = await new Promise(r => c.toBlob(r, 'image/png')); if (!blob) throw new Error('canvas');
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `rid-shutykh-derevo-${new Date().toISOString().slice(0, 10)}.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 20000);
  toast(`Картинку збережено: ${c.width}×${c.height} px`);
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
  vp.querySelectorAll('.tg').forEach(b => b.onclick = ev2 => { ev2.stopPropagation(); const id = b.dataset.exp || b.dataset.sibx || b.dataset.kidx || b.dataset.coll; const el = st.querySelector(`[data-id="${id}"]`);
    S.ui.anchor = el ? { id, sx: V.x + el.offsetLeft * V.s, sy: V.y + el.offsetTop * V.s } : null;
    if (b.dataset.exp) S.ui.exp[id] = 1; else if (b.dataset.sibx) S.ui.sibx[id] = 1; else if (b.dataset.kidx) (S.ui.kidx ||= {})[id] = 1; else { delete S.ui.exp[id]; S.ui.sibx[id] = 0; delete (S.ui.kidx || {})[id]; }
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
  const photos = S.data.photos.filter(x => x.person === p.id);
  const stories = S.data.stories.filter(s => s.target === p.id);
  const fams = (p.fam || []).filter(f => FAM[f]);
  const pu = portrait(p);
  const L = (t, ids) => ids.length ? `<div class="bl"><span>${t}</span><div class="row">${ids.map(mini).join('')}</div></div>` : '';
  return `<div class="person">
  <div class="sec" style="align-content:start">
    <div class="phead">${canAdd(p.id) ? `<label class="portrait addp" title="${pu ? 'Додати ще фото' : 'Додати фото'}">${pu ? `<img src="${pu}" alt="">` : esc((p.n || '?')[0])}<span class="addp-l">${pu ? '+ фото' : '+ Додати фото'}</span><input type="file" accept="image/*,application/pdf" multiple data-upload="${p.id}" hidden></label>` : `<div class="portrait">${pu ? `<img src="${pu}" alt="">` : esc((p.n || '?')[0])}</div>`}
      <div><div class="eyebrow">${fams.map(f => esc(FAM[f].title)).join(' · ') || 'Картка'}</div><h1>${esc(full(p))}</h1>${p.m && p.m !== p.s ? `<div class="maiden">з дому ${esc(p.m)}</div>` : ''}</div></div>
    <dl class="facts">
      ${p.b ? `<dt>Народження</dt><dd><span class="mono">${esc(p.b)}</span>${p.bp ? ' · ' + esc(p.bp) : ''}</dd>` : p.bp ? `<dt>Звідки</dt><dd>${esc(p.bp)}</dd>` : ''}
      ${p.d ? `<dt>Смерть</dt><dd><span class="mono">${esc(p.d)}</span>${p.dp ? ' · ' + esc(p.dp) : ''}</dd>` : ''}
    </dl>
    ${p.hyp ? `<div class="hypnote">Гіпотеза: зв'язок поки не підтверджено документами.</div>` : ''}
    <div class="sec" style="margin-top:18px"><h3>Гілка <span class="small muted" style="text-transform:none;letter-spacing:0">натисніть, щоб перейти</span></h3>
      <div class="branch">
        ${L('Діди й баби', gp)}${L('Батьки', par)}
        <div class="bl"><span>${esc(p.sex === 'f' ? 'Вона' : p.sex === 'm' ? 'Він' : 'Ця людина')}${sp.length ? ' і подружжя' : ''}</span><div class="row"><span class="focus">${ph(p)}<span><b style="font-family:var(--f-display);font-size:16px">${esc(short(p))}</b><br><em class="mono small muted">${esc(life(p))}</em></span></span>${sp.map(s => mini(s.id) + (s.date ? `<span class="small muted mono" style="align-self:center">⚭ ${esc(s.date)}</span>` : '')).join('')}</div></div>
        ${L('Брати й сестри', sib)}${L('Діти', ch)}${L('Онуки', gch)}
        ${canEdit() ? `<div class="addrel"><button class="btn line small" data-add="father">+ батько</button><button class="btn line small" data-add="mother">+ мати</button><button class="btn line small" data-add="spouse">+ чоловік / дружина</button><button class="btn line small" data-add="child">+ дитина</button>${par.length ? `<button class="btn line small" data-add="sibling">+ брат / сестра</button>` : ''}</div>` : ''}
        <div class="btns"><a class="btn line small" href="${href('tree', p.id)}">Дерево предків цієї людини</a></div>
      </div>
    </div>
  </div>
  <div class="sec" style="align-content:start;gap:30px">
    <div class="sec"><h3>Про людину <span class="btns" style="gap:6px">${canEdit() ? `<button class="btn line small" data-act="edit">Редагувати</button>` : ''}<button class="btn line small" data-act="q-ask">Уточнити / запитати</button></span></h3>
      ${childAge(p) && !/малим|малою|немовл/.test(p.note || '') ? `<p class="about kd-line">† ${esc(childAge(p).txt)}</p>` : ''}
      ${p.note ? `<div class="about">${glossify(esc(p.note))}</div>` : ''}
      ${aboutMore(p, docs)}
      ${!p.note && !docs.length && !ridMentions(p.id).length ? `<p class="muted">Поки нічого не написано.${canEdit() ? ' Натисніть «Редагувати», щоб додати.' : ''}</p>` : ''}
      ${qAboutHtml(p.id)}
      ${p.last ? `<div class="lastedit">Остання зміна: ${esc(who(p.last.by))}, ${esc(when(p.last.at))}${isOwner() ? ` · <a href="#" data-act="history">історія змін</a>` : ''}</div>` : ''}
    </div>
    ${(p.src || []).length ? `<div class="sec"><h3>Джерела в архівах</h3><ul class="srcs">${p.src.map(s => `<li><a href="${esc(s.u)}" target="_blank" rel="noopener noreferrer">${esc(s.t)}</a> <span class="muted small">FamilySearch</span></li>`).join('')}</ul></div>` : ''}
    <div class="sec"><h3>Документи ${canEdit() ? `<button class="btn line small" data-act="docform">+ Архівний документ</button>` : ''}</h3>
      ${canEdit() && S.ui.docform ? `<div class="docform"><input class="in" id="dtitle" placeholder="Назва: напр. «Народження Микити Максимовича»"><input class="in" id="ddate" placeholder="Дата, напр. 27.05.1818"><input class="in" id="dsrc" placeholder="Джерело: архів, книга, запис №"><label class="btn line small" style="cursor:pointer">Вибрати скани<input type="file" accept="image/*" multiple data-docup="${p.id}" hidden></label><div class="msg" id="dmsg"></div></div>` : ''}
      ${docs.length ? `<div class="thumbs">${docs.map(docCard).join('')}</div>` : `<p class="muted">Документів поки немає.</p>`}
      ${parDocs(p, docs)}</div>
    <div class="sec"><h3>Фото ${canAdd(p.id) ? `<label class="btn line small" style="cursor:pointer" title="Портрет, родинне фото або скан документа (свідоцтво, лист, довідка)">Додати фото чи документ<input type="file" accept="image/*,application/pdf" multiple data-upload="${p.id}" hidden></label>` : ''}</h3>
      <div class="msg" id="upmsg"></div>
      ${photos.length ? `<div class="thumbs">${photos.map(x => `<button class="doc" data-photo="${x.id}"><span class="im">${x.mime === 'application/pdf' ? '<span class="ph" style="width:100%;height:100%">PDF</span>' : `<img src="${img('photo=' + x.id, true)}" alt="" loading="lazy">`}</span><span>${p.portrait === x.id ? '<b style="font-size:12px;color:var(--seal)">Головне фото</b><br>' : ''}${esc(x.caption || '')}</span></button>`).join('')}</div>` : `<p class="muted">Фото ще немає. Сюди можна додати все: портрет, родинні фото, скани документів (свідоцтва, листи, довідки), PDF. Перше фото стане головним (портретом у дереві); змінити — відкрийте фото → «⋯» → «Зробити головним». Під кожним фото можна написати підпис: хто, коли, де.</p>`}
    </div>
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
document.addEventListener('toggle', e => { const d = e.target; if (d.matches?.('details[data-pd]')) { (S.ui.pdOpen = S.ui.pdOpen || {})[d.dataset.pd] = d.open; } }, true);
/* ── Пояснення старих і архівних слів: слово* + виноска під текстом ── */
const GLOSS = [
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
  [/⚭/, '⚭', 'знак шлюбу: «одружився / одружилася з», далі дата вінчання.'],
];
function glossify(html) { // html уже безпечний (екранований); замінюємо лише текст поза тегами, кожне слово — один раз
  const used = [];
  const out = String(html).split(/(<[^>]+>)/).map(part => {
    if (part.startsWith('<')) return part;
    GLOSS.forEach(([re, key, def]) => { if (used.some(u => u[0] === key)) return; const m = part.match(re); if (!m) return;
      used.push([key, def]); part = part.slice(0, m.index) + m[0] + '\u0001' + (used.length - 1) + '\u0002' + part.slice(m.index + m[0].length); });
    return part; }).join('').replace(/\u0001(\d+)\u0002/g, (_, i) => `<sup class="gl" title="${esc(used[i][0] + ' — ' + used[i][1])}">*</sup>`);
  return out + (used.length ? `<div class="gnotes">${used.map(([k, d]) => `<p><b>* ${esc(k)}</b> — ${esc(d)}</p>`).join('')}</div>` : '');
}
const storiesHtml = list => list.map(s => `<div class="story"><div>${glossify(esc(s.text))}</div><div class="m"><span>${esc(who(s.by))} · ${esc(when(s.at))}</span>${isOwner() || s.by === S.me.id ? `<button data-delstory="${s.id}">видалити</button>` : ''}</div></div>`).join('');
const storyForm = target => `<div class="sec" style="gap:8px"><textarea class="in" id="st-${esc(target)}" placeholder="Що ви пам'ятаєте або чули від старших? Хто розповідав, коли це було?"></textarea><div class="btns"><button class="btn" data-story="${esc(target)}">Зберегти спогад</button><span class="msg" id="stm-${esc(target)}"></span></div></div>`;

/* ───── Редагування людини ───── */
function personForm(p, preset = {}) {
  const v = Object.assign({ n: '', pt: '', s: '', m: '', sex: '', b: '', bp: '', d: '', dp: '', note: '', f: '', mo: '', hyp: false, fam: [] }, p || {}, preset);
  const opts = (sel, sex) => `<option value="">— невідомо —</option>` + Object.values(P).filter(x => !p || x.id !== p.id).filter(x => !sex || !x.sex || x.sex === sex).sort((a, b) => short(a).localeCompare(short(b), 'uk')).map(x => `<option value="${x.id}"${x.id === sel ? ' selected' : ''}>${esc(full(x))}${life(x) ? ' (' + esc(life(x)) + ')' : ''}</option>`).join('');
  return `<div class="grid2">
    <label class="f">Ім'я<input class="in" id="e-n" value="${esc(v.n)}"></label>
    <label class="f">По батькові<input class="in" id="e-pt" value="${esc(v.pt)}"></label>
    <label class="f">Прізвище<input class="in" id="e-s" value="${esc(v.s)}"></label>
    <label class="f">Дівоче прізвище<input class="in" id="e-m" value="${esc(v.m)}"></label>
    <label class="f">Стать<select class="in" id="e-sex"><option value="">—</option><option value="m"${v.sex === 'm' ? ' selected' : ''}>чоловік</option><option value="f"${v.sex === 'f' ? ' selected' : ''}>жінка</option></select></label>
    <label class="f">Народження (дата або рік)<input class="in" id="e-b" value="${esc(v.b)}" placeholder="напр. 12.03.1911 або ~1910"></label>
    <label class="f">Місце народження<input class="in" id="e-bp" value="${esc(v.bp)}"></label>
    <label class="f">Смерть<input class="in" id="e-d" value="${esc(v.d)}"></label>
    <label class="f">Місце смерті / поховання<input class="in" id="e-dp" value="${esc(v.dp)}"></label>
    <label class="f">Батько<select class="in" id="e-f">${opts(v.f, 'm')}</select></label>
    <label class="f">Мати<select class="in" id="e-mo">${opts(v.mo, 'f')}</select></label>
  </div>
  <label class="f">Про людину: що відомо, звідки, історії<textarea class="in" id="e-note" style="min-height:160px">${esc(v.note)}</textarea></label>
  <div class="grid2"><div class="f">Гілки роду<div class="chips">${S.data.families.map(f => `<label class="small"><input type="checkbox" class="e-fam" value="${f.id}"${(v.fam || []).includes(f.id) ? ' checked' : ''}> ${esc(f.title)}</label>`).join('')}</div></div>
  <label class="small" style="align-self:end"><input type="checkbox" id="e-hyp"${v.hyp ? ' checked' : ''}> Гіпотеза: зв'язок не підтверджено документами</label></div>`;
}
function readForm() {
  const g = id => ($('#e-' + id)?.value || '').trim();
  return { n: g('n'), pt: g('pt'), s: g('s'), m: g('m'), sex: g('sex'), b: g('b'), bp: g('bp'), d: g('d'), dp: g('dp'), f: g('f'), mo: g('mo'), note: g('note'), hyp: !!$('#e-hyp')?.checked, fam: [...document.querySelectorAll('.e-fam:checked')].map(x => x.value) };
}
function modal(html) { $('#layer').innerHTML = `<div class="scrim" data-close-scrim><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`; setTimeout(() => $('#layer .modal input, #layer .modal textarea')?.focus(), 30); }
const closeLayer = () => { $('#layer').innerHTML = ''; document.body.classList.remove('noscroll'); };
function openEdit(p) {
  const sp = SPOUSES[p.id] || [];
  modal(`<h2>${esc(full(p))}</h2>${personForm(p)}
    <div class="sec"><h3>Подружжя</h3><div class="row">${sp.map(s => `<span class="mini">${esc(short(P[s.id]))} <button class="btn line small" data-unlink="${s.u}" title="Прибрати зв'язок">×</button></span>`).join('') || '<span class="muted small">немає</span>'}</div>
      <div class="btns"><select class="in" id="e-sp" style="max-width:320px"><option value="">Додати наявну людину…</option>${Object.values(P).filter(x => x.id !== p.id && !sp.some(s => s.id === x.id)).sort((a, b) => short(a).localeCompare(short(b), 'uk')).map(x => `<option value="${x.id}">${esc(full(x))}</option>`).join('')}</select><input class="in" id="e-spd" placeholder="дата шлюбу" style="max-width:160px"><button class="btn line small" data-act="link-spouse">Додати</button></div></div>
    <div class="btns"><button class="btn" data-act="save">Зберегти</button><button class="btn line" data-act="close">Скасувати</button>${isOwner() && !p.root ? `<button class="btn danger" data-act="delete" style="margin-left:auto">Видалити картку</button>` : ''}<span class="msg" id="emsg"></span></div>
    ${isOwner() && p.id ? `<details class="mergebox"><summary>Ця людина є в дереві двічі? Об'єднати картки</summary>
      <p class="small muted">Оберіть другу картку цієї ж людини. Усе з неї — діти, чоловік/дружина, фото, спогади, документи, акаунт — перейде сюди, порожні поля доповняться, а дубль зникне.</p>
      <div class="btns">${peopleList('mgpeople')}<input class="in" id="mg-p" list="mgpeople" placeholder="Друга картка…" autocomplete="off" style="flex:1;min-width:220px"><button class="btn line" data-act="merge">Об'єднати</button></div></details>` : ''}`);
  S.ui.editing = p.id;
}
function openAdd(kind, base) {
  const preset = {}; const link = {};
  const ttl = { father: 'Додати батька', mother: 'Додати матір', spouse: 'Додати чоловіка / дружину', child: 'Додати дитину', sibling: 'Додати брата чи сестру', new: 'Нова людина' }[kind];
  if (kind === 'father') { preset.sex = 'm'; link.parentOf = base.id; preset.s = base.s; preset.fam = base.fam; }
  if (kind === 'mother') { preset.sex = 'f'; link.parentOf = base.id; preset.fam = base.fam; }
  if (kind === 'spouse') { preset.sex = base.sex === 'm' ? 'f' : base.sex === 'f' ? 'm' : ''; link.spouseOf = base.id; preset.fam = base.fam; }
  if (kind === 'child') { const sp = SPOUSES[base.id] || []; if (base.sex === 'f') { preset.mo = base.id; if (sp.length === 1) preset.f = sp[0].id; } else { preset.f = base.id; if (sp.length === 1) preset.mo = sp[0].id; } preset.s = base.sex === 'f' ? (P[preset.f]?.s || base.s) : base.s; preset.fam = base.fam; }
  if (kind === 'sibling') { preset.f = base.f; preset.mo = base.mo; preset.s = base.s; preset.fam = base.fam; }
  modal(`<h2>${ttl}${base ? ' — ' + esc(short(base)) : ''}</h2>${personForm(null, preset)}
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
  <div class="chips" style="margin-bottom:24px">${S.data.families.map(f => `<a class="btn line small" href="#/fam/${f.id}">${esc(f.title)}</a>`).join('')}</div>
  <div class="famlist">${S.data.families.map(famBlock).join('')}</div>`;
}
function famBlock(f) {
  return `<article class="fam" id="fam-${f.id}"><div class="sec" style="align-content:start">
    <div><div class="eyebrow">${esc(f.side || '')}</div><h2>${esc(f.title)}</h2><div class="muted small">${esc(f.places || '')}</div></div>
    <div class="famstory">${glossify(f.story || '')}</div>
    ${canEdit() ? `<div><button class="btn line small" data-famedit="${f.id}">Редагувати історію</button></div>` : ''}
    <div class="sec"><h3>Спогади про родину</h3>${storiesHtml(S.data.stories.filter(s => s.target === 'fam:' + f.id))}${canAdd('fam:' + f.id) ? storyForm('fam:' + f.id) : ''}</div>
  </div><div>${famMembersHtml(f)}</div></article>`;
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
const personOpts = () => `<datalist id="qpeople">${Object.values(P).sort((a, b) => full(a).localeCompare(full(b), 'uk')).map(p => `<option value="${esc(full(p) + (life(p) ? ' (' + life(p) + ')' : ''))}"></option>`).join('')}</datalist>`;
const personByLabel = v => { v = String(v || '').trim(); if (!v) return ''; const p = Object.values(P).find(p => full(p) + (life(p) ? ' (' + life(p) + ')' : '') === v) || Object.values(P).find(p => full(p) === v); return p ? p.id : ''; };
function qForm(pid, kind) {
  kind = kind || (pid ? 'ask' : 'find');
  const p = pid && P[pid];
  return `<div class="qform" data-kind="${kind}">
    <div class="seg" role="group" aria-label="Що саме">${Object.entries(QKIND).filter(([k]) => !(p && k === 'find')).map(([k, t]) => `<button type="button" class="${k === kind ? 'on' : ''}" data-act="q-kind" data-v="${k}">${t}</button>`).join('')}</div>
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
    <div class="qt">${esc(q.text).replace(/\n/g, '<br>')}</div>
    <div class="small muted">${mine ? 'Ви' : esc(who(q.by))}, ${esc(when(q.at))}</div>
    ${q.answer && !edit ? `<div class="qa"><span class="small muted">Відповідь${q.updBy ? ' · ' + esc(who(q.updBy)) : ''}, ${esc(when(q.upd))}</span><div>${glossify(esc(q.answer)).replace(/\n/g, '<br>')}</div></div>` : ''}
    ${edit ? `<div class="qedit">
      <div class="seg small">${Object.entries(QSTAT).map(([k, t]) => `<button type="button" class="${q.status === k ? 'on' : ''}" data-act="q-status" data-id="${q.id}" data-v="${k}">${t}</button>`).join('')}</div>
      <textarea class="in" id="qa-${q.id}" placeholder="Відповідь — її побачить автор запитання">${esc(q.answer)}</textarea>
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
  if (act === 'q-ask') { modal(`<h2>Уточнити або запитати</h2>${qForm(S.arg)}`); return true; }
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
  return `<div class="gate reg"><div class="card"><h1>Рід Шутих</h1><div class="sub">Реєстрація в родинному архіві</div><div class="orn">◆ ◆ ◆</div>
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
      ${RF('link', 'Як ви пов\'язані з родом Шутих (через кого)', 'напр.: моя бабуся — рідна сестра Василя Шутого з Вороньків', { area: 1, wide: 1 })}
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
const regDone = () => gate(`<div class="sec" style="text-align:center"><p style="margin:0"><b>Дякуємо! Заявку надіслано.</b></p><p class="muted" style="margin:0">Максим перевірить, хто ви в дереві, і відкриє доступ. Після цього входьте з вашою поштою й паролем на цьому ж сайті.</p><button class="btn line" data-act="to-login">До входу</button></div>`);

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
  return String(d.kids || '').split(/[;\n]+|,(?!\s*\d)/).map(x => x.trim()).filter(Boolean).map(x => {
    const b = (x.match(/\b(19|20)\d\d\b/) || [''])[0];
    const n = x.replace(/\b(19|20)\d\d\b/, '').replace(/\b(син|донька|дочка|р\.?\s*н\.?|року|р\.)\b/gi, '').replace(/[(),.–—-]+/g, ' ').replace(/\s+/g, ' ').trim();
    const sex = /\b(донька|дочка)\b/i.test(x) ? 'f' : /\b(син)\b/i.test(x) ? 'm' : /[ая]$/i.test(n.split(' ')[0] || '') ? 'f' : 'm';
    return { n, b, sex };
  }).filter(k => k.n && k.n.length < 60);
}
const kidHas = (pid, n) => Object.values(P).some(p => (p.f === pid || p.mo === pid) && String(p.n || '').toLowerCase().replace(/\s*\(.*\)/, '').trim() === String(n).toLowerCase().split(' ')[0]);
function jrKidsBlock(r, pid) {
  const ks = jrKids(r.data || {}); if (!ks.length) return '';
  const rows = ks.map((k, i) => { const has = pid && kidHas(pid, k.n); return `<label class="kidc${has ? ' has' : ''}"><input type="checkbox" data-kid="${i}"${has ? ' disabled' : ' checked'}><span>${kidRow(k)}</span>${has ? '<em class="small muted">вже є в дереві</em>' : ''}</label>`; }).join('');
  return `<div class="kidbox" id="jk-${r.id}"><b class="small">Діти з анкети — додати в дерево під цією людиною:</b>${rows}</div>`;
}
const jrKidsRead = id => [...document.querySelectorAll(`#jk-${id} .kidc`)].filter(l => l.querySelector('[data-kid]')?.checked).map(l => Object.fromEntries([...l.querySelectorAll('[data-kf]')].map(i => [i.dataset.kf, i.value.trim()]))).filter(k => k.n);
function jrCard(r) {
  const d = r.data || {}, id = r.id;
  const self = guessPeople([d.s, d.n, d.pt, d.m, d.b].join(' '));
  const fG = guessPeople(d.father, 1)[0], mG = guessPeople(d.mother, 1)[0], sG = guessPeople(d.spouse, 1)[0];
  const dl = `<dl class="jrd">${JRF.filter(([k]) => d[k] && !['s', 'n', 'pt'].includes(k)).map(([k, t]) => `<dt>${t}</dt><dd>${esc(k === 'sex' ? (d[k] === 'f' ? 'жінка' : 'чоловік') : d[k]).replace(/\n/g, '<br>')}</dd>`).join('')}</dl>`;
  if (r.status !== 'pending') {
    const pid = r.person_id && P[r.person_id] ? r.person_id : '', miss = pid ? jrKids(d).filter(k => !kidHas(pid, k.n)) : [];
    return `<div class="jr done"><b>${esc(r.name)}</b> · <span class="small muted">${esc(r.email)} · ${r.status === 'approved' ? 'прийнято' : 'відхилено'} ${esc(when(r.decided_at))}${pid ? ` · <a href="${href('p', pid)}">${esc(short(P[pid]))}</a>` : ''}</span>
      ${miss.length ? `${jrKidsBlock(r, pid)}<div class="btns"><button class="btn small" data-act="jr-kids" data-id="${id}">Додати вибраних дітей у дерево</button><span class="msg" id="jr-m-${id}"></span></div>` : ''}</div>`;
  }
  return `<article class="jr" data-jr="${id}">
    <div class="qh"><span class="pill st-new">Нова заявка</span><b style="font-family:var(--f-display);font-size:19px">${esc([d.s, d.n, d.pt].filter(Boolean).join(' '))}</b><span class="small muted">${esc(r.email)} · ${esc(when(r.at))}</span></div>
    ${dl}
    <div class="jact">
      <div class="small"><b>Хто це в дереві?</b> ${self.length ? 'Схоже на: ' + self.map(p => `<button type="button" class="chip" data-act="jr-pick" data-id="${id}" data-v="${esc(plabel(p))}">${esc(plabel(p))}</button>`).join(' ') : '<span class="muted">збігів за іменем не знайдено — мабуть, людини ще немає в дереві</span>'}</div>
      <label class="f">Вже є в дереві — оберіть картку (щоб не було двох однакових)<input class="in" id="jp-${id}" list="jpeople" placeholder="Почніть вводити ім'я…" autocomplete="off" value="${self[0] ? esc(plabel(self[0])) : ''}"></label>
      <details${self.length ? '' : ' open'}><summary class="small">Або створити нову картку з даних заявки й прив'язати до рідних</summary>
        <div class="grid2" style="margin-top:8px">
          <label class="f">Батько<input class="in" id="jf-${id}" list="jpeople" value="${fG ? esc(plabel(fG)) : ''}" placeholder="з дерева" autocomplete="off"></label>
          <label class="f">Мати<input class="in" id="jm-${id}" list="jpeople" value="${mG ? esc(plabel(mG)) : ''}" placeholder="з дерева" autocomplete="off"></label>
          <label class="f">Чоловік / дружина<input class="in" id="js-${id}" list="jpeople" value="${sG ? esc(plabel(sG)) : ''}" placeholder="з дерева" autocomplete="off"></label>
        </div><p class="small muted" style="margin:4px 0 0">Підставлено найсхожіших — перевірте. Порожнє поле = не прив'язувати.</p></details>
      ${jrKidsBlock(r, self[0]?.id || '')}
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
      ${pend.length ? peopleList('jpeople') + pend.map(jrCard).join('') : '<p class="muted">Нових заявок немає.</p>'}
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
      const body = { id: d.id, role: $('#jr-role-' + d.id).value, kids: jrKidsRead(d.id) };
      if (person_id) body.person_id = person_id;
      else {
        const g = k => { const v = $(`#j${k}-${d.id}`).value.trim(); return v ? personByLabel(v) : ''; };
        body.create = { f: g('f'), mo: g('m'), spouse: g('s') };
        if (!body.create.f && !body.create.mo && t.dataset.armed !== '1') { t.dataset.armed = '1'; t.textContent = 'Без батьків картка буде окремо. Прийняти?'; return true; }
      }
      if (t.disabled) return true; t.disabled = true;
      const r = await api('/api/admin?a=approve', { body });
      if (body.create || r.kids) await load();
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
const TXT_PAGE = { history: 'families', villages: 'maps' };
function loadText(k, quiet) { // порожній результат не кешуємо назавжди: через 15 с спробуємо ще (текст міг щойно імпортуватись)
  if (k in TXT && !(TXT[k] === null && Date.now() - (TXT_T[k] || 0) > 15000)) return TXT[k];
  TXT[k] = undefined; TXT_T[k] = Date.now();
  api('/api/data?text=' + k).then(r => { TXT[k] = r.text || null; TXT_T[k] = Date.now(); if (k === 'history') BOOK.key = ''; if (quiet && S.view !== TXT_PAGE[k]) return; S.ui.keepScroll = true; render(); }).catch(() => { TXT[k] = null; TXT_T[k] = Date.now(); });
  return undefined;
}
async function syncNow() { // нові матеріали з репозиторію сервер вносить сам; сайт лише «будить» його при кожному відкритті
  let ok = 0; try { for (let k = 0; k < 25; k++) { const x = await api('/api/setup?a=sync', { body: {}, noRedirect: true }); ok += (x.result || []).filter(r => / ok/.test(r)).length; if (!x.more) break; } } catch {}
  if (ok) { delete TXT.history; delete TXT.villages; BOOK.key = ''; await load(); S.ui.keepScroll = true; render(); }
  return ok;
}
function mdLinks(h) { // [[p:id|Ім'я]] → посилання на картку; [[d:id|текст]] → відкрити документ
  return h.replace(/\[\[([pd]):([a-z0-9_]+)\|([^\]]+)\]\]/gi, (m, t, id, label) => t === 'p' ? (P[id] ? `<a href="${href('p', id)}">${label}</a>` : label) : (S.data.documents.some(d => d.id === id) ? `<a href="#" class="doclink" data-doc="${id}">${label}</a>` : label));
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
  if (spread) { pw = Math.min((W - 48) / 2, 520, (vh - 210) / 1.42); ph = pw * 1.42; }
  else { const mob = innerWidth <= 820; pw = Math.min(W - 16, 460, (vh - (mob ? 214 : 190)) / 1.5); ph = pw * 1.5; } // телефон: шапка 52 + панель книги 56 + нижнє меню 64
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
  if (p.kind === 'title') return `<div class="bk-page title"><div class="bk-tp"><div class="bk-orn">✥</div><div class="small caps">Родинний літопис</div><h2>Історія роду<br>Шутих</h2><div class="bk-rule"></div><p>Вороньки · Веприк · Лідин<br>Розкошівка · Ємилівка</p><p class="small">з 1791 року до наших днів</p><div class="bk-orn">❧</div><p class="small muted">Записано за метричними книгами, сповідними відомостями, записами ЗАГС і спогадами родини.${BOOK.updated ? ' Редакція ' + esc(BOOK.updated) + '.' : ''}</p></div></div>`;
  if (p.kind === 'toc') return `<div class="bk-page"><div class="bk-body"><h3 class="ch">Зміст</h3><ol class="bk-tocl">${BOOK.chapters.map(c => `<li><a href="#" data-bkgo="${c.page}"><span>${esc(c.title)}</span><i></i><b>${BOOK.spread ? c.page : c.page + 1}</b></a></li>`).join('')}</ol></div><div class="bk-foot">${num}</div></div>`;
  if (p.kind === 'end') return `<div class="bk-page title"><div class="bk-tp"><div class="bk-orn">❦</div><p><i>Історія роду пишеться далі.</i></p><p class="small">Знаєте більше — напишіть спогад на картці людини або натисніть «Уточнити / запитати».</p><div class="bk-orn">✥</div></div></div>`;
  return `<div class="bk-page"><div class="bk-head">${esc(p.chapter || '')}</div><div class="bk-body">${p.html}</div><div class="bk-foot">${num}</div></div>`;
}
function bookCoverHtml() {
  return `<div class="bk-cover"><div class="bk-cv-in"><div class="bk-orn">✥</div><div class="caps">Родинний літопис</div><h2>Історія<br>роду Шутих</h2><div class="bk-rule"></div><div class="caps small">1791 — 2025</div><button class="bk-open" data-bk="open">${bkHasMark() ? 'Читати далі' : 'Відкрити книгу'}</button>${bkHasMark() ? '<div class="bk-mk small">🔖 відкриється там, де ви зупинились</div>' : ''}</div></div>`;
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
  if (a === 'plain') { S.ui.ridPlain = true; SND.stopMusic(); render(); return; }
});
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
    return `<div class="hist">${glossify(`<p>${esc(v.intro || '')}</p>` + v.sections.map(sec => `<h3>${esc(sec.title)}</h3><div class="hl">${sec.items.map(it => `<div class="hr"><span class="mono">${esc(it.y || '')}</span><span>${esc(it.t)}${it.src?.length ? `<span class="hsrc">Джерело: ${src(it.src)}</span>` : ''}</span></div>`).join('')}</div>`).join(''))}
      ${v.ask?.length ? `<h3>Що варто замовити в архівах</h3><ul class="small">${v.ask.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${v.sources?.length ? `<h3>Усі джерела</h3><ol class="small hsrcs">${v.sources.map(x => `<li>${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.name)}</a>` : esc(x.name)}</li>`).join('')}</ol>` : ''}</div>`;
  }
  return vHistoryOld();
}
function vHistoryOld() {
  return `<div class="hist">${glossify(`<p>${esc(VHIST_INTRO)}</p><div class="hl">` + VHIST.map(([y, t, src]) => `<div class="hr"><span class="mono">${esc(y)}</span><span>${esc(t)}${src ? ` <i class="small muted">— ${esc(src)}</i>` : ''}</span></div>`).join('') + '</div>')}
  <h3>Шутих у цих джерелах поки не знайдено</h3><p class="small">Найдавніший відомий запис — сповідна відомість 1834 р. Щоб піти глибше, варто замовити:</p><ul class="small">${VHIST_ASK.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
  <p class="small muted">Є припущення, що назва «Веприк» — від «вепр» (дикий кабан), як в інших селах з такою назвою; джерела для нашого Веприка не знайдено.</p></div>`;
}
function vMaps() {
  curTarget = 'maps';
  const all = mapsList(), vs = [...new Set(all.flatMap(m => m.villages || []))].sort((a, b) => a.localeCompare(b, 'uk'));
  const f = S.ui.mapv || '', list = f ? all.filter(m => (m.villages || []).includes(f)) : all;
  const htab = `<div class="seg mtabs"><button type="button" class="${S.ui.mtab !== 'hist' ? 'on' : ''}" data-act="map-tab" data-v="">Старі карти</button><button type="button" class="${S.ui.mtab === 'hist' ? 'on' : ''}" data-act="map-tab" data-v="hist">Історія сіл</button></div>`;
  if (S.ui.mtab === 'hist') return `<div class="pghead"><h1 title="Старі карти й історія наших сіл.">Місця</h1>${htab}<p class="tabnote" title="Історія Вороньків, Веприка й сусідніх сіл — з посиланнями на джерела.">Історія Вороньків, Веприка й сусідніх сіл — з посиланнями на джерела.</p></div>${vHistory()}`;
  return `<div class="pghead"><h1 title="Старі карти й історія наших сіл.">Місця</h1>${htab}<p class="tabnote" title="Як виглядали наші села 100–150 років тому. Карту з позначкою «прив'язана» можна накласти на сучасну карту чи супутниковий знімок.">Як виглядали наші села 100–150 років тому. Карту з позначкою «прив'язана» можна накласти на сучасну карту чи супутниковий знімок.</p></div>
  <div class="tbar mapbar">${vs.length > 1 ? `<div class="seg"><button type="button" class="${!f ? 'on' : ''}" data-act="map-v" data-v="">Усі (${all.length})</button>${vs.map(v => `<button type="button" class="${f === v ? 'on' : ''}" data-act="map-v" data-v="${esc(v)}">${esc(v)}</button>`).join('')}</div>` : ''}
    ${canEdit() ? `<button class="btn line small" data-act="map-form">+ Додати карту</button>` : ''}</div>
  ${canEdit() && S.ui.mapform ? `<div class="docform"><input class="in" id="mtitle" placeholder="Назва: напр. «Вороньки на карті РККА»"><input class="in" id="myear" inputmode="numeric" placeholder="Рік (напр. 1941)"><input class="in" id="mvil" placeholder="Села через кому: Вороньки, Веприк"><input class="in" id="msrc" placeholder="Джерело: звідки карта"><label class="btn line small" style="cursor:pointer">Вибрати зображення<input type="file" accept="image/*" multiple data-mapup="1" hidden></label><div class="msg" id="mmsg"></div></div>` : ''}
  <div class="maps">${list.map(m => `<article class="mapc">
    <button class="mapim" data-doc="${m.id}" title="Відкрити карту">${m.pages ? `<img src="${img('doc=' + m.id + '&page=0', true)}" alt="" loading="lazy">` : '<span class="ph">зображення ще немає</span>'}</button>
    <div class="mapt"><b>${esc(m.title)}</b><span class="mono small">${esc(m.date || m.year || '')}</span>
      ${(m.villages || []).length ? `<span class="small muted">${m.villages.map(esc).join(' · ')}</span>` : ''}
      ${m.text ? `<p class="small">${glossify(esc(m.text))}</p>` : ''}
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
  return `<div class="lede"><div class="eyebrow">Покажчик</div><h1>Усі родичі</h1><p class="small muted">${Object.keys(P).length} людей у дереві</p></div>
  <div class="btns plbar" style="margin-bottom:6px"><input class="in search" id="q" type="search" value="${esc(S.ui.q || '')}" placeholder="Пошук: ім'я, прізвище, село" aria-label="Пошук">${canEdit() ? `<button class="btn line" data-add="new" style="margin-bottom:18px">+ Нова<span class="hm"> людина</span></button>` : ''}</div>
  <div class="tablebox"><table class="t plist"><thead><tr><th>Ім'я</th><th>Роки</th><th>Місце</th><th>Гілка</th></tr></thead><tbody>
  ${list.map(p => `<tr class="click" data-go="${p.id}"><td><b style="font-family:var(--f-display);font-size:15.5px">${esc(full(p))}</b>${p.m && p.m !== p.s ? ` <span class="muted small">з дому ${esc(p.m)}</span>` : ''}${p.hyp ? '<span class="badge">гіпотеза</span>' : ''}</td><td class="mono small">${esc(life(p))}</td><td class="small">${esc(p.bp || '')}</td><td class="small">${esc(famT(p))}</td></tr>`).join('') || `<tr><td colspan="4" class="muted">Нікого не знайдено.</td></tr>`}
  </tbody></table></div>`;
}

/* ───── Документи ───── */
const docCard = d => `<button class="doc" data-doc="${d.id}"><span class="im">${d.pages ? `<img src="${img('doc=' + d.id + '&page=0', true)}" alt="" loading="lazy">` : '<span class="ph" style="width:100%;height:100%">скан ще не додано</span>'}</span><b>${esc(d.title)}</b><span class="mono">${esc(d.date || '')}${d.place ? ' · ' + esc(d.place) : ''}</span></button>`;
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
function viewer({ title, pages, line, text, src, people, photoId, docId, marks, items, startAt }) {
  const canPhoto = !!(items ? items.some(x => x.photoId) : photoId); let i = startAt || 0, sc = 1, tx = 0, ty = 0, mk = (marks || []).slice(), draw = null;
  const L = $('#layer');
  document.body.classList.add('noscroll');
  const who_ = (people || []).filter(x => P[x]);
  L.innerHTML = `<div class="pv" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="pv-top"><div class="pv-t"><b>${esc(title)}</b>${pages.length > 1 ? `<span class="mono pv-n"></span>` : ''}</div>
      <button class="pv-ic" data-pv="zoom" title="Збільшити (або двічі клацніть по фото)" aria-label="Збільшити">${ICO.zoom}</button>
      ${canPhoto || (docId && canEdit()) ? `<button class="pv-ic" data-pv="more" title="Ще" aria-label="Ще дії">${ICO.more}</button>` : ''}
      <button class="pv-ic" data-pv="close" title="Закрити (Esc)" aria-label="Закрити">${ICO.x}</button></div>
    <div class="pv-menu" hidden>
      ${docId && canEdit() ? `<label class="pv-mi">+ Додати сторінку<input type="file" accept="image/*" multiple data-docpage="${docId}" hidden></label><button class="pv-mi" data-pv="mkdraw">Обвести наш запис рамкою</button><button class="pv-mi" data-pv="mkclear">Прибрати рамки з цієї сторінки</button>` : ''}
      ${docId && isOwner() ? `<button class="pv-mi danger" data-pv="docdel">Видалити документ з сайту</button>` : ''}
      ${canPhoto && canEdit() ? `<button class="pv-mi" data-portrait="${photoId || ''}">Зробити головним фото</button>` : ''}
      ${canPhoto ? `<button class="pv-mi" data-pv="cap">Змінити підпис</button><button class="pv-mi danger" data-delphoto="${photoId || ''}">Видалити фото</button>` : ''}
    </div>
    <div class="pv-stage">${pages.length ? `<img class="pv-img" alt="${esc(title)}" draggable="false"><div class="pv-marks" aria-hidden="true"></div><div class="pv-hint" hidden>Проведіть по скану, щоб обвести запис. <button data-pv="mkcancel">Скасувати</button></div>` : '<p class="pv-empty">Скан ще не додано.</p>'}
      ${pages.length > 1 ? `<button class="pv-nav prev" data-pv="prev" aria-label="Попередня">${ICO.l}</button><button class="pv-nav next" data-pv="next" aria-label="Наступна">${ICO.r}</button>` : ''}
      <div class="pv-load"></div></div>
    <div class="pv-cap">
      <button class="pv-find" data-pv="tomark" hidden>⌕ Показати наш запис</button>
      ${line || text ? glossify((line ? `<div class="pv-line">${esc(line)}</div>` : '') + (text ? `<div class="pv-text">${esc(text)}</div>` : '')) : ''}${src ? `<div class="pv-src">${esc(src)}</div>` : ''}
      ${who_.length ? `<div class="pv-people">${who_.map(x => `<a href="${href('p', x)}" data-pv="go">${ph(P[x])}<span>${esc(short(P[x]))}</span></a>`).join('')}</div>` : ''}
      ${canPhoto ? `<div class="pv-capedit" hidden><input class="in" id="cap-in" value="${esc(title === short(P[people?.[0]] || {}) ? '' : title)}" placeholder="Хто на фото, рік, звідки"><button class="btn small" data-pv="capsave">Зберегти</button></div>` : ''}
    </div></div>`;
  const root = L.querySelector('.pv'), stage = root.querySelector('.pv-stage'), im = root.querySelector('.pv-img'), menu = root.querySelector('.pv-menu'), mkEl = root.querySelector('.pv-marks');
  const setT = (tr, anim) => { for (const el of [im, mkEl]) { if (!el) continue; el.style.transition = anim ? 'transform .22s ease' : 'none'; el.style.transform = tr; } };
  // Рамки «наш запис»: шар точно над зображенням, з тим самим масштабом і зсувом
  const pageMarks = () => mk.filter(m => (m.p || 0) === i);
  const placeMarks = () => { if (!im || !mkEl) return; Object.assign(mkEl.style, { left: im.offsetLeft + 'px', top: im.offsetTop + 'px', width: im.offsetWidth + 'px', height: im.offsetHeight + 'px' });
    mkEl.innerHTML = pageMarks().map(m => `<div class="pv-mark" style="left:${m.x * 100}%;top:${m.y * 100}%;width:${m.w * 100}%;height:${m.h * 100}%"></div>`).join('') + (draw?.box ? `<div class="pv-mark draft" style="left:${draw.box.x * 100}%;top:${draw.box.y * 100}%;width:${draw.box.w * 100}%;height:${draw.box.h * 100}%"></div>` : '');
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
  const show = () => {
    if (!im) return; sc = 1; tx = ty = 0; apply(false);
    root.classList.add('loading'); im.onload = () => root.classList.remove('loading'); im.onerror = () => root.classList.remove('loading');
    im.onload = () => { root.classList.remove('loading'); placeMarks(); }; placeMarks();
    if (items) { const it = items[i] || {}; photoId = it.photoId || null; title = it.title || ''; root.querySelector('.pv-t b').textContent = title; const tEl = root.querySelector('.pv-text'); if (tEl) tEl.textContent = it.text || '';
      root.querySelectorAll('[data-portrait],[data-delphoto]').forEach(b => { if ('portrait' in b.dataset) b.dataset.portrait = photoId || ''; else b.dataset.delphoto = photoId || ''; b.hidden = !photoId; }); const cb = root.querySelector('[data-pv=cap]'); if (cb) cb.hidden = !photoId;
      const ci = root.querySelector('#cap-in'); if (ci) ci.value = it.caption || ''; const ce = root.querySelector('.pv-capedit'); if (ce) ce.hidden = true; }
    im.src = pages[i]; const n = root.querySelector('.pv-n'); if (n) n.textContent = `${i + 1} / ${pages.length}`;
    if (pages.length > 1) new Image().src = pages[(i + 1) % pages.length]; // наступна вантажиться заздалегідь
  };
  const go = d => { if (pages.length < 2) return; i = (i + d + pages.length) % pages.length; show(); };
  const onRs = () => placeMarks(); window.addEventListener('resize', onRs);
  const close = () => { document.body.classList.remove('noscroll'); document.removeEventListener('keydown', key, true); window.removeEventListener('resize', onRs); closeLayer(); };
  const key = e => { if (!L.contains(root)) { document.removeEventListener('keydown', key, true); return; } if (e.target.tagName === 'INPUT') return; if (e.key === 'Escape') { e.stopPropagation(); close(); } if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); if (e.key === '+' || e.key === '=') zoomTo(sc * 1.5, 0, 0); if (e.key === '-') zoomTo(sc / 1.5, 0, 0); };
  document.addEventListener('keydown', key, true);

  // Кнопки
  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-pv]'); if (!b) { if (!menu.hidden && !e.target.closest('.pv-menu')) menu.hidden = true; return; }
    const a = b.dataset.pv; e.stopPropagation();
    if (a === 'close') return close();
    if (a === 'go') { e.preventDefault(); const h = b.getAttribute('href'); close(); location.hash = h; return; }
    if (a === 'prev') return go(-1);
    if (a === 'next') return go(1);
    if (a === 'zoom') return sc > 1.01 ? zoomTo(1, 0, 0) : (pageMarks().length ? toMark() : zoomTo(2.5, 0, 0));
    if (a === 'tomark') return toMark();
    if (a === 'docdel') { if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Точно видалити? Натисніть ще раз'; return; } await api('/api/data', { body: { op: 'doc.delete', id: docId } }); close(); await load(); render(); toast('Документ прибрано з сайту'); return; }
    if (a === 'mkdraw') { menu.hidden = true; zoomTo(1, 0, 0, false); draw = { box: null }; root.classList.add('drawing'); root.querySelector('.pv-hint').hidden = false; return; }
    if (a === 'mkcancel') { draw = null; root.classList.remove('drawing'); root.querySelector('.pv-hint').hidden = true; placeMarks(); return; }
    if (a === 'mkclear') { menu.hidden = true; mk = mk.filter(m => (m.p || 0) !== i); return saveMarks(); }
    if (a === 'more') { menu.hidden = !menu.hidden; return; }
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
    pts.set(e.pointerId, [e.clientX, e.clientY]); stage.setPointerCapture?.(e.pointerId);
    if (pts.size === 1) { start = { x: e.clientX, y: e.clientY, tx, ty, t: Date.now() }; moved = false; }
    if (pts.size === 2) { const [[x1, y1], [x2, y2]] = [...pts.values()]; pinch = { d: Math.hypot(x2 - x1, y2 - y1), sc, c: rel((x1 + x2) / 2, (y1 + y2) / 2), tx, ty }; moved = true; }
  });
  stage.addEventListener('pointermove', e => {
    if (draw) { if (!draw.a) return; const [x, y] = frac(e), [x0, y0] = draw.a; draw.box = { x: Math.min(x, x0), y: Math.min(y, y0), w: Math.abs(x - x0), h: Math.abs(y - y0) }; placeMarks(); return; }
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && pts.size >= 2) { const [[x1, y1], [x2, y2]] = [...pts.values()]; const ns = Math.min(6, Math.max(1, pinch.sc * Math.hypot(x2 - x1, y2 - y1) / pinch.d)); const k = ns / pinch.sc; const c = rel((x1 + x2) / 2, (y1 + y2) / 2); tx = c[0] - (pinch.c[0] - pinch.tx) * k; ty = c[1] - (pinch.c[1] - pinch.ty) * k; sc = ns; clamp(); apply(false); return; }
    if (!start) return; const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!moved && Math.hypot(dx, dy) < 8) return; moved = true;
    if (sc > 1.01) { tx = start.tx + dx; ty = start.ty + dy; clamp(); apply(false); }
    else { setT(Math.abs(dy) > Math.abs(dx) ? `translateY(${Math.max(0, dy)}px)` : `translateX(${pages.length > 1 ? dx : dx / 4}px)`, false); root.style.backgroundColor = `rgba(14,12,10,${Math.abs(dy) > Math.abs(dx) ? Math.max(.35, 1 - Math.max(0, dy) / 500) : 1})`; }
  });
  const up = e => {
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
  x: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  zoom: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M11 8v6M8 11h6"/></svg>',
  unzoom: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M8 11h6"/></svg>',
  more: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  l: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  r: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
};
function openDoc(id) { const d = S.data.documents.find(x => x.id === id); if (!d) return; ev('open', 'doc', 'doc:' + id); viewer({ title: d.title, marks: d.marks, pages: Array.from({ length: d.pages || 0 }, (_, k) => img(`doc=${d.id}&page=${k}`)), line: d.line ? 'Наша строчка: ' + d.line : '', text: d.text, src: [d.src, d.place].filter(Boolean).join(' · '), people: d.people, docId: d.id }); }
function openPhoto(id) { const x = S.data.photos.find(y => y.id === id); if (!x) return; if (x.mime === 'application/pdf') { window.open(img('photo=' + id), '_blank', 'noopener'); return; }
  const list = S.data.photos.filter(y => y.person === x.person && y.mime !== 'application/pdf'), k = Math.max(0, list.findIndex(y => y.id === id));
  const items = list.map(y => ({ photoId: (canEdit() || y.by === S.me.id) ? y.id : null, title: y.caption || short(P[y.person] || {}), caption: y.caption || '', text: `Додав(ла): ${who(y.by)}, ${when(y.at)}` }));
  viewer({ title: items[k].title, pages: list.map(y => img('photo=' + y.id)), text: items[k].text, people: [x.person], photoId: items[k].photoId, items, startAt: k }); }

/* ───── Власнику: аналітика, доступи, історія ───── */
const fmtT = ms => { const m = Math.round((ms || 0) / 60000); return m < 60 ? `${m} хв` : `${Math.floor(m / 60)} год ${m % 60} хв`; };
const delta = (a, b) => { if (!b) return a ? '<em class="up">нове</em>' : '<em class="muted">—</em>'; const d = Math.round((a - b) / b * 100); return `<em class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${d}%</em>`; };
const PERIODS = [['7', '7 днів'], ['30', '30 днів'], ['90', '3 місяці'], ['365', 'Рік'], ['all', 'Весь час']];
function periodRange() { const a = S.admin; if (a.period === 'custom' && a.from) return { from: a.from, to: a.to || new Date().toISOString().slice(0, 10) }; const n = a.period === 'all' ? 3650 : Number(a.period || 30); const to = new Date(); const from = new Date(to - n * 864e5); return { from: from.toISOString(), to: new Date(to.getTime() + 60000).toISOString() }; }
async function loadAdmin() {
  const a = S.admin; a.tab ||= (S.data?.joinPending ? 'access' : 'stats'); a.period ||= '30';
  try {
    if (a.tab === 'stats') { const { from, to } = periodRange(); a.stats = await api(`/api/admin?a=stats&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`); if (a.member) a.log = await api(`/api/admin?a=log&id=${a.member}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`); }
    if (a.tab === 'access') { a.members = await api('/api/admin?a=members'); try { a.join = await api('/api/admin?a=join_link'); a.reqs = (await api('/api/admin?a=requests')).requests; a.joinErr = false; } catch { a.joinErr = true; } }
    if (a.tab === 'history') a.revs = await api('/api/admin?a=revisions');
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
function vAdmin() {
  if (!isOwner()) return '<p>Немає доступу.</p>';
  const a = S.admin;
  const tabs = `<div class="tabs2">${[['stats', 'Аналітика'], ['access', 'Доступи'], ['history', 'Історія змін']].map(([k, t]) => `<button aria-pressed="${a.tab === k}" data-atab="${k}">${t}</button>`).join('')}</div>`;
  let body = '<p class="muted">Завантаження…</p>';
  if (a.err) body = `<p class="msg err">${esc(a.err)}</p>`;
  else if (a.tab === 'stats' && a.stats) {
    const st = a.stats; const sum = (o, k) => Object.values(o).reduce((s, x) => s + (x[k] || 0), 0);
    const names = Object.fromEntries(st.members.map(m => [m.id, m.name || 'Без імені']));
    const rows = sortRows(st.members.map(m => { const c = st.cur[m.id] || {}, p = st.prev[m.id] || {}; return { id: m.id, name: names[m.id], role: m.role, time: c.time || 0, ptime: p.time || 0, opens: c.opens || 0, days: c.days || 0, sessions: c.sessions || 0, edits: c.edits || 0, last: c.last || '' }; }), 'time');
    const active = Object.values(st.cur).filter(x => x.time || x.opens).length, pactive = Object.values(st.prev).filter(x => x.time || x.opens).length;
    const viewsName = { tree: 'Дерево', p: 'Картки людей', person: 'Картки людей', families: 'Родини', fam: 'Родини', people: 'Покажчик', docs: 'Документи', admin: 'Панель власника' };
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
    body = joinBlock() + `<div class="sec" style="margin-top:26px"><h3>Запросити родича особисто</h3>
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
  } else if (a.tab === 'history' && a.revs) {
    body = `<p class="small muted">Усі зміни в дереві. Будь-яку можна відкотити: попередній стан повернеться, а сам відкат теж запишеться в історію.</p>${revList(a.revs.revisions)}`;
  }
  return `<div class="pghead"><h1 title="Аналітика, доступи родичів та історія змін.">Власнику</h1>${tabs}</div>${body}`;
}
const ENT = { person: 'Картка', union: 'Подружжя', family: 'Родина', story: 'Спогад', photo: 'Фото', member: 'Доступ', seed: 'Імпорт', question: 'Запитання' };
const ACT = { create: 'створено', update: 'змінено', delete: 'видалено', restore: 'відкат', invite: 'запрошення', reset: 'новий пароль' };
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
  'Батьків рід — із Вороньків, мамин — із Веприку й Лідина. Їхні імена століттями лежали в церковних книгах. Тепер ми повертаємо їх родині.',
  'Знати свій рід — значить знати, звідки ти і куди йдеш.'
];
const QUOTE = { t: 'Учітеся, читайте,<br>І чужому научайтесь,<br>Й свого не цурайтесь:<br>Бо хто матір забуває,<br>Того Бог карає…', a: 'Тарас Шевченко, «І мертвим, і живим, і ненарожденним…», 1845' };
const introHtml = btn => `<div class="intro">${INTRO.map((l, i) => `<p class="il" style="animation-delay:${0.4 + i * 1.3}s">${l}</p>`).join('')}
  <blockquote class="iq" style="animation-delay:${0.6 + INTRO.length * 1.3}s"><p>${QUOTE.t}</p><cite>${QUOTE.a}</cite></blockquote>
  ${btn ? `<button class="btn ib" data-act="intro-close" style="animation-delay:${1.2 + INTRO.length * 1.3}s">До родинного архіву</button>` : ''}</div>`;
const introSeen = () => { try { return sessionStorage.getItem('rs_intro') === '1'; } catch { return S.ui.introSeen; } };
const introMark = () => { S.ui.introSeen = true; try { sessionStorage.setItem('rs_intro', '1'); } catch {} };
function gate(inner) { return `<div class="gate"><div class="card"><h1>Рід Шутих</h1><div class="sub">Родинний архів · закритий доступ</div><div class="orn">◆ ◆ ◆</div>${inner}</div></div>`; }
function vLogin() { return `<div class="loginwrap">${introHtml(false)}` + gate(`<form id="login" class="sec"><label class="f">Пошта або логін<input class="in" id="lg-e" type="text" inputmode="email" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="username" required></label><label class="f">Пароль<input class="in" id="lg-p" type="password" autocomplete="current-password" required></label><button class="btn" type="submit">Увійти</button><div class="msg" id="lg-m"></div></form>${S.join ? `<p style="text-align:center;margin:0"><a href="#" data-act="to-register">Ще немає доступу? Зареєструватися</a></p>` : `<p class="small muted" style="text-align:center;margin:0">Доступ лише для родини. Забули пароль — напишіть Максиму.</p>`}`) + '</div>'; }
function vInvite(inv) { return gate(`<form id="accept" class="sec"><p style="margin:0">${inv.purpose === 'reset' ? 'Задайте новий пароль' : 'Вас запросили до родинного архіву.'}</p><label class="f">${inv.email.includes('@') ? 'Пошта' : 'Ваш логін (запишіть його)'}<input class="in" value="${esc(inv.email)}" disabled></label><label class="f">Як вас підписувати<input class="in" id="ac-n" value="${esc(inv.name || '')}" required></label><label class="f">Придумайте пароль (від 8 символів)<input class="in" id="ac-p" type="password" autocomplete="new-password" minlength="8" required></label><button class="btn" type="submit">${inv.purpose === 'reset' ? 'Зберегти пароль' : 'Увійти до архіву'}</button><div class="msg" id="ac-m"></div></form>`); }
function vSetup() { return gate(`<form id="setup" class="sec"><p style="margin:0">Перше налаштування: створіть обліковий запис власника.</p><label class="f">Код налаштування (BOOTSTRAP_TOKEN з Vercel)<input class="in" id="su-t" type="password" required></label><label class="f">Ваше ім'я<input class="in" id="su-n" value="Максим" required></label><label class="f">Пошта<input class="in" id="su-e" type="email" required></label><label class="f">Пароль (від 10 символів)<input class="in" id="su-p" type="password" minlength="10" autocomplete="new-password" required></label><button class="btn" type="submit">Створити</button><div class="msg" id="su-m"></div></form>`); }
function vSeed() { return gate(`<div class="sec"><p style="margin:0">База порожня. Імпортувати дерево, родини і скани документів із початкового набору?</p><button class="btn" data-act="seed">Імпортувати</button><div class="msg" id="sd-m"></div></div>`); }

/* ───── Рендер ───── */
function render() {
  const app = $('#app');
  if (S.gate) { app.innerHTML = S.gate(); return; }
  if (!S.me) { app.innerHTML = vLogin(); return; }
  if (!S.data) { app.innerHTML = top() + '<main class="wrap"><p class="muted">Завантаження…</p></main>'; return; }
  if (!S.data.persons.length && isOwner()) { app.innerHTML = vSeed(); return; }
  curTarget = null;
  const V = { tree: vTree, p: vPerson, families: vFamilies, fam: vFamily, people: vPeople, docs: vDocs, admin: vAdmin, q: vQuestions, maps: vMaps }[S.view] || vTree;
  const sy = window.scrollY;
  const bkKeep = document.getElementById('bk'); // книгу не перебудовуємо, якщо сторінка та сама — щоб нічого не блимало
  app.innerHTML = top() + `<main class="wrap${S.view === 'tree' ? ' wide' : ''}">${V()}</main>`;
  if (!introSeen() && !document.querySelector('.introlay')) document.body.insertAdjacentHTML('beforeend', `<div class="introlay">${introHtml(true)}</div>`);
  if (S.ui.keepScroll) { window.scrollTo(0, sy); S.ui.keepScroll = false; }
  if (S.view === 'tree') requestAnimationFrame(vpMount);
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
  if (t.dataset.upload) return upload(t.dataset.upload, [...t.files]);
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
    if (d.photo) return openPhoto(d.photo);
    if (d.add) { const base = P[S.arg]; return openAdd(d.add, d.add === 'new' ? null : base); }
    if (d.story) {
      const ta = document.getElementById('st-' + d.story), m = document.getElementById('stm-' + d.story);
      if (!ta.value.trim()) { m.textContent = 'Напишіть кілька слів.'; return; }
      t.disabled = true; const r = await api('/api/data', { body: { op: 'story.add', target: d.story, text: ta.value } });
      S.data.stories.push(r.story); S.ui.keepScroll = true; render(); toast('Спогад збережено'); return;
    }
    if (d.delstory) { if (t.dataset.armed !== '1') { t.dataset.armed = '1'; t.textContent = 'точно видалити?'; return; } await api('/api/data', { body: { op: 'story.delete', id: d.delstory } }); S.data.stories = S.data.stories.filter(s => s.id !== d.delstory); S.ui.keepScroll = true; render(); return; }
    if (d.unlink) { await api('/api/data', { body: { op: 'union.remove', id: d.unlink } }); S.data.unions = S.data.unions.filter(u => u.id !== d.unlink); index(); openEdit(P[S.ui.editing]); return; }
    if (d.portrait) { const x = S.data.photos.find(y => y.id === d.portrait); const r = await api('/api/data', { body: { op: 'person.portrait', id: x.person, photo: x.id } }); Object.assign(P[x.person], r.person); closeLayer(); S.ui.keepScroll = true; render(); toast('Головне фото змінено'); return; }
    if (d.delphoto) { if (t.dataset.armed !== '1') { t.dataset.armed = '1'; t.textContent = 'Точно видалити?'; return; } await api('/api/data', { body: { op: 'photo.delete', id: d.delphoto } }); S.data.photos = S.data.photos.filter(x => x.id !== d.delphoto); closeLayer(); S.ui.keepScroll = true; render(); return; }
    if (d.famedit) { const f = FAM[d.famedit]; modal(`<h2>${esc(f.title)}</h2><p class="small muted">Абзаци розділяйте порожнім рядком. Жирний текст: **так**.</p><textarea class="in" id="fe" style="min-height:300px">${esc(htmlToText(f.story || ''))}</textarea><div class="btns"><button class="btn" data-act="famsave">Зберегти</button><button class="btn line" data-act="close">Скасувати</button><span class="msg" id="emsg"></span></div>`); S.ui.famEditing = f.id; return; }
    if (d.atab) { S.admin.tab = d.atab; S.admin.err = null; render(); return loadAdmin(); }
    if (d.per) { S.admin.period = d.per; if (d.per !== 'custom') { render(); return loadAdmin(); } render(); return; }
    if (d.member !== undefined) { S.admin.member = d.member || null; S.admin.log = null; if (!d.member) { render(); return; } return loadAdmin(); }
    if (d.k) { S.admin.dir = S.admin.sort === d.k ? -(S.admin.dir || -1) : -1; S.admin.sort = d.k; render(); return; }
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
    if (act === 't-png') { if (t.disabled) return; t.disabled = true; const o = t.textContent; t.textContent = 'Готую картинку…'; try { await treePng(); } catch (err) { console.error(err); toast('Не вдалося зробити картинку'); } t.disabled = false; t.textContent = o; return; }
    if (act === 't-open') { S.ui.tf ||= {}; S.ui.tf.allOpen = !S.ui.tf.allOpen; if (!S.ui.tf.allOpen) { S.ui.exp = {}; S.ui.sibx = {}; S.ui.kidx = {}; } delete S.ui.vp?.all; render(); return; }
    if (act === 'import') { if (t.disabled) return; t.disabled = true; $('#imp-m').textContent = 'Імпортую…'; let r = { result: [] }; for (let k = 0; k < 25; k++) { const x = await api('/api/setup?a=import', { body: {} }); r.result.push(...(x.result || [])); if (!x.more) break; } const ok = (r.result || []).filter(x => / ok/.test(x)).length; $('#imp-m').textContent = ok ? `Додано: ${ok}. ${(r.result || []).join(' · ')}` : 'Нового немає — усе вже імпортовано.'; t.disabled = false; delete TXT.history; delete TXT.villages; BOOK.key = ''; await load(); return; }
    if (act === 'intro-close') { introMark(); document.querySelector('.introlay')?.remove(); return; }
    if (act === 'msheet') { mSheet(); return; }
    if (act === 'mshclose') { if (e.target.closest('.msh') && !e.target.closest('a')) return; $('#layer').innerHTML = ''; document.documentElement.classList.remove('msh-open'); return; }
    if (act === 'logout') { $('#layer').innerHTML = ''; document.documentElement.classList.remove('msh-open'); await api('/api/auth?a=logout', { body: {} }).catch(() => {}); S.me = null; S.data = null; render(); return; }
    if (act === 'docform') { S.ui.docform = !S.ui.docform; S.ui.keepScroll = true; render(); setTimeout(() => $('#dtitle')?.focus(), 30); return; }
    if (act === 'edit') return openEdit(P[S.arg]);
    if (act === 'history') { e.preventDefault(); const r = await api(`/api/admin?a=revisions&entity=person&id=${encodeURIComponent(S.arg)}`); modal(`<h2>Історія змін</h2>${revList(r.revisions)}<div class="btns"><button class="btn line" data-act="close">Закрити</button></div>`); return; }
    if (act === 'save' || act === 'create') {
      if (t.disabled) return; t.disabled = true; // захист від подвійного натискання
      const data = readForm(); const m = $('#emsg'); m.textContent = 'Зберігаю…'; m.className = 'msg';
      const cur = act === 'save' ? P[S.ui.editing] : null;
      const body = cur ? { op: 'person.save', id: cur.id, v: cur.v, data: { ...data, ...(cur.portrait ? { portrait: cur.portrait } : {}) } } : { op: 'person.save', data, link: S.ui.adding?.link || {} };
      const r = await api('/api/data', { body });
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
function toJpeg(file, max, q) {
  return new Promise((ok, bad) => {
    const u = URL.createObjectURL(file); const im = new Image();
    im.onload = () => { const k = Math.min(1, max / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); c.toBlob(b => b ? ok(b) : bad(new Error('type')), 'image/jpeg', q); };
    im.onerror = () => { URL.revokeObjectURL(u); bad(new Error('type')); };
    im.src = u;
  });
}
async function upload(personId, files) {
  const m = $('#upmsg'); let n = 0;
  for (const f of files) {
    try {
      m.className = 'msg'; m.textContent = `Завантажую ${n + 1} з ${files.length}…`;
      let full, thumb = null;
      if (f.type === 'application/pdf') { if (f.size > 4e6) throw new Error('too_large'); full = f; }
      else { full = await toJpeg(f, 2200, 0.86); if (full.size > 4e6) full = await toJpeg(f, 1600, 0.8); thumb = await toJpeg(f, 420, 0.78); }
      const r = await api(`/api/upload?person=${encodeURIComponent(personId)}&caption=${encodeURIComponent(prompt2())}`, { raw: full });
      if (thumb) await api(`/api/upload?kind=thumb&photo=${r.id}`, { raw: thumb }).catch(() => {});
      n++;
    } catch (err) { console.warn("[upload]", err); m.className = "msg err"; m.textContent = `«${f.name}»: ${errText(err)}`; }
  }
  if (n) { await load(); S.ui.keepScroll = true; render(); toast(`Додано фото: ${n}`); }
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
  box.innerHTML = list.length ? list.map((p, i) => `<button type="button" class="tsug-i${i ? '' : ' on'}" data-tfind="${p.id}">${avatar(p)}<span><b>${esc(full(p))}</b><small>${esc([life(p), (S.ui.tl?.N || {})[p.id] ? '' : 'відкриє дерево від неї/нього'].filter(Boolean).join(' · '))}</small></span></button>`).join('') : '<div class="tsug-no">Нікого не знайдено</div>';
}
function tqPick(id) {
  if (!P[id]) return; document.getElementById('tsug')?.remove();
  S.ui.tf ||= {}; S.ui.tf.q = '';
  if (!(S.ui.tl?.N || {})[id]) { S.ui.tf.center = id; delete S.ui.vp?.all; }
  S.ui.findId = id; S.ui.pp = id; render();
}
document.addEventListener('input', e => { if (e.target.id === 'tq') tqShow(); });
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

start();
})();
