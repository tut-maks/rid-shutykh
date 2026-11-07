"""Збирає дані для «Карти дворів» (#/dvory) з бази: Рум'янцевський опис 1767 (Вороньки, Веприк) і перепис 1782 (Вороньки).
Вихід: facts/dvory/dvory.json — {village: {year: [household,...]}}; сайт віддає його через /api/data?dvory=1 (лише з сесією).
Порядок дворів — як у книзі (номер двору / кадр); вуличний список Веприка 1767 (facts/rum1767_streets/veprik_streets_1767.csv),
якщо є, задає вулицю й бік. Розташування на карті — умовне."""
import csv, json, re, os
from collections import OrderedDict

R = '/home/claude/rid-shutykh/'
OURS = ['Шут', 'Семен', 'Галай', 'Галаєн', 'Левченк', 'Вдовин', 'Удовин', 'Красновид', 'Янок', 'Перчет', 'Батечк', 'Горов', 'Лавринен', 'Турчин', 'Половець', 'Половц', 'Дривинськ', 'Гусак']
OURS_EXCL = ['Семенен', 'Семенов']

def ours(s):
    s = s or ''
    return any(s.startswith(o) for o in OURS) and not any(s.startswith(x) for x in OURS_EXCL)

LIVE = [('koni', r'кон(?:ей|і|я|ь)\D{0,12}?(\d+)(?:\s*\+\s*(\d+))?', 'коней'), ('voly', r'вол(?:ів|и|а)\D{0,10}?(\d+)', 'волів'),
        ('korovy', r'коров(?:а|и|)\D{0,10}?(\d+)|(\d+)\s*коров', 'корів'), ('korovy2', r'корів\D{0,10}?(\d+)', 'корів'),
        ('vivci', r'овець\D{0,6}?(\d+)|овец\D{0,6}?(\d+)|вівц\w*\D{0,6}?(\d+)', 'овець'), ('svyni', r'свин(?:ей|і|я|ь)\D{0,6}?(\d+)', 'свиней'),
        ('kozy', r'кіз\D{0,6}?(\d+)|кози\D{0,6}?(\d+)', 'кіз'), ('vulyky', r'(\d+)\s*вулик|вулик\w*\D{0,6}?(\d+)', 'вуликів')]

def livestock(txt):
    out = {}
    t = (txt or '').lower()
    for k, rx, _ in LIVE:
        for m in re.finditer(rx, t):
            nums = [int(x) for x in m.groups() if x]
            if nums:
                kk = 'korovy' if k == 'korovy2' else k
                out[kk] = out.get(kk, 0) + sum(nums)
    return out

def feats(txt):
    t = (txt or '').lower(); f = []
    if 'млин' in t: f.append('млин')
    if 'пасік' in t or 'вулик' in t: f.append('пасіка')
    if 'нив' in t: f.append('ниви')
    if 'сінокос' in t or 'копиц' in t: f.append('сінокіс')
    return f

def build(path, village, year, keyfn):
    rows = list(csv.DictReader(open(path, encoding='utf-8'), delimiter=';'))
    H = OrderedDict()
    for r in rows:
        k = keyfn(r)
        if k is None:
            continue
        H.setdefault(k, []).append(r)
    out = []
    for k, rs in H.items():
        head = next((r for r in rs if 'голова' in (r['роль'] or '')), rs[0])
        hosp = '; '.join(dict.fromkeys(r['господарство'] for r in rs if r['господарство']))
        st = ''
        for r in rs:
            n = (r['примітка'] or '') + ' ' + (r['роль'] or '') + ' ' + (r['заняття'] or '')
            for w in ['козак', 'посполит', 'підсусід', 'священик', 'значков']:
                if w in n.lower():
                    st = st or {'козак': 'козак', 'посполит': 'посполитий', 'підсусід': 'підсусідок', 'священик': 'священик', 'значков': 'значковий товариш'}[w]
        people = [{'s': r['прізвище'], 'n': r["ім'я"], 'pt': r['по батькові'], 'age': r['вік'], 'role': r['роль'], 'sex': r['стать']} for r in rs]
        nb = ''
        for r in rs:
            m = re.search(r'сусід\w*[^;"]*', (r['примітка'] or '') + ' ' + (r['господарство'] or ''))
            if m:
                nb = m.group(0); break
        out.append({'id': '%s-%s-%s' % (village, year, re.sub(r'\D', '', str(k)) or len(out)), 'no': str(k), 'head': (head["ім'я"] + ' ' + head['прізвище']).strip(),
                    'sur': head['прізвище'], 'status': st, 'people': people, 'hosp': hosp, 'live': livestock(hosp), 'feats': feats(hosp),
                    'nb': nb, 'kadr': head.get('кадр', ''), 'ark': head.get('аркуш', ''), 'ours': any(ours(p['s']) for p in people)})
    return out

def vor_key(r):
    d = r['двір'].strip()
    return int(d) if d.isdigit() else (d or None)

def vep_key(r):
    d = r['двір'].strip()
    return d or None

D = {'voronky': {}, 'veprik': {}}
D['voronky']['1767'] = build(R + 'facts/baza/src_rum1767_voronky.csv', 'voronky', '1767', vor_key)
D['voronky']['1782'] = build(R + 'facts/baza/src_perepys1782_voronky.csv', 'voronky', '1782', vor_key)
vep = build(R + 'facts/baza/src_rum1767_veprik.csv', 'veprik', '1767', vep_key)

# Веприк 1767: вуличний список, якщо прочитаний — вулиця, бік, номер; прив'язка до опису за кадром
sp = R + 'facts/rum1767_streets/veprik_streets_1767.csv'
if os.path.exists(sp):
    st = list(csv.DictReader(open(sp, encoding='utf-8'), delimiter=';'))
    bykadr = {h['no'].replace('кадр ', '').split('–')[0]: h for h in vep}
    lst = []
    for i, r in enumerate(st):
        k = (r.get('match_kadr') or '').replace('кадр ', '').strip()
        h = bykadr.pop(k, None) if k else None
        e = h or {'id': 'veprik-1767-s%d' % i, 'no': '', 'head': r.get('owner', ''), 'sur': '', 'status': r.get('status', ''), 'people': [], 'hosp': '', 'live': {},
                  'feats': [], 'nb': '', 'kadr': '', 'ark': '', 'ours': ours((r.get('owner') or '').split(' ')[-1])}
        e = dict(e, street=r.get('street', ''), side=r.get('side', ''), sno=r.get('no', ''), type=r.get('type', ''), khaty=r.get('khaty', ''),
                 owner_list=r.get('owner', ''), list_frame=r.get('frame', ''))
        lst.append(e)
    def realk(h):
        m = re.search(r'\d+', h['no'] or ''); k = int(m.group(0)) if m else 0
        return not (34 <= k <= 60 or 253 <= k <= 296)  # копії: друга козацька відомість і чистовик
    rest = [dict(h, street='Двори з опису, яких не знайдено у вуличному списку', side='', sno='') for h in bykadr.values() if realk(h)]
    D['veprik']['1767'] = lst + rest
else:
    D['veprik']['1767'] = vep

os.makedirs(R + 'facts/dvory', exist_ok=True)

# «Шут» у книзі → пишемо «Шутий» (жінки — «Шута»), як в усьому дереві; у примітці — як записано в книзі (правило власника, 07.11)
import re as _re
def _shut(t, sex=''):
    return _re.sub(r'(?<![А-Яа-яІіЇїЄєҐґ])Шут(?![А-Яа-яІіЇїЄєҐґ])', 'Шута' if sex == 'ж' else 'Шутий', t or '')
for _v in D:
    for _y in D[_v]:
        for h in D[_v][_y]:
            was = any(_re.search(r'(?<![А-Яа-яІіЇїЄєҐґ])Шут(?![А-Яа-яІіЇїЄєҐґ])', x or '') for x in [h.get('sur'), h.get('head'), h.get('owner_list')] + [q['s'] for q in h['people']])
            if not was: continue
            for q in h['people']:
                if _re.search(r'(?<![А-Яа-яІіЇїЄєҐґ])Шут(?![А-Яа-яІіЇїЄєҐґ])', q['s']): q['book'] = q['s']; q['s'] = _shut(q['s'], q.get('sex'))
            h['head'] = _shut(h.get('head')); h['sur'] = _shut(h.get('sur'))
            h['note'] = (h.get('note', '') + ' ' if h.get('note') else '') + 'У книзі прізвище записано «Шут»; на сайті пишемо «Шутий» (жінок — «Шута»), як в усьому дереві.'

# 1767 ↔ 1782 (Вороньки): ті самі люди? — за ім'ям, прізвищем і віком (лише чоловіки, різниця 5–24 роки — у книгах вік часто неточний). Лише як «Є припущення».
def _stem(x): return _re.sub(r'\(.*?\)|[?]', '', x or '').strip()[:4].lower()
if '1767' in D.get('voronky', {}) and '1782' in D.get('voronky', {}):
    for h2 in D['voronky']['1782']:
        hits = {}
        for q2 in h2['people']:
            try: a2 = int(q2.get('age') or 0)
            except ValueError: a2 = 0
            if not a2 or not q2.get('n') or not _stem(q2.get('s')): continue
            for h1 in D['voronky']['1767']:
                for q1 in h1['people']:
                    try: a1 = int(q1.get('age') or 0)
                    except ValueError: a1 = 0
                    if a1 and q1.get('n') == q2['n'] and _stem(q1.get('s')) == _stem(q2['s']) and 5 <= a2 - a1 <= 24 and q1.get('sex') == 'ч' and q2.get('sex') == 'ч':
                        hits.setdefault(h1['id'], []).append(f"{q2['n']} {q2['s']} ({a1} → {a2})")
        if hits:
            h2['link'] = [{'id': k, 'who': v} for k, v in hits.items()]
            for k, v in hits.items():
                h1 = next(x for x in D['voronky']['1767'] if x['id'] == k)
                h1.setdefault('link', []).append({'id': h2['id'], 'who': v})

# Скани для кожного двору: кадри Архіуму (60294 — Вороньки 1767, спр.169; 60295 — Веприк 1767, спр.170; 60556 — Вороньки 1782, спр.435).
# Вороньки 1767: аркуш → кадр за таблицею, прочитаною з номерів аркушів на кадрах (07.11): ректо N стоїть праворуч на кадрі.
def _vor_frame(a):
    if a <= 306: return a + 23
    if a <= 337: return a + 22
    if a == 338: return 360
    if a <= 352: return a + 23
    if a <= 392: return a + 24
    return a + 26
def _frames_of(s):
    out = set()
    for a, b in _re.findall(r'(\d+)\s*[-–]\s*(\d+)', s or ''): out.update(range(int(a), int(b) + 1))
    out.update(int(x) for x in _re.findall(r'\d+', _re.sub(r'(\d+)\s*[-–]\s*(\d+)', '', s or '')))
    return out
def _ark_frames(s):
    out = set()
    for m in _re.finditer(r'(\d+)(зв)?(?:\s*[-–]\s*(\d+)(зв)?)?', s or ''):
        a = int(m.group(1)); a1 = a + 1 if m.group(2) else a
        b = int(m.group(3)) if m.group(3) else a; b1 = b + 1 if (m.group(4) or (not m.group(3) and m.group(2))) else b
        for x in range(a1, max(a1, b1) + 1):
            if 200 <= x <= 402: out.add(_vor_frame(x))
    return out
for _v in D:
    for _y in D[_v]:
        vw = {'voronky1767': '60294', 'veprik1767': '60295', 'voronky1782': '60556'}[_v + _y]
        for h in D[_v][_y]:
            fr = _frames_of(h.get('kadr', ''))
            if _v + _y == 'voronky1767' and not fr: fr = _ark_frames(h.get('ark', ''))
            sc = [{'v': vw, 'f': f} for f in sorted(fr)[:6]]
            for f in sorted(_frames_of(h.get('list_frame', ''))): sc.append({'v': vw, 'f': f, 'list': 1})
            h['scan'] = sc

json.dump(D, open(R + 'facts/dvory/dvory.json', 'w'), ensure_ascii=False)
for v in D:
    for y in D[v]:
        L = D[v][y]
        print(v, y, len(L), 'наших прізвищ:', sum(1 for h in L if h['ours']), 'з худобою:', sum(1 for h in L if h['live']))
