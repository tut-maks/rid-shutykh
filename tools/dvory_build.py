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

json.dump(D, open(R + 'facts/dvory/dvory.json', 'w'), ensure_ascii=False)
for v in D:
    for y in D[v]:
        L = D[v][y]
        print(v, y, len(L), 'наших прізвищ:', sum(1 for h in L if h['ours']), 'з худобою:', sum(1 for h in L if h['live']))
