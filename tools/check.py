#!/usr/bin/env python3
"""Перевірка узгодженості родоводу (seed.json + manifest.json).

Запуск: python3 tools/check.py        — друкує всі знахідки, код виходу 1, якщо є ПОМИЛКИ.
Перед кожним комітом змін у seed/import/manifest.json — запускати; помилок має бути 0.

Перевіряє кожну людину з усіх боків (людина в центрі, а не документ):
  1. дати: смерть раніше народження; вік батьків при народженні дитини; дитина після смерті матері / >1 р. після смерті батька;
  2. ступені спорідненості (прадід, прапрабабуся…) у всіх текстах — рахуються від Максима за деревом;
  3. кожна згадка [[p:id|…]] з датою чи роками поруч (Історія роду, Припущення, Історія сіл, описи документів, картки) — проти полів картки;
  4. вік «у 1823 р. — 62 роки» в описі картки — проти року народження;
  5. діти, перелічені в описі батьків «Ім'я (дд.мм.рррр)», — проти карток дітей;
  6. посилання [[p:]] / [[d:]] на неіснуючі картки й документи (крім p_… — їх створено на сайті);
  8. тлумачення замість фактів: «отже / це точно / найімовірніше / доводить…» без «Є припущення» — ПОМИЛКА;
     «тобто / підтверджує» — УВАГА; спорідненість з дерева («брат», «дядько»…) у РЯДКУ документа — ПОМИЛКА.
  9. дерево: у дитини вказано і батька, і матір, а шлюбу (union) між ними немає — ПОМИЛКА (інакше дерево показує дитину
     лише під одним із батьків, а братів і сестер — окремо); шлюб із неіснуючою карткою — ПОМИЛКА.
     Свідомі винятки — UNION_OK нижче, з причиною.
ПОМИЛКА — точна суперечність; УВАГА — варто подивитись очима.
"""
import json, re, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
seed = json.load(open(os.path.join(ROOT, 'seed/seed.json')))
it = json.load(open(os.path.join(ROOT, 'seed/import/manifest.json')))

# ---------- зібрати поточний стан ----------
P = {p['id']: dict(p) for p in seed['persons']}
for x in it:
    if x.get('kind') == 'person':
        P[x['id']] = dict(x['data'], id=x['id'])
for x in it:
    if x.get('kind') == 'personpatch':
        p = P.setdefault(x['person'], {'id': x['person']})
        p.update(x.get('set') or {})
        for k in x.get('unset') or []: p.pop(k, None)
        for a, b in x.get('replace') or []: p['note'] = (p.get('note') or '').replace(a, b)
        if x.get('append') and x['append'] not in (p.get('note') or ''): p['note'] = ((p.get('note') or '') + ' ' + x['append']).strip()
for x in it:  # kind merge: картки-дублі (drop) зведено в keep на сайті
    if x.get('kind') == 'merge':
        for d in x.get('drop') or []: P.pop(d, None)
D = {d['id']: dict(d) for d in seed['documents']}
for x in it:
    if x.get('kind') in ('doc', 'map'):
        D[x['id']] = {**D.get(x['id'], {}), **x['data'], 'id': x['id']}
    if x.get('kind') == 'docpatch' and x['id'] in D:
        D[x['id']].update(x['data'])
T = {}
for x in it:
    if x.get('kind') == 'text': T[x['id']] = x['value']

# --live <файл>: перевірити дані з самого сайту (вивантаження /api/data + тексти) замість репозиторію
if '--live' in sys.argv:
    L = json.load(open(sys.argv[sys.argv.index('--live') + 1]))
    P = {p['id']: {k: v for k, v in p.items() if v not in ('', None)} for p in L['persons'] if not p.get('deleted')}
    D = {d['id']: d for d in L['documents']}
    T = {k: v['text'] for k, v in L['texts'].items()}
    seed = {'unions': L.get('unions', [])}

MON = {'січня': 1, 'лютого': 2, 'березня': 3, 'квітня': 4, 'травня': 5, 'червня': 6, 'липня': 7, 'серпня': 8, 'вересня': 9, 'жовтня': 10, 'листопада': 11, 'грудня': 12}
def yrs(v): return [int(y) for y in re.findall(r'(?<!\d)(1[5-9]\d\d|20[0-4]\d)(?!\d)', str(v or ''))]
def yr(v):
    y = yrs(v); return y[0] if y else None
def rng(v):  # (min,max) років із поля «~1745–1761», «1803», «~1786–1790»
    y = yrs(v)
    if not y: return None
    lo, hi = min(y), max(y)
    if '~' in str(v) or 'бл' in str(v): lo, hi = lo - 2, hi + 2
    return lo, hi
def approx(v): return '~' in str(v or '') or len(yrs(v)) > 1
def nm(p): return f"{p.get('n','?')} {p.get('pt') or ''} {p.get('s') or ''}".replace('  ', ' ').strip() + f" [{p['id']}]"

ERR, WARN = [], []
def err(*a): ERR.append(' | '.join(map(str, a)))
def warn(*a): WARN.append(' | '.join(map(str, a)))

# ---------- 1. дати ----------
for p in P.values():
    b, d = rng(p.get('b')), rng(p.get('d'))
    if b and d and d[1] < b[0]: err('смерть раніше народження', nm(p), p.get('b'), p.get('d'))
    for r in ('f', 'mo'):
        q = P.get(p.get(r))
        if not q or not b: continue
        qb, qd = rng(q.get('b')), rng(q.get('d'))
        if qb:
            lo, hi = b[0] - qb[1], b[1] - qb[0]   # можливий вік батька/матері
            if hi < 15: err('батькові/матері менше 15 при народженні', nm(p), p.get('b'), nm(q), q.get('b'))
            elif r == 'mo' and lo > 50: err('матері понад 50 при народженні', nm(p), p.get('b'), nm(q), q.get('b'))
            elif r == 'f' and lo > 75: err('батькові понад 75 при народженні', nm(p), p.get('b'), nm(q), q.get('b'))
            elif r == 'mo' and hi > 47 and not approx(q.get('b')): warn('матері 48–50 при народженні', nm(p), p.get('b'), nm(q), q.get('b'))
        if qd and b[0] > qd[1] + (1 if r == 'f' else 0): err('народився після смерті ' + ('батька' if r == 'f' else 'матері'), nm(p), p.get('b'), nm(q), q.get('d'))

# ---------- 2. ступені спорідненості ----------
depth = {}
def up(i, dp):
    for r in ('f', 'mo'):
        q = (P.get(i) or {}).get(r)
        if q and (q not in depth or depth[q] > dp + 1): depth[q] = dp + 1; up(q, dp + 1)
up('maksym', 0)
def want(n): return {1: 'батько/мати', 2: 'дід/бабуся', 3: 'прадід/прабабуся'}.get(n) or ('пра' * (n - 2) + 'дід/' + 'пра' * (n - 2) + 'бабуся')
def texts():
    if 'history' in T: yield 'Історія роду', T['history'].get('md', '')
    for k, v in T.items():
        if k != 'history': yield 'текст ' + k, json.dumps(v, ensure_ascii=False)
    for d in D.values(): yield 'документ ' + d['id'], ' '.join(str(d.get(k) or '') for k in ('title', 'line', 'text'))
    for p in P.values(): yield 'картка ' + p['id'], p.get('note') or ''
KW = r'((?:пра)*(?:прадід|прабабус|прабабц)\w*)'
for src, t in texts():
    for m in re.finditer(KW + r'(?:\s+Максима)?[^.\n\[]{0,25}\[\[p:([a-z0-9_]+)', t):
        w, pid = m.group(1), m.group(2)
        n = w.count('пра') + 2
        if pid in depth and depth[pid] != n: err('ступінь спорідненості', src, f'«{w}» для {nm(P[pid])}', 'має бути: ' + want(depth[pid]))
    # «прадід Пелагії» / «прабабуся Настя»: або названа людина — предок Максима на цьому рівні,
    # або сам предмет тексту (картка, люди документа, люди з того ж речення) на стільки поколінь вищий за названу людину
    for m in re.finditer(KW + r'\s+(?:Максима\s+)?([А-ЯІЄЇ][а-яіїє\']+)(?:\s+([А-ЯІЄЇ][а-яіїє\']+(?:вич|вна|вни|вною|ович|овича|ївни|івни|ича|ич)\w*))?', t):
        w, name, ptn = m.group(1), m.group(2), m.group(3)
        if name in ('Максима', 'Максим') or re.search(r"(п'ятий|шостий|сьомий|восьмий)\s*$", t[max(0, m.start()-12):m.start()]): continue
        n = w.count('пра') + 2
        cands = [q for q in depth if any(x.startswith(name[:4]) for x in re.findall(r"[А-ЯІЄЇ][а-яіїє']+", (P.get(q) or {}).get('n') or ''))
                 and (not ptn or ((P.get(q) or {}).get('pt') or '')[:4] == ptn[:4])]
        if not cands or any(depth[q] == n for q in cands): continue
        st = max(t.rfind('.', 0, m.start()), t.rfind('\n', 0, m.start()))
        en = min([x for x in (t.find('.', m.end()), t.find('\n', m.end())) if x > 0] or [len(t)])
        subj = set(re.findall(r'\[\[p:([a-z0-9_]+)', t[st:en]))
        if src.startswith('картка '): subj.add(src.split()[1])
        if src.startswith('документ '): subj |= set(D[src.split()[1]].get('people') or [])
        if any(sj in depth and depth[sj] - depth[q] == n for sj in subj for q in cands): continue
        head = t[st+1:m.start()].split(' — ')[0]
        known = any(re.search(r'\b' + re.escape(((P.get(sj) or {}).get('n') or '?').split()[0][:4]), head) for sj in subj)
        (err if known or not head.strip() else warn)('ступінь спорідненості (за ім\'ям)', src, f'«{t[st+1:en].strip()[:140]}»', f'«{w} {name}»: у дереві ' + ', '.join(f"{nm(P.get(q) or {'id': q})} — {want(depth[q])} Максима" for q in cands))
    if src.startswith('картка '):
        pid = src.split()[1]
        for m in re.finditer(r'^[^.]{0,60}?' + KW + r'\s+(?:Максима|по\s)', t):
            n = m.group(1).count('пра') + 2
            if pid in depth and depth[pid] != n: err('ступінь спорідненості', src, f'«{m.group(1)}»', 'має бути: ' + want(depth[pid]))

# ---------- 3. згадки з датами ----------
DATE = r'(\d{1,2})\.(\d{1,2})\.(\d{4})'
for src, t in texts():
    for m in re.finditer(r'\[\[p:([a-z0-9_]+)\|[^\]]*\]\]\s*\(\s*(?:нар\.\s*|бл\.\s*)?([^)]{4,40})\)', t):
        pid, inner = m.group(1), m.group(2)
        p = P.get(pid)
        if not p or not re.match(r'[~\d]', inner.strip()): continue
        parts = re.split(r'\s*[–—]\s*', inner)
        if re.match(r'\s*(~|бл)', m.group(0).split('(',1)[1]) and len(parts) == 2 and all(re.fullmatch(r'\D*\d{4}', x.strip()) for x in parts):
            parts = [inner]  # «бл. 1965–1970» — проміжок року народження, а не роки життя
        for val, f in zip(parts[:2], ('b', 'd')):
            ys = yrs(val)
            if not ys: continue
            cr = rng(p.get(f))
            if not cr:
                warn('у тексті є рік, у картці порожньо', src, nm(p), f, val); continue
            y = ys[0]
            if not (cr[0] - (2 if 'бл' in val or '~' in val else 0) <= y <= cr[1] + (2 if 'бл' in val or '~' in val else 0)):
                err('дата в тексті ≠ картка', src, nm(p), f'{f}: текст «{val}», картка «{p.get(f)}»')
            dm = re.search(DATE, val); dc = re.search(DATE, str(p.get(f) or ''))
            if dm and dc and tuple(map(int, dm.groups())) != tuple(map(int, dc.groups())):
                err('дата в тексті ≠ картка', src, nm(p), f'{f}: текст «{val}», картка «{p.get(f)}»')

# ---------- 4. вік у власному описі ----------
for p in P.values():
    b = rng(p.get('b'))
    if not b: continue
    for m in re.finditer(r'(?:у|в)\s+(1[6-9]\d\d)\s*р\.?\s*(?:—|-|–)\s*(\d{1,3})\s*(?:років|роки|рік|р\.)', p.get('note') or ''):
        y, a = int(m.group(1)), int(m.group(2))
        if not (b[0] - 3 <= y - a <= b[1] + 3): err('вік в описі ≠ рік народження', nm(p), f'«{m.group(0)}»', 'картка b=' + str(p.get('b')))

# ---------- 5. діти в описі батьків ----------
kids = {}
for p in P.values():
    for r in ('f', 'mo'):
        if p.get(r): kids.setdefault(p[r], []).append(p)
def dmy(s):
    m = re.search(DATE, str(s or '')); return tuple(map(int, m.groups())) if m else None
for p in P.values():
    for m in re.finditer(r'([А-ЯІЄЇ][а-яіїє\']+)\s*\((\d{1,2}\.\d{1,2}\.\d{4})', p.get('note') or ''):
        same = [k for k in kids.get(p['id'], []) if (k.get('n') or '').startswith(m.group(1)[:4])]
        if same and not any(dmy(k.get('b')) == dmy(m.group(2)) or dmy(k.get('d')) == dmy(m.group(2)) for k in same):
            warn('дитина в описі ≠ картка дитини', nm(p), f'{m.group(1)} {m.group(2)}', [(k['id'], k.get('b')) for k in same])

# ---------- 6. посилання ----------
for src, t in texts():
    for k, i in re.findall(r'\[\[(p|d):([^|\]]+)', t):
        if k == 'p' and i not in P and not i.startswith('p_'): err('посилання на неіснуючу картку', src, i)
        if k == 'd' and i not in D and not re.match(r'^(fs|d)\d', i): warn('посилання на документ, якого немає в репозиторії', src, i)

# ---------- 7. текст описів: повтори речень, «..», обірвані дати, російські по батькові ----------
for p in P.values():
    n = p.get('note') or ''
    sents = [x.strip() for x in re.split(r'(?<=[.!?])\s+', n) if len(x.strip()) > 25]
    seen = set()
    for x in sents:
        k = re.sub(r'\W+', ' ', x.lower())
        if k in seen: err('повтор речення в описі', nm(p), x[:90])
        seen.add(k)
    if re.search(r'[а-яі]\.\.(?!\.)', n): err('дві крапки', nm(p), re.search(r'.{0,30}[а-яі]\.\.(?!\.)', n).group(0))
    if re.search(r'Народи(вся|лася|всяла) \d{1,2}\.\s*$|Народивсяла', n): err('обірвана або зіпсована фраза', nm(p))
    if re.search(r', [А-ЯІЄЇ] [а-яіїє]', n): warn('велика літера посеред речення?', nm(p), re.search(r'.{0,25}, [А-ЯІЄЇ] [а-яіїє].{0,15}', n).group(0))
    for f in ('pt', 'n'):
        if re.search(r'(Кузьмич|Фомич|Ильич|Лукич)\b', str(p.get(f) or '')): err('російська форма по батькові', nm(p), p.get(f))
    if p.get('n') and re.search(r'\d', str(p.get('n'))): err('цифри в імені', nm(p), p.get('n'))
VMAP = {'Веприк': 'Веприк', 'Вороньки': 'Вороньки', 'Озеряни': 'Озеряни', 'Озерян': 'Озеряни'}
for d in D.values():  # місце документа ↔ село з назви метричної книги в джерелі
    mm = re.search(r'(?:церкви|книга)[^,(]*?с\.\s*([А-ЯІЇЄ][а-яіїє]+)', str(d.get('src') or ''))
    pl = str(d.get('place') or '')
    if mm and mm.group(1) in VMAP and pl in VMAP.values() and VMAP[mm.group(1)] != pl:
        warn('місце документа ≠ село в джерелі', d['id'], pl, '≠', VMAP[mm.group(1)])
for d in D.values():
    t = ' '.join(str(d.get(k) or '') for k in ('title', 'text'))
    if re.search(r'Народи(вся|лася) \d{1,2}\.(\s|$)|Народивсяла', t): err('обірвана фраза в документі', d['id'])
    if re.search(r'\b(Кузьмич|Фомич)\b', t): warn('російська форма по батькові в документі', d['id'])

# --- 8. Тлумачення замість фактів (правило власника 15.10: писати як є в джерелі; висновок — лише з «Є припущення … на підставі …»)
OKMARK = re.compile(r'припущення|за нашим деревом|за словами|за родинними|за записами|за покажчиком|можливо|якщо|імовірно|ймовірно,? (це|той|та)|нечітк|непевн|не напевно|може бути|не доведено|не підтвердил', re.I)
HARD = re.compile(r'\b(отже|тож це|це точно|точно він|точно вона|доводить|доведено|вочевидь|найімовірніше|найпевніше|напевно|безумовно|без сумніву|тепер ясно|це вже не припущення)\b', re.I)
SOFT = re.compile(r'\b(тобто|це підтверджує|підтверджує, що|так підтверджено|видно, що|це видно)\b', re.I)
def interp(src, s):
    for x in re.split(r'(?<=[.!?])\s+', s or ''):
        if re.search(r'\b[Мм]ожливо,? (це|той самий|та сама|друга|його|її)\b', x) and 'припущен' not in x:
            warn('ототожнення «можливо, це …» — писати «Є припущення … на підставі …»', src, x.strip()[:140])
        if re.search(r'\b([ІіЙй]мовірно|[Мм]абуть|[Оо]чевидно|[Вв]ірогідно)\b', x) and 'припущен' not in x:
            warn('«імовірно/мабуть» без «Є припущення … на підставі …»', src, x.strip()[:140])
        if OKMARK.search(x): continue
        if (re.search(r'\b(отже|тобто),?\s+(нар|бл|близько|приблизно)', x, re.I) or re.search(r'\b(отже|тобто)\b.{0,80}народи\w+ (близько|приблизно)', x, re.I)) and not re.search(r'\b(син|дочка|брат|сестра|батьки|батько|мати|той самий|та сама)\b', x): continue
        if HARD.search(x): err('висновок без «Є припущення»', src, x.strip()[:140])
        elif SOFT.search(x) and not re.search(r'тобто\s+(нар|бл|\d)', x): warn('можливий висновок без позначки', src, x.strip()[:140])
for p in P.values(): interp(nm(p), p.get('note'))
for d in D.values():
    interp('док. ' + d['id'], d.get('text')); interp('док. ' + d['id'] + ' (рядок)', d.get('line'))
    ln = re.sub(r'«[^»]*»', '', str(d.get('line') or ''))  # у РЯДКУ — лише те, що в документі; спорідненість з дерева сюди не писати
    if re.search(r'\((рідн\w+ )?(брат|сестра|дядько|тітка|тесть|теща)\b[^)]*\)', ln): err('спорідненість з дерева в рядку документа', d['id'], re.search(r'\([^)]*(брат|сестра|дядько|тітка|тесть|теща)[^)]*\)', ln).group(0)[:80])
for k, t in T.items():
    if isinstance(t, dict) and 'md' in t: interp('Історія роду', t['md'])

# ---------- 9. дерево: батьки дитини мають бути подружжям ----------
UNION_OK = {  # пари батьків без шлюбу, свідомо (причина)
    frozenset(['davyd', 'feodora_lev']): 'батько Пархома — Є припущення, шлюбу не знайдено',
}
U = set()
for u in seed.get('unions', []): U.add(frozenset([u['a'], u['b']]))
if '--live' not in sys.argv:
    for x in it:
        if x.get('kind') == 'person' and x.get('spouseOf'): U.add(frozenset([x['spouseOf'], x['id']]))
        if x.get('kind') == 'unionpatch':
            k = frozenset([x['a'], x['b']])
            if x.get('del'): U.discard(k)
            elif x.get('add'): U.add(k)
for k in U:
    for i in k:
        if i not in P and not i.startswith('p_'): err('шлюб із неіснуючою карткою', i, sorted(k))  # p_… створено на сайті
seenU = set()
for p in P.values():
    f, mo = p.get('f'), p.get('mo')
    if f and mo and f in P and mo in P:
        k = frozenset([f, mo])
        if '--live' not in sys.argv and (f.startswith('p_') or mo.startswith('p_')): continue  # шлюби карток, створених на сайті, є лише в живих даних (--live)
        if k not in U and k not in UNION_OK and k not in seenU:
            seenU.add(k); err('батьки дитини не пов\'язані шлюбом (дерево розірве родину)', nm(p), nm(P[f]), nm(P[mo]))

# ---------- 10. вік на вінчанні за точною датою народження (16.10: Гордій 1779 → вінчання 1794) ----------
def dmy(v):
    m = re.fullmatch(r'\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*', str(v or ''))
    return (int(m.group(3)), int(m.group(2)), int(m.group(1))) if m else None
for d in D.values():
    dd = d.get('data', d); t = str(dd.get('title') or '')
    if not t.startswith('Вінчання'): continue
    wd = dmy(dd.get('date')) or ((yr(dd.get('date')), 6, 30) if yr(dd.get('date')) else None)
    if not wd: continue
    for pid in dd.get('people') or []:
        p = P.get(pid); b = dmy(p.get('b')) if p else None
        if not b: continue
        age = wd[0] - b[0] - ((wd[1], wd[2]) < (b[1], b[2]))
        if 0 <= age < 16 and not re.search(r'років \d+ місяц|менше 15|лише 1[0-5] рок', p.get('note') or ''):
            warn('вік на вінчанні менше 16 — перевірити ототожнення з метрикою (і написати про це в описі)', nm(p), d.get('id'), f'{age} р.')

# ---------- 11. документ, прив'язаний лише через припущення, має про це казати (16.10, рецензент) ----------
for d in D.values():
    dd = d.get('data', d); ppl = dd.get('people') or []
    if not ppl: continue
    p = P.get(ppl[0])
    if not p or not p.get('hyp'): continue
    if not re.match(r'(Народження|Вінчання|Смерть)', str(dd.get('title') or '')): continue
    txt = ' '.join(str(dd.get(k) or '') for k in ('text', 'line'))
    sents = [x for x in re.split(r'(?<=[.!?])\s+(?=[А-ЯІЇЄҐ])', p.get('note') or '') if f"d:{d.get('id')}|" in x]
    if 'припущ' not in txt.lower() and any('припущ' in x.lower() for x in sents):
        warn('документ прив’язано до людини з позначкою hyp — в описі документа немає «Є припущення»', d.get('id'), nm(p))

print(f'Людей: {len(P)}, документів: {len(D)}')
print(f'\nПОМИЛКИ ({len(ERR)}):'); [print(' -', e) for e in ERR]
print(f'\nУВАГА ({len(WARN)}):'); [print(' -', w) for w in WARN]
sys.exit(1 if ERR else 0)
