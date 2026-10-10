/* Рід Шутих — інтерфейс. Ванільний JS, стан у S, render() перебудовує #app.
   Усі дані — лише через /api (сесія в HttpOnly-cookie). Жодних ключів і прямих звернень до бази. */
(function () {
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { me: null, data: null, view: 'tree', arg: null, ui: {}, admin: {} };
let P = {}, KIDS = {}, SPOUSES = {}, FAM = {};

/* ───── API ───── */
async function api(path, opts = {}) {
  const r = await fetch(path, { method: opts.method || (opts.body || opts.raw ? 'POST' : 'GET'), headers: opts.raw ? { 'content-type': 'application/octet-stream' } : opts.body ? { 'content-type': 'application/json' } : {}, body: opts.raw || (opts.body ? JSON.stringify(opts.body) : undefined), credentials: 'same-origin' });
  let j = {}; try { j = await r.json(); } catch {}
  if (r.status === 401 && !opts.noRedirect) { S.me = null; render(); }
  if (!r.ok) { const e = new Error(j.error || 'http_' + r.status); e.status = r.status; throw e; }
  return j;
}
const ERR = { wrong: 'Невірна пошта або пароль.', too_many: 'Забагато спроб. Зачекайте 15 хвилин.', weak: 'Пароль має бути не коротший за 8 символів.', invalid: 'Посилання недійсне або вже використане. Попросіть Максима надіслати нове.', conflict: 'Хтось щойно змінив цю картку. Оновіть сторінку й спробуйте ще раз.', forbidden: 'У вас немає прав на цю дію.', exists: 'Людина з такою поштою вже має доступ.', email: 'Перевірте адресу пошти.', too_large: 'Файл завеликий (до 4 МБ).', type: 'Підходять фото JPG, PNG, WEBP або PDF.', token: 'Невірний код налаштування.', name: 'Вкажіть хоча б ім\'я або прізвище.', branch: 'Доповнювати можна лише свою гілку: себе, батьків, дітей, братів і сестер.' };
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
const href = (v, a) => '#/' + v + (a ? '/' + encodeURIComponent(a) : '');
const mini = id => { const p = P[id]; if (!p) return ''; return `<a class="mini${p.hyp ? ' hyp' : ''}" href="${href('p', id)}">${ph(p)}<span><b>${esc(short(p))}</b><em>${esc(life(p))}</em></span></a>`; };

/* ───── Маршрути ───── */
function parse() {
  const h = location.hash.replace(/^#\/?/, ''); const [v, a] = h.split('/');
  S.view = v || 'tree'; S.arg = a ? decodeURIComponent(a) : null;
}
addEventListener('hashchange', () => { parse(); render(); window.scrollTo(0, 0); });

/* ───── Шапка ───── */
function top() {
  const nav = [['tree', 'Дерево'], ['families', 'Родини'], ['people', 'Люди'], ['docs', 'Документи']];
  if (isOwner()) nav.push(['admin', 'Власнику']);
  const cur = S.view === 'p' ? 'people' : S.view === 'fam' ? 'families' : S.view;
  return `<header class="top"><div class="wrap">
    <a class="brand" href="#/tree">Рід Шутих<small>Вороньки · з 1767</small></a>
    <nav class="nav" aria-label="Розділи">${nav.map(([k, t]) => `<a href="${href(k)}"${cur === k ? ' aria-current="page"' : ''}>${t}</a>`).join('')}</nav>
    <div class="who"><span>${esc(S.me.name || S.me.email || '')}</span><button data-act="logout">Вийти</button></div>
  </div></header>`;
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
  const tabs = `<div class="tmodes"><button data-tmode="all" class="${mode === 'all' ? 'on' : ''}">Усе дерево · згори вниз</button><button data-tmode="ped" class="${mode === 'ped' ? 'on' : ''}">Предки · зліва направо</button></div>`;
  return mode === 'ped' ? vPedigree(tabs) : vAll(tabs);
}
function vPedigree(tabs) {
  const r0 = rootId(); const kidsR = (KIDS[r0] || []).slice().sort(byBirth).reverse();
  const r = S.arg && P[S.arg] ? S.arg : (kidsR[0] || r0);
  depthMax = 0; const t = branchHtml(r, 0, new Set());
  const L = ['', 'Батьки', 'Діди', 'Прадіди', 'Прапрадіди', '4-ті прадіди', '5-ті прадіди', '6-ті прадіди', '7-мі прадіди', '8-мі прадіди', '9-ті прадіди'];
  const R = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  return `<div class="lede"><div class="eyebrow">Родовід</div><h1>${S.arg ? 'Предки: ' + esc(short(P[r])) : 'Рід Шутих'}</h1></div>${tabs}
    <div class="legend"><span><i class="sw r"></i>Від кого рахуємо</span><span><i class="sw"></i>Підтверджено документами</span><span><i class="sw h"></i>Гіпотеза</span></div>
    <div class="vp" id="vp" data-mode="ped"><div class="stage" id="stage"><div class="treebox ped"><div class="gens">${Array.from({ length: depthMax + 1 }, (_, i) => `<div><b>${R[i] || i + 1}</b>${i ? (L[i] || i + '-ті прадіди') : 'Покоління'}</div>`).join('')}</div>${t}</div></div>${vpCtl(false)}</div>`;
}
const vpCtl = mini => `<div class="vpctl"><button data-zoom-in title="Збільшити">+</button><button data-zoom-out title="Зменшити">−</button><button data-zoom-fit title="Показати все">⤢</button></div>${mini ? '<canvas class="minimap" id="minimap" width="220" height="140"></canvas>' : ''}`;

/* ── Дерево згори вниз: людина в центрі, над нею батьки, діди…; біля кожного предка — брати й сестри ── */
const T2 = { W: 156, H: 46, GX: 12, GY: 92, PAD: 50 };
const P2 = T2.W + T2.GX;
function treeCenter() { const f = S.ui.tf || {}; if (f.center && P[f.center]) return f.center; const r0 = rootId(); const k = (KIDS[r0] || []).slice().sort(byBirth).reverse(); return k[0] || r0; }
function layoutTD(center) {
  const f = S.ui.tf || {}; const sortS = f.sort === 'name' ? ((a, b) => short(P[a]).localeCompare(short(P[b]), 'uk')) : byBirth;
  const mk = () => ({ n: [], c: {} }); // n: [{id,x,r}], c: row -> [min,max]
  const add = (B, id, x, r) => { B.n.push({ id, x, r }); const c = B.c[r] ||= [x, x]; c[0] = Math.min(c[0], x); c[1] = Math.max(c[1], x); };
  const shift = (B, dx) => { B.n.forEach(o => o.x += dx); Object.values(B.c).forEach(c => { c[0] += dx; c[1] += dx; }); return B; };
  const merge = (A, B) => { B.n.forEach(o => add(A, o.id, o.x, o.r)); return A; };
  const sep = (A, B) => { let d = -Infinity; for (const r in A.c) if (B.c[r]) d = Math.max(d, A.c[r][1] - B.c[r][0] + P2); return d === -Infinity ? 0 : d; };
  const seen = new Set();
  const sibs = c => { const p = P[c]; const ps = [p.f, p.mo].filter(x => x && P[x]); if (!ps.length) return [c]; return [...new Set(ps.flatMap(x => KIDS[x] || []))].filter(x => x === c || !seen.has(x)).sort(sortS); };
  function up(c, r, side) { // блок предків людини c (c у x=0, ряд r)
    const B = mk(); const g = sibs(c).filter(x => x === c || (P[x] && !seen.has(x)));
    let order = g.filter(x => x !== c); order = side === 'L' ? [...order, c] : side === 'R' ? [c, ...order] : g;
    const ci = order.indexOf(c); order.forEach((id, i) => { seen.add(id); add(B, id, (i - ci) * P2, r); });
    const p = P[c]; const fa = p.f && P[p.f] && !seen.has(p.f) ? p.f : null, mo = p.mo && P[p.mo] && !seen.has(p.mo) ? p.mo : null;
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
  const A = up(center, 0, 'C'); const D = down(center, 0); D.n = D.n.filter(o => o.id !== center); // центр уже в A
  D.n.forEach(o => add(A, o.id, o.x, o.r));
  const rows = [...new Set(A.n.map(o => o.r))].sort((a, b) => b - a); const ri = Object.fromEntries(rows.map((r, i) => [r, i]));
  const minX = Math.min(...A.n.map(o => o.x)), maxX = Math.max(...A.n.map(o => o.x));
  const N = {}; A.n.forEach(o => { N[o.id] = { x: o.x - minX + T2.PAD, y: ri[o.r] * (T2.H + T2.GY) + T2.PAD, r: o.r }; });
  return { N, w: maxX - minX + T2.W + T2.PAD * 2, h: rows.length * (T2.H + T2.GY) - T2.GY + T2.PAD * 2, rows };
}
function vAll(tabs) {
  const center = treeCenter(); const L = layoutTD(center); S.ui.tl = L; const f = S.ui.tf || {}; const V = new Set(Object.keys(L.N));
  const cx = id => L.N[id].x + T2.W / 2, top = id => L.N[id].y, bot = id => L.N[id].y + T2.H, midY = id => L.N[id].y + T2.H / 2;
  let lines = ''; const done = new Set();
  V.forEach(id => (SPOUSES[id] || []).forEach(s => { const k = [id, s.id].sort().join('|'); if (done.has(k) || !V.has(s.id) || L.N[s.id].r !== L.N[id].r) return; done.add(k);
    const [a, b] = cx(id) < cx(s.id) ? [id, s.id] : [s.id, id]; lines += `<path d="M${L.N[a].x + T2.W} ${midY(a)}H${L.N[b].x}" class="ln sp"/>`; }));
  const fam = {}; V.forEach(id => { const ps = [P[id].f, P[id].mo].filter(x => x && V.has(x)); if (ps.length) (fam[ps.sort().join('|')] ||= []).push(id); });
  Object.entries(fam).forEach(([k, kids]) => { const ps = k.split('|'); const two = ps.length === 2 && L.N[ps[0]].r === L.N[ps[1]].r;
    const px = two ? (cx(ps[0]) + cx(ps[1])) / 2 : cx(ps[0]), py = two ? midY(ps[0]) : bot(ps[0]);
    const by = top(kids[0]) - T2.GY / 2; const xs = kids.map(cx); const x1 = Math.min(px, ...xs), x2 = Math.max(px, ...xs);
    lines += `<path d="M${px} ${py}V${by}M${x1} ${by}H${x2}${xs.map(x => `M${x} ${by}V${top(kids[0])}`).join('')}" class="ln"/>`; });
  const q = (f.q || '').trim().toLowerCase();
  const cards = [...V].map(id => { const p = P[id], n = L.N[id]; const hit = q && full(p).toLowerCase().includes(q);
    return `<a class="nd t2${p.hyp ? ' hyp' : ''}${id === center ? ' root' : ''}${hit ? ' hit' : ''}" href="${href('p', id)}" style="left:${n.x}px;top:${n.y}px" data-id="${id}">${ph(p)}<span><b>${esc(short(p))}</b><span class="y">${esc(life(p))}</span></span></a>`; }).join('');
  const opts = Object.values(P).sort((x, y) => short(x).localeCompare(short(y), 'uk')).map(x => `<option value="${x.id}"${x.id === center ? ' selected' : ''}>${esc(full(x))}${yearOf(x.b) ? ' (' + yearOf(x.b) + ')' : ''}</option>`).join('');
  const glabels = L.rows.map((r, i) => `<div class="glab" style="top:${i * (T2.H + T2.GY) + T2.PAD - 18}px">${r === 0 ? 'Від кого будуємо' : r > 0 ? (['', 'Батьки', 'Діди', 'Прадіди', 'Прапрадіди'][r] || (r - 2) + '-ті прадіди') : r === -1 ? 'Діти' : r === -2 ? 'Онуки' : 'Нащадки'}</div>`).join('');
  return `<div class="lede"><div class="eyebrow">Родовід згори вниз</div><h1>${esc(short(P[center]))}: предки й родина</h1></div>${tabs}
    <div class="tbar"><label class="small muted">Від кого будувати</label><select class="in" id="tcenter" aria-label="Від кого будувати дерево">${opts}</select>
      <input class="in" id="tq" type="search" placeholder="Знайти в дереві…" value="${esc(f.q || '')}" aria-label="Пошук у дереві">
      <select class="in" id="tsort" aria-label="Порядок братів і сестер"><option value="birth"${f.sort !== 'name' ? ' selected' : ''}>Брати й сестри: за роком</option><option value="name"${f.sort === 'name' ? ' selected' : ''}>за ім'ям</option></select>
      <span class="small muted">${V.size} осіб</span></div>
    <div class="vp all" id="vp" data-mode="all" data-center="${center}"><div class="stage" id="stage" style="width:${L.w}px;height:${L.h}px">${glabels}<svg class="lines" width="${L.w}" height="${L.h}">${lines}</svg>${cards}</div>${vpCtl(true)}</div>
    <p class="small muted" style="margin-top:8px">Тягніть мишкою або пальцем; коліщатко або два пальці — масштаб. Натисніть на людину — відкриється картка. Щоб побачити гілку іншої людини (наприклад, родину Олени), виберіть її у полі «Від кого будувати».</p>`;
}

/* ── Масштаб і переміщення (спільне для обох видів) ── */
function vpMount() {
  const vp = $('#vp'), st = $('#stage'); if (!vp || !st) return;
  const mode = vp.dataset.mode; S.ui.vp ||= {}; const fresh = !S.ui.vp[mode]; const V = S.ui.vp[mode] ||= { s: 1, x: 0, y: 0 };
  const apply = () => { st.style.transform = `translate(${V.x}px,${V.y}px) scale(${V.s})`; mini(); };
  const size = () => mode === 'all' && S.ui.tl ? { w: S.ui.tl.w, h: S.ui.tl.h } : { w: st.scrollWidth || st.offsetWidth, h: st.scrollHeight || st.offsetHeight };
  const fit = () => { const { w, h } = size(); V.s = Math.min(1, Math.max(0.15, Math.min(vp.clientWidth / w, vp.clientHeight / h) * 0.96)); V.x = (vp.clientWidth - w * V.s) / 2; V.y = Math.max(8, (vp.clientHeight - h * V.s) / 2); apply(); };
  const zoomAt = (k, cx, cy) => { const s2 = Math.min(2.5, Math.max(0.12, V.s * k)); V.x = cx - (cx - V.x) * s2 / V.s; V.y = cy - (cy - V.y) * s2 / V.s; V.s = s2; apply(); };
  const center = id => { const el = st.querySelector(`[data-id="${id}"]`) || st.querySelector('.nd.root'); if (!el) return fit(); if (V.s < 0.7) V.s = 0.9; V.x = vp.clientWidth / 2 - (el.offsetLeft + el.offsetWidth / 2) * V.s; V.y = vp.clientHeight / 2 - (el.offsetTop + el.offsetHeight / 2) * V.s; apply(); };
  function mini() { const c = $('#minimap'); if (!c || !S.ui.tl) return; const g = c.getContext('2d'), L = S.ui.tl; const k = Math.min(c.width / L.w, c.height / L.h); g.clearRect(0, 0, c.width, c.height); g.fillStyle = '#B9B2A6';
    Object.values(L.N).forEach(n => g.fillRect(n.x * k, n.y * k, Math.max(1.5, T2.W * k), Math.max(1.5, T2.H * k)));
    g.strokeStyle = '#2C4A6E'; g.lineWidth = 1.5; g.strokeRect(-V.x / V.s * k, -V.y / V.s * k, vp.clientWidth / V.s * k, vp.clientHeight / V.s * k); c._k = k; }
  if (fresh) { if (mode === 'all') { V.s = 0.85; center(vp.dataset.center); } else fit(); } else apply();
  let drag = null, moved = false; const pts = new Map();
  vp.onpointerdown = e => { if (e.target.closest('.vpctl,.minimap')) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); drag = { x: e.clientX, y: e.clientY, vx: V.x, vy: V.y }; moved = false; vp.setPointerCapture?.(e.pointerId); };
  vp.onpointermove = e => { if (!pts.has(e.pointerId)) return; const prev = pts.get(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { const [a, b] = [...pts.values()]; const d1 = Math.hypot(a.x - b.x, a.y - b.y); const o = [...pts.entries()].find(([k]) => k !== e.pointerId)[1]; const d0 = Math.hypot(prev.x - o.x, prev.y - o.y); const r = vp.getBoundingClientRect(); if (d0 > 0) zoomAt(d1 / d0, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); moved = true; return; }
    if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) moved = true; V.x = drag.vx + dx; V.y = drag.vy + dy; apply(); };
  vp.onpointerup = vp.onpointercancel = e => { pts.delete(e.pointerId); if (!pts.size) drag = null; };
  vp.addEventListener('click', e => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
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
    <div class="phead"><div class="portrait">${pu ? `<img src="${pu}" alt="">` : esc((p.n || '?')[0])}</div>
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
    <div class="sec"><h3>Про людину ${canEdit() ? `<button class="btn line small" data-act="edit">Редагувати</button>` : ''}</h3>
      ${p.note ? `<p class="about">${esc(p.note)}</p>` : `<p class="muted">Поки нічого не написано.${canEdit() ? ' Натисніть «Редагувати», щоб додати.' : ''}</p>`}
      ${p.last ? `<div class="lastedit">Остання зміна: ${esc(who(p.last.by))}, ${esc(when(p.last.at))}${isOwner() ? ` · <a href="#" data-act="history">історія змін</a>` : ''}</div>` : ''}
    </div>
    ${(p.src || []).length ? `<div class="sec"><h3>Джерела в архівах</h3><ul class="srcs">${p.src.map(s => `<li><a href="${esc(s.u)}" target="_blank" rel="noopener noreferrer">${esc(s.t)}</a> <span class="muted small">FamilySearch</span></li>`).join('')}</ul></div>` : ''}
    <div class="sec"><h3>Документи ${canEdit() ? `<button class="btn line small" data-act="docform">+ Архівний документ</button>` : ''}</h3>
      ${canEdit() && S.ui.docform ? `<div class="docform"><input class="in" id="dtitle" placeholder="Назва: напр. «Народження Микити Максимовича»"><input class="in" id="ddate" placeholder="Дата, напр. 27.05.1818"><input class="in" id="dsrc" placeholder="Джерело: архів, книга, запис №"><label class="btn line small" style="cursor:pointer">Вибрати скани<input type="file" accept="image/*" multiple data-docup="${p.id}" hidden></label><div class="msg" id="dmsg"></div></div>` : ''}
      ${docs.length ? `<div class="thumbs">${docs.map(docCard).join('')}</div>` : `<p class="muted">Документів поки немає.</p>`}</div>
    <div class="sec"><h3>Фото ${canAdd(p.id) ? `<label class="btn line small" style="cursor:pointer">Додати фото<input type="file" accept="image/*,application/pdf" multiple data-upload="${p.id}" hidden></label>` : ''}</h3>
      <div class="msg" id="upmsg"></div>
      ${photos.length ? `<div class="thumbs">${photos.map(x => `<button class="doc" data-photo="${x.id}"><span class="im">${x.mime === 'application/pdf' ? '<span class="ph" style="width:100%;height:100%">PDF</span>' : `<img src="${img('photo=' + x.id, true)}" alt="" loading="lazy">`}</span><span>${p.portrait === x.id ? '<b style="font-size:12px;color:var(--seal)">Головне фото</b><br>' : ''}${esc(x.caption || '')}</span></button>`).join('')}</div>` : `<p class="muted">Фото ще немає. Додайте портрет, родинне фото чи документ з домашнього архіву.</p>`}
    </div>
    <div class="sec"><h3>Спогади</h3>${storiesHtml(stories)}${canAdd(p.id) ? storyForm(p.id) : noAdd}</div>
  </div></div>`;
}
const storiesHtml = list => list.map(s => `<div class="story"><p>${esc(s.text)}</p><div class="m"><span>${esc(who(s.by))} · ${esc(when(s.at))}</span>${isOwner() || s.by === S.me.id ? `<button data-delstory="${s.id}">видалити</button>` : ''}</div></div>`).join('');
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
const closeLayer = () => { $('#layer').innerHTML = ''; };
function openEdit(p) {
  const sp = SPOUSES[p.id] || [];
  modal(`<h2>${esc(full(p))}</h2>${personForm(p)}
    <div class="sec"><h3>Подружжя</h3><div class="row">${sp.map(s => `<span class="mini">${esc(short(P[s.id]))} <button class="btn line small" data-unlink="${s.u}" title="Прибрати зв'язок">×</button></span>`).join('') || '<span class="muted small">немає</span>'}</div>
      <div class="btns"><select class="in" id="e-sp" style="max-width:320px"><option value="">Додати наявну людину…</option>${Object.values(P).filter(x => x.id !== p.id && !sp.some(s => s.id === x.id)).sort((a, b) => short(a).localeCompare(short(b), 'uk')).map(x => `<option value="${x.id}">${esc(full(x))}</option>`).join('')}</select><input class="in" id="e-spd" placeholder="дата шлюбу" style="max-width:160px"><button class="btn line small" data-act="link-spouse">Додати</button></div></div>
    <div class="btns"><button class="btn" data-act="save">Зберегти</button><button class="btn line" data-act="close">Скасувати</button>${isOwner() && !p.root ? `<button class="btn danger" data-act="delete" style="margin-left:auto">Видалити картку</button>` : ''}<span class="msg" id="emsg"></span></div>`);
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
  return `<div class="lede"><div class="eyebrow">Гілки роду</div><h1>Родини</h1><p>Кожна гілка має своє село та свою історію. Внизу кожної можна дописати спогади: їх побачать усі родичі з доступом.</p></div>
  <div class="chips" style="margin-bottom:24px">${S.data.families.map(f => `<a class="btn line small" href="#/fam/${f.id}">${esc(f.title)}</a>`).join('')}</div>
  <div class="famlist">${S.data.families.map(famBlock).join('')}</div>`;
}
function famBlock(f) {
  return `<article class="fam" id="fam-${f.id}"><div class="sec" style="align-content:start">
    <div><div class="eyebrow">${esc(f.side || '')}</div><h2>${esc(f.title)}</h2><div class="muted small">${esc(f.places || '')}</div></div>
    <div class="famstory">${f.story || ''}</div>
    ${canEdit() ? `<div><button class="btn line small" data-famedit="${f.id}">Редагувати історію</button></div>` : ''}
    <div class="sec"><h3>Спогади про родину</h3>${storiesHtml(S.data.stories.filter(s => s.target === 'fam:' + f.id))}${canAdd('fam:' + f.id) ? storyForm('fam:' + f.id) : ''}</div>
  </div><div>${famMembersHtml(f)}</div></article>`;
}
function vFamily() { const f = FAM[S.arg]; if (!f) return vFamilies(); curTarget = 'fam:' + f.id; return `<p><a href="#/families" class="small">← Усі родини</a></p><div class="famlist">${famBlock(f)}</div>`; }

/* ───── Люди ───── */
function vPeople() {
  const q = (S.ui.q || '').toLowerCase();
  const famT = p => (p.fam || []).map(x => FAM[x]?.title).filter(Boolean).join(', ');
  const list = Object.values(P).filter(p => !q || [full(p), p.m, p.bp, famT(p)].join(' ').toLowerCase().includes(q)).sort((a, b) => (a.s || 'я').localeCompare(b.s || 'я', 'uk') || byBirth(a.id, b.id));
  return `<div class="lede"><div class="eyebrow">Покажчик</div><h1>Усі родичі</h1><p class="small muted">${Object.keys(P).length} людей у дереві</p></div>
  <div class="btns" style="margin-bottom:6px"><input class="in search" id="q" type="search" value="${esc(S.ui.q || '')}" placeholder="Пошук: ім'я, прізвище, село" aria-label="Пошук">${canEdit() ? `<button class="btn line" data-add="new" style="margin-bottom:18px">+ Нова людина</button>` : ''}</div>
  <div class="tablebox"><table class="t"><thead><tr><th>Ім'я</th><th>Роки</th><th>Місце</th><th>Гілка</th></tr></thead><tbody>
  ${list.map(p => `<tr class="click" data-go="${p.id}"><td><b style="font-family:var(--f-display);font-size:15.5px">${esc(full(p))}</b>${p.m && p.m !== p.s ? ` <span class="muted small">з дому ${esc(p.m)}</span>` : ''}${p.hyp ? '<span class="badge">гіпотеза</span>' : ''}</td><td class="mono small">${esc(life(p))}</td><td class="small">${esc(p.bp || '')}</td><td class="small">${esc(famT(p))}</td></tr>`).join('') || `<tr><td colspan="4" class="muted">Нікого не знайдено.</td></tr>`}
  </tbody></table></div>`;
}

/* ───── Документи ───── */
const docCard = d => `<button class="doc" data-doc="${d.id}"><span class="im">${d.pages ? `<img src="${img('doc=' + d.id + '&page=0', true)}" alt="" loading="lazy">` : '<span class="ph" style="width:100%;height:100%">скан ще не додано</span>'}</span><b>${esc(d.title)}</b><span class="mono">${esc(d.date || '')}${d.place ? ' · ' + esc(d.place) : ''}</span></button>`;
function vDocs() {
  const s = [...S.data.documents].sort((a, b) => yearOf(a.date).localeCompare(yearOf(b.date)));
  return `<div class="lede"><div class="eyebrow">Архів</div><h1>Документи</h1><p>Метричні книги Покровської церкви села Вороньки, записи ЗАГС і сімейні документи. Під кожним указано, яка саме строчка стосується нашої родини.</p></div>
  ${canEdit() && s.some(d => !d.pages) ? `<div class="docform" style="max-width:none"><b>Документи без сканів: ${s.filter(d => !d.pages).length}</b><span class="small muted">Виберіть файли, назви яких починаються з коду документа (напр. «fs1834-dvir240.jpg»), — сайт сам розкладе їх по документах.</span><label class="btn line small" style="cursor:pointer;justify-self:start">Вибрати скани<input type="file" accept="image/*" multiple data-docbulk="1" hidden></label><div class="msg" id="dmsg"></div></div>` : ''}
  <div class="docs">${s.filter(d => !d.maybe).map(docCard).join('')}</div>
  ${s.some(d => d.maybe) ? `<h2 class="dbl" style="margin:40px 0 18px">Можлива рідня</h2><div class="docs">${s.filter(d => d.maybe).map(docCard).join('')}</div>` : ''}`;
}
function viewer({ title, pages, line, text, src, people, photoId, docId }) {
  let i = 0;
  const draw = () => {
    $('#layer').innerHTML = `<div class="viewer" role="dialog" aria-modal="true"><div class="vb"><b>${esc(title)}</b>${pages.length > 1 ? `<button data-pg="-1">‹</button><span class="mono">${i + 1} / ${pages.length}</span><button data-pg="1">›</button>` : ''}<button data-zoom>Збільшити</button>${docId && canEdit() ? `<label style="cursor:pointer">+ Сторінка<input type="file" accept="image/*" multiple data-docpage="${docId}" hidden></label>` : ''}${photoId && canEdit() ? `<button data-portrait="${photoId}">Зробити головним</button>` : ''}${photoId ? `<button data-delphoto="${photoId}">Видалити</button>` : ''}<button data-act="close">Закрити</button></div>
      <div class="stage">${pages.length ? `<img src="${pages[i]}" alt="${esc(title)}">` : '<p style="color:#EDE8DF">Скан ще не додано.</p>'}</div>
      <div class="cap">${line ? `<div class="ln">${esc(line)}</div>` : ''}${text ? `<div>${esc(text)}</div>` : ''}${src ? `<div class="src">${esc(src)}</div>` : ''}${people?.length ? `<div>${people.filter(x => P[x]).map(x => `<a href="${href('p', x)}" data-act="close">${esc(short(P[x]))}</a>`).join(' · ')}</div>` : ''}${photoId ? `<div class="btns" style="margin-top:6px"><input class="in" id="cap-in" value="${esc(title === short(P[people?.[0]] || {}) ? '' : title)}" placeholder="Підпис: хто на фото, рік, звідки" style="max-width:520px;background:#26221C;color:#EDE8DF;border-color:#3B352C"><button data-capsave="${photoId}">Зберегти підпис</button></div>` : ''}</div></div>`;
    const cs = $('#layer [data-capsave]'); if (cs) cs.onclick = async () => { try { await api('/api/data', { body: { op: 'photo.caption', id: photoId, caption: $('#cap-in').value } }); const x = S.data.photos.find(y => y.id === photoId); if (x) x.caption = $('#cap-in').value; toast('Підпис збережено'); } catch (err) { toast(errText(err)); } };
    $('#layer [data-zoom]').onclick = z; $('#layer .stage img').onclick = z;
    $('#layer').querySelectorAll('[data-pg]').forEach(b => b.onclick = () => { i = (i + Number(b.dataset.pg) + pages.length) % pages.length; draw(); });
  };
  const z = () => { const st = $('#layer .stage'); st.classList.toggle('z'); $('#layer [data-zoom]').textContent = st.classList.contains('z') ? 'Зменшити' : 'Збільшити'; };
  draw();
}
function openDoc(id) { const d = S.data.documents.find(x => x.id === id); if (!d) return; ev('open', 'doc', 'doc:' + id); viewer({ title: d.title, pages: Array.from({ length: d.pages || 0 }, (_, k) => img(`doc=${d.id}&page=${k}`)), line: d.line ? 'Наша строчка: ' + d.line : '', text: d.text, src: [d.src, d.place].filter(Boolean).join(' · '), people: d.people, docId: d.id }); }
function openPhoto(id) { const x = S.data.photos.find(y => y.id === id); if (!x) return; if (x.mime === 'application/pdf') { window.open(img('photo=' + id), '_blank', 'noopener'); return; } viewer({ title: x.caption || short(P[x.person] || {}), pages: [img('photo=' + id)], text: `Додав(ла): ${who(x.by)}, ${when(x.at)}`, people: [x.person], photoId: (canEdit() || x.by === S.me.id) ? id : null }); }

/* ───── Власнику: аналітика, доступи, історія ───── */
const fmtT = ms => { const m = Math.round((ms || 0) / 60000); return m < 60 ? `${m} хв` : `${Math.floor(m / 60)} год ${m % 60} хв`; };
const delta = (a, b) => { if (!b) return a ? '<em class="up">нове</em>' : '<em class="muted">—</em>'; const d = Math.round((a - b) / b * 100); return `<em class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${d}%</em>`; };
const PERIODS = [['7', '7 днів'], ['30', '30 днів'], ['90', '3 місяці'], ['365', 'Рік'], ['all', 'Весь час']];
function periodRange() { const a = S.admin; if (a.period === 'custom' && a.from) return { from: a.from, to: a.to || new Date().toISOString().slice(0, 10) }; const n = a.period === 'all' ? 3650 : Number(a.period || 30); const to = new Date(); const from = new Date(to - n * 864e5); return { from: from.toISOString(), to: new Date(to.getTime() + 60000).toISOString() }; }
async function loadAdmin() {
  const a = S.admin; a.tab ||= 'stats'; a.period ||= '30';
  try {
    if (a.tab === 'stats') { const { from, to } = periodRange(); a.stats = await api(`/api/admin?a=stats&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`); if (a.member) a.log = await api(`/api/admin?a=log&id=${a.member}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`); }
    if (a.tab === 'access') a.members = await api('/api/admin?a=members');
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
    const views = {}; Object.entries(st.views || {}).forEach(([k, v]) => { const n = viewsName[k] || k; views[n] = (views[n] || 0) + v; });
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
    body = `<div class="sec"><h3>Запросити родича</h3>
      <div class="grid2"><label class="f">Ім'я<input class="in" id="iv-name" placeholder="напр. Тетяна Іванівна"></label><label class="f">Пошта (буде логіном)<input class="in" id="iv-email" type="email" inputmode="email"></label>
      <label class="f">Права<select class="in" id="iv-role"><option value="editor">Редактор — додає й змінює картки</option><option value="viewer">Глядач — лише дивиться і пише спогади</option></select></label>
      <label class="f">Хто це в дереві<select class="in" id="iv-person"><option value="">—</option>${Object.values(P).sort((x, y) => short(x).localeCompare(short(y), 'uk')).map(x => `<option value="${x.id}">${esc(full(x))}</option>`).join('')}</select></label></div>
      <div class="btns"><button class="btn" data-act="invite">Створити запрошення</button><span class="msg" id="ivmsg"></span></div>
      <div id="ivlink"></div>
      <p class="small muted">Посилання одноразове і діє 7 днів. Надішліть його особисто (Viber, Telegram). Родич відкриває його, вигадує пароль і далі входить з поштою та паролем.</p></div>
      <div class="sec" style="margin-top:26px"><h3>Учасники</h3><div class="tablebox"><table class="t"><thead><tr><th>Хто</th><th>Права</th><th>Пристроїв</th><th>Востаннє</th><th></th></tr></thead><tbody>
      ${m.members.map(x => `<tr><td><b>${esc(x.name || '—')}</b><br><span class="small muted">${esc(x.email)}</span>${!x.active ? ' <span class="badge">вимкнено</span>' : ''}</td>
        <td>${x.id === S.me.id ? 'власник' : `<select class="in" data-role="${x.id}" style="width:auto;font-size:14px"><option value="editor"${x.role === 'editor' ? ' selected' : ''}>редактор</option><option value="viewer"${x.role === 'viewer' ? ' selected' : ''}>глядач</option><option value="owner"${x.role === 'owner' ? ' selected' : ''}>власник</option></select>`}</td>
        <td class="num" title="${esc(x.sessions.devices.map(d => d.ua).join('\n'))}">${x.sessions.n}</td><td class="num small">${esc(when(x.sessions.last))}</td>
        <td>${x.id === S.me.id ? '' : `<div class="btns"><button class="btn line small" data-reset="${x.id}">Новий пароль</button><button class="btn line small" data-revoke="${x.id}">Вийти з усіх пристроїв</button><button class="btn ${x.active ? 'danger' : 'line'} small" data-active="${x.id}" data-v="${!x.active}">${x.active ? 'Вимкнути доступ' : 'Увімкнути'}</button></div>`}</td></tr>`).join('')}
      </tbody></table></div></div>
      ${m.invites.length ? `<div class="sec" style="margin-top:26px"><h3>Очікують</h3>${m.invites.map(i => `<div class="small">${esc(i.name || i.email)} · ${esc(i.email)} · ${i.purpose === 'reset' ? 'новий пароль' : 'запрошення'} · діє до ${esc(when(i.expires_at))}</div>`).join('')}</div>` : ''}`;
  } else if (a.tab === 'history' && a.revs) {
    body = `<p class="small muted">Усі зміни в дереві. Будь-яку можна відкотити: попередній стан повернеться, а сам відкат теж запишеться в історію.</p>${revList(a.revs.revisions)}`;
  }
  return `<div class="lede"><div class="eyebrow">Лише для вас</div><h1>Панель власника</h1></div>${tabs}${body}`;
}
const ENT = { person: 'Картка', union: 'Подружжя', family: 'Родина', story: 'Спогад', photo: 'Фото', member: 'Доступ', seed: 'Імпорт' };
const ACT = { create: 'створено', update: 'змінено', delete: 'видалено', restore: 'відкат', invite: 'запрошення', reset: 'новий пароль' };
const FIELD = { n: "ім'я", pt: 'по батькові', s: 'прізвище', m: 'дівоче', b: 'народження', d: 'смерть', bp: 'місце народження', dp: 'місце смерті', note: 'опис', f: 'батько', mo: 'мати', sex: 'стать', hyp: 'гіпотеза', fam: 'гілки', portrait: 'головне фото', story: 'історія', text: 'текст', caption: 'підпис' };
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
function gate(inner) { return `<div class="gate"><div class="card"><h1>Рід Шутих</h1><div class="sub">Родинний архів · закритий доступ</div><div class="orn">◆ ◆ ◆</div>${inner}</div></div>`; }
function vLogin() { return gate(`<form id="login" class="sec"><label class="f">Пошта<input class="in" id="lg-e" type="email" inputmode="email" autocomplete="username" required></label><label class="f">Пароль<input class="in" id="lg-p" type="password" autocomplete="current-password" required></label><button class="btn" type="submit">Увійти</button><div class="msg" id="lg-m"></div></form><p class="small muted" style="text-align:center;margin:0">Доступ лише за запрошенням. Забули пароль — напишіть Максиму.</p>`); }
function vInvite(inv) { return gate(`<form id="accept" class="sec"><p style="margin:0">${inv.purpose === 'reset' ? 'Задайте новий пароль' : 'Вас запросили до родинного архіву.'}</p><label class="f">Пошта<input class="in" value="${esc(inv.email)}" disabled></label><label class="f">Як вас підписувати<input class="in" id="ac-n" value="${esc(inv.name || '')}" required></label><label class="f">Придумайте пароль (від 8 символів)<input class="in" id="ac-p" type="password" autocomplete="new-password" minlength="8" required></label><button class="btn" type="submit">${inv.purpose === 'reset' ? 'Зберегти пароль' : 'Увійти до архіву'}</button><div class="msg" id="ac-m"></div></form>`); }
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
  const V = { tree: vTree, p: vPerson, families: vFamilies, fam: vFamily, people: vPeople, docs: vDocs, admin: vAdmin }[S.view] || vTree;
  const sy = window.scrollY;
  app.innerHTML = top() + `<main class="wrap">${V()}</main>`;
  if (S.ui.keepScroll) { window.scrollTo(0, sy); S.ui.keepScroll = false; }
  if (S.view === 'tree') requestAnimationFrame(vpMount);
  if (S.view === 'fam' && S.arg) {} // окрема сторінка родини
  const key = S.view + ':' + (S.arg || '');
  if (S.ui.lastView !== key) { S.ui.lastView = key; ev('view', S.view, curTarget); if (curTarget) ev('open', S.view, curTarget); }
  if (S.view === 'admin' && isOwner() && !S.admin.loading && !S.admin[{ stats: 'stats', access: 'members', history: 'revs' }[S.admin.tab || 'stats']]) { S.admin.loading = true; loadAdmin().finally(() => { S.admin.loading = false; }); }
}

/* ───── Події ───── */
document.addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target;
  try {
    if (f.id === 'login') { $('#lg-m').textContent = 'Перевіряю…'; const r = await api('/api/auth?a=login', { body: { email: $('#lg-e').value, password: $('#lg-p').value }, noRedirect: true }); S.me = r.member; await load(); render(); }
    if (f.id === 'accept') { const t = new URLSearchParams(location.search).get('invite'); const r = await api('/api/auth?a=accept', { body: { t, name: $('#ac-n').value, password: $('#ac-p').value }, noRedirect: true }); history.replaceState(null, '', '/'); S.gate = null; S.me = r.member; await load(); render(); }
    if (f.id === 'setup') { await api('/api/setup?a=init', { body: { token: $('#su-t').value, name: $('#su-n').value, email: $('#su-e').value, password: $('#su-p').value }, noRedirect: true }); S.gate = null; await start(); }
  } catch (err) { const m = f.querySelector('.msg'); if (m) { m.textContent = errText(err); m.className = 'msg err'; } }
});
document.addEventListener('input', e => {
  if (e.target.id === 'q') { S.ui.q = e.target.value; const pos = e.target.selectionStart; render(); const q = $('#q'); q.focus(); q.setSelectionRange(pos, pos); }
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (['tcenter', 'tsort'].includes(t.id)) { S.ui.tf ||= {}; if (t.id === 'tcenter') S.ui.tf.center = t.value; if (t.id === 'tsort') S.ui.tf.sort = t.value; delete S.ui.vp?.all; render(); return; }
  if (t.id === 'tq') { S.ui.tf ||= {}; S.ui.tf.q = t.value; const q = t.value.trim().toLowerCase(); const hit = q && Object.keys(S.ui.tl?.N || P).find(id => full(P[id]).toLowerCase().includes(q)); if (hit) S.ui.findId = hit; render(); setTimeout(() => $('#tq')?.focus(), 0); return; }
  if (t.dataset.upload) return upload(t.dataset.upload, [...t.files]);
  if (t.dataset.docup) return uploadDoc(t.dataset.docup, [...t.files]);
  if (t.dataset.docbulk) return uploadBulk([...t.files]);
  if (t.dataset.docpage) return uploadPages(t.dataset.docpage, [...t.files]);
  if (t.dataset.role) { try { await api('/api/admin?a=member', { body: { id: t.dataset.role, role: t.value } }); toast('Права змінено'); } catch (err) { toast(errText(err)); } }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#layer').innerHTML) closeLayer(); });
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-tmode],[data-act],[data-add],[data-doc],[data-photo],[data-story],[data-delstory],[data-unlink],[data-portrait],[data-delphoto],[data-famedit],[data-go],[data-atab],[data-per],[data-member],[data-k],[data-revert],[data-reset],[data-revoke],[data-active],[data-close-scrim],[data-pg],[data-zoom]');
  if (!t) return;
  if (t.hasAttribute('data-close-scrim')) { if (e.target === t) closeLayer(); return; }
  const d = t.dataset;
  try {
    if (d.tmode) { S.ui.tmode = d.tmode; delete S.ui.vp?.[d.tmode]; render(); return; }
    if (d.go) { location.hash = href('p', d.go); return; }
    if (d.doc) return openDoc(d.doc);
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
    if (act === 'close') { closeLayer(); return; }
    if (act === 'logout') { await api('/api/auth?a=logout', { body: {} }).catch(() => {}); S.me = null; S.data = null; render(); return; }
    if (act === 'docform') { S.ui.docform = !S.ui.docform; S.ui.keepScroll = true; render(); setTimeout(() => $('#dtitle')?.focus(), 30); return; }
    if (act === 'edit') return openEdit(P[S.arg]);
    if (act === 'history') { e.preventDefault(); const r = await api(`/api/admin?a=revisions&entity=person&id=${encodeURIComponent(S.arg)}`); modal(`<h2>Історія змін</h2>${revList(r.revisions)}<div class="btns"><button class="btn line" data-act="close">Закрити</button></div>`); return; }
    if (act === 'save' || act === 'create') {
      const data = readForm(); const m = $('#emsg'); m.textContent = 'Зберігаю…'; m.className = 'msg';
      const cur = act === 'save' ? P[S.ui.editing] : null;
      const body = cur ? { op: 'person.save', id: cur.id, v: cur.v, data: { ...data, ...(cur.portrait ? { portrait: cur.portrait } : {}) } } : { op: 'person.save', data, link: S.ui.adding?.link || {} };
      const r = await api('/api/data', { body });
      await load(); closeLayer(); toast(cur ? 'Збережено' : 'Картку створено');
      location.hash = href('p', r.person.id); render(); return;
    }
    if (act === 'link-spouse') { const b = $('#e-sp').value; if (!b) return; const r = await api('/api/data', { body: { op: 'union.add', a: S.ui.editing, b, date: $('#e-spd').value } }); S.data.unions.push(r.union); index(); openEdit(P[S.ui.editing]); return; }
    if (act === 'delete') { if (t.dataset.armed !== '1') { t.dataset.armed = '1'; t.textContent = 'Точно видалити? Натисніть ще раз'; return; } await api('/api/data', { body: { op: 'person.delete', id: S.ui.editing } }); closeLayer(); await load(); location.hash = '#/people'; return; }
    if (act === 'famsave') { const story = textToHtml($('#fe').value); await api('/api/data', { body: { op: 'family.story', id: S.ui.famEditing, story } }); FAM[S.ui.famEditing].story = story; closeLayer(); S.ui.keepScroll = true; render(); toast('Збережено'); return; }
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
  try { const st = await api('/api/setup?a=status', { noRedirect: true }); if (!st.initialized) { S.gate = vSetup; return render(); } } catch {}
  try { const r = await api('/api/auth?a=me', { noRedirect: true }); S.me = r.member; } catch { S.me = null; }
  if (S.me) { render(); await load(); }
  render();
}
start();
})();
