#!/usr/bin/env python3
"""Глибока перевірка дерева іншими способами, ніж check.py (родинна правдоподібність і звірка з документами).

  python3 tools/deep_check.py <live.json> [--fam <id>] [--json out.json]

Перевірки:
  A  вік батьків при народженні дитини (батько <17 або >65, мати <15 або >50);
     дитина народилась пізніше ніж через 10 міс. після смерті батька / після смерті матері
  B  діти тієї самої матері народжені з проміжком < 9 міс. (не близнюки)
  C  двоє живих одночасно дітей тих самих батьків з однаковим ім'ям
  D  по батькові не відповідає імені батька
  E  дівоче прізвище не відповідає прізвищу батька
  F  різниця віку подружжя > 25 років
  G  людину прив'язано до документа, датованого до її народження / пізніше її смерті (крім запису про смерть)
  H  вік у записі про смерть (назва «…, NN років») ≠ вік за датою народження (±2 роки; з точною датою)
  I  вік у сповідних/переписах («Ім'я NN» у рядку) ≠ рік народження з картки (±3)
  J  «Є припущення, що батько/мати …» в описі, а картка не позначена як припущення
  K  людину прив'язано до документа, де її ім'я не згадано ні в назві, ні в рядку, ні в коментарі
  L  неможлива дата (день > 31, місяць > 12)
"""
import json, re, sys
from collections import defaultdict

def yr(s):
    m = re.search(r'(\d{4})', str(s or '')); return int(m.group(1)) if m else None
def ymd(s):
    m = re.search(r'(\d{1,2})\.(\d{1,2})\.(\d{4})', str(s or '')); return (int(m[3]), int(m[2]), int(m[1])) if m else None
def months(a, b):  # b - a у місяцях
    return (b[0]-a[0])*12 + (b[1]-a[1]) + (b[2]-a[2])/30
def approx(s): return str(s or '').strip().startswith(('~', 'бл', '≈'))

ROOT = {  # укр. ім'я батька -> можливі корені по батькові
}
def stem(n):
    n = (n or '').split('(')[0].split()[0].lower() if n else ''
    n = n.replace('ʼ', "'").replace('’', "'")
    for suf in ('ій', 'ія', 'ко', 'о', 'а', 'я', 'й', 'ь'):
        if n.endswith(suf) and len(n) > 3: return n[:-len(suf)]
    return n
ALIAS = {'юхим': ['євфим', 'євфимі', 'юхим'], 'іван': ['іван', 'іоанн', 'іоан'], 'федір': ['федор', 'феодор'], 'гаврило': ['гаврил', 'гавриїл'],
         'яків': ['яков', 'якович', 'іаков'], 'хома': ['хом', 'фом'], 'григорій': ['григор'], 'трохим': ['трохим', 'трофим'], 'кузьма': ['кузьм', 'косьм'],
         'семен': ['семен', 'симеон'], 'олексій': ['олекс', 'алекс'], 'пилип': ['пилип', 'филип'], 'опанас': ['опанас', 'афанас'], 'петро': ['петр'],
         'павло': ['павл'], 'михайло': ['михайл'], 'данило': ['данил'], 'гнат': ['гнат', 'ігнат'], 'ігнат': ['гнат', 'ігнат'], 'максим': ['максим'],
         'тимофій': ['тимоф'], 'тиміш': ['тимош', 'тимоф'], 'леонтій': ['леонт'], 'лаврентій': ['лаврент'], 'терентій': ['терент'], 'самійло': ['самійл', 'самуїл', 'самойл'],
         'самуїл': ['самійл', 'самуїл', 'самойл'], 'никифор': ['никифор'], 'микита': ['микит', 'никит'], 'андрій': ['андрі'], 'антон': ['антон'], 'василь': ['васил'],
         'дмитро': ['дмитр', 'димитр'], 'кирило': ['кирил'], 'пархом': ['пархом', 'пахом'], 'роман': ['роман'], 'ілля': ['іллі', 'ілль', 'ілліч'], 'кіндрат': ['кіндрат', 'кодрат', 'кондрат']}
def norm3(x):
    x = (x or '').lower().replace('ʼ', "'")
    for a, b in (('і', 'и'), ('ї', 'и'), ('є', 'е'), ('о', 'и'), ('е', 'и'), ('ѣ', 'и'), ('ъ', ''), ('й', 'и'), ('ф', 'т'), ('х', 'к')): x = x.replace(a, b)
    return x[:3]
def pt_ok(pt, fname):
    if not pt or not fname: return True
    names = [fname.split('(')[0].strip().split()[0]] + [a.split()[0] for a in re.findall(r'\(([^)]+)\)', fname)]
    if any(norm3(pt) == norm3(n) for n in names): return True
    p = pt.lower().replace('ʼ', "'")
    f = fname.split('(')[0].strip().split()[0].lower()
    roots = ALIAS.get(f, [stem(f)])
    alts = re.findall(r'\(([^)]+)\)', fname)
    for a in alts: roots += [stem(a.split()[0])] + ALIAS.get(a.split()[0].lower(), [])
    return any(r and p.startswith(r[:max(3, len(r) - 1)]) for r in roots)

def main():
    a = sys.argv[1:]; L = json.load(open(a[0], encoding='utf-8'))
    fam = a[a.index('--fam') + 1] if '--fam' in a else None
    P = {p['id']: p for p in L['persons']}; D = {d['id']: d for d in L['documents']}
    kids = defaultdict(list)
    for p in P.values():
        for k in ('f', 'mo'):
            if p.get(k): kids[p[k]].append(p)
    SP = defaultdict(list)
    for u in L.get('unions', []): SP[u['a']].append(u['b']); SP[u['b']].append(u['a'])
    PD = defaultdict(list)
    for d in D.values():
        for pid in d.get('people') or []: PD[pid].append(d)
    out = []
    def nm(p): return ' '.join(x for x in [p.get('n'), p.get('pt'), p.get('s')] if x) + f" [{p['id']}]"
    def add(code, p, msg):
        if fam and fam not in (p.get('fam') or []): return
        out.append((code, nm(p), msg))
    for p in P.values():
        b, d = p.get('b'), p.get('d'); by = yr(b)
        for fld in ('b', 'd'):
            m = re.search(r'(\d{1,2})\.(\d{1,2})\.(\d{4})', str(p.get(fld) or ''))
            if m and (int(m[1]) > 31 or int(m[2]) > 12): add('L', p, f'{fld}={p.get(fld)}')
        # A
        for k, lo, hi in (('f', 17, 65), ('mo', 15, 50)):
            q = P.get(p.get(k))
            if not q: continue
            qy = yr(q.get('b'))
            if qy and by:
                age = by - qy; slack = 3 if approx(q.get('b')) or approx(b) else 0
                if age < lo - slack or age > hi + slack: add('A', p, f"{'батькові' if k == 'f' else 'матері'} {nm(q)} при народженні {age} р. ({q.get('b')} → {b})")
            qd, pb = ymd(q.get('d')), ymd(b)
            if qd and pb:
                lim = 10 if k == 'f' else 0
                if months(qd, pb) > lim: add('A', p, f"народження {b} — після смерті {'батька' if k == 'f' else 'матері'} {nm(q)} ({q.get('d')})")
        # D
        f = P.get(p.get('f'))
        if f and p.get('pt') and f.get('n') and not pt_ok(p['pt'], f['n']): add('D', p, f"по батькові «{p['pt']}», а батько — {f.get('n')}")
        # E
        if p.get('sex') == 'f' and p.get('m') and f and f.get('s'):
            ms, fs = p['m'].lower()[:3], f['s'].lower()[:3]
            if ms != fs: add('E', p, f"дівоче «{p['m']}», батько — {f.get('s')}")
        # F
        for s in SP[p['id']]:
            q = P.get(s)
            if q and by and yr(q.get('b')) and p['id'] < s and abs(by - yr(q['b'])) > 25:
                add('F', p, f"подружжя {nm(q)}: {b} і {q.get('b')}")
        # J
        note = p.get('note') or ''
        if re.search(r'Є припущення, що (її |його )?(батько|мати|батьки)', note) and not p.get('hyp'):
            add('J', p, 'в описі припущення про батьків, картка без позначки «припущення»')
        # G, H, K
        pb, pdd = ymd(b), ymd(d)
        first = (p.get('n') or '').split('(')[0].strip().lower()[:4]
        alts = [x.strip().lower()[:4] for x in re.findall(r'\(([^)]+)\)', p.get('n') or '')]
        for doc in PD[p['id']]:
            dd = ymd(doc.get('date')); title = doc.get('title', '')
            if dd and pb and dd < pb and months(dd, pb) > 1 and not approx(b): add('G', p, f"документ {doc['id']} ({doc.get('date')}) раніше народження {b}")
            if dd and pdd and months(pdd, dd) > 1 and not title.startswith('Смерть'): add('G', p, f"документ {doc['id']} ({doc.get('date')}) пізніше смерті {d}: «{title[:60]}»")
            if title.startswith('Смерть') and pb and dd and p['id'] == (doc.get('people') or [None])[0]:
                m = re.search(r'(\d+)\s*(рок|рік)', title)
                if m and not approx(b):
                    real = (dd[0] - pb[0]) - (1 if (dd[1], dd[2]) < (pb[1], pb[2]) else 0)
                    if abs(real - int(m.group(1))) > 2: add('H', p, f"у записі {doc['id']} — {m.group(1)} р., за датою народження {b} — {real}")
            txt = (title + ' ' + (doc.get('line') or '') + ' ' + (doc.get('text') or '')).lower()
            txt = txt.replace('і', 'и').replace('ї', 'и').replace('є', 'е').replace('ѣ', 'е').replace('ъ', '')
            keys = [k.replace('і', 'и').replace('ї', 'и').replace('є', 'е') for k in [first] + alts if k]
            ALT = {'іван': ['иоан', 'иван', 'иоанн'], 'юхи': ['евфим', 'ефим'], 'феді': ['феод', 'федор'], 'гнат': ['игнат'], 'дмит': ['димит'], 'олек': ['алекс'], 'семе': ['симеон'], 'опан': ['афан'], 'пили': ['филип'], 'кузь': ['косм', 'козьм'], 'хома': ['фома'], 'пара': ['параск'], 'гали': ['анна'], 'ганн': ['анна'], 'нест': ['анаст'], 'наст': ['анаст'], 'мотр': ['матрон'], 'мотр': ['матрон'], 'улян': ['иулиан'], 'юлія': ['иулиан'], 'євдо': ['евдок'], 'олен': ['елен'], 'тете': ['татья','татиан'], 'тетя': ['тати'], 'пріс': ['евфрос','прис'], 'фрос': ['евфрос'], 'оль': ['ольг'], 'ксен': ['ксени'], 'варв': ['варв'], 'сидо': ['исид', 'сидор'], 'які': ['иак', 'яков'], 'яків': ['иаков','яков'], 'трох': ['трофим'], 'григ': ['георг','григор'], 'юрій': ['георг']}
            keys += ALT.get(first, [])
            keys = [k[:3] for k in keys]
            if keys and not any(k in txt for k in keys) and f"p:{p['id']}" not in (doc.get('text') or ''):
                add('K', p, f"не названо в документі {doc['id']} «{title[:60]}»")
        # I
        for doc in PD[p['id']]:
            if not re.search(r'(сповідн|перепис|розпис|відомість|опис)', (doc.get('title', '') + doc.get('src', '')).lower()): continue
            dy = yr(doc.get('date'))
            if not dy or not by: continue
            line = doc.get('line') or ''
            nn = (p.get('n') or '').split('(')[0].strip()
            for m in re.finditer(r'([А-ЯІЇЄҐѢа-яіїєґѣъ]+)[^0-9«»;,]{0,40}?\s(\d{1,2})(?!\d)', line):
                w = m.group(1).lower().replace('ъ', '')
                if len(w) >= 3 and nn and w[:3] in (nn.lower()[:3], ) and int(m.group(2)) < 100:
                    impl = dy - int(m.group(2))
                    if abs(impl - by) > (5 if approx(b) else 3): add('I', p, f"у {doc['id']} «{m.group(0)[:40]}» → нар. бл. {impl}, у картці {b}")
                    break
    # M — по батькові не того роду (жінка «…ович», чоловік «…івна»)
    for p in P.values():
        pt = (p.get('pt') or '').split('(')[0].strip().lower()
        if p.get('sex') == 'f' and re.search(r'(ович|евич|ич)$', pt): add('M', p, f"жінка, а по батькові «{p['pt']}»")
        if p.get('sex') == 'm' and re.search(r'(івна|ївна|овна|ична)$', pt): add('M', p, f"чоловік, а по батькові «{p['pt']}»")
        # N — дата в описі «у віці N днів/місяців» без документа про народження
        if re.search(r'у віці \d+ (дн|тиж|міс)', p.get('note') or '') and not any(d.get('title', '').startswith(('Народж',)) for d in PD[p['id']]):
            add('N', p, 'вік у днях/місяцях порахований від дати народження, якої немає в документах')
    # O — рамка на сторінці, якої немає; P — той самий запис FamilySearch двічі
    byurl = defaultdict(list)
    for d in D.values():
        pages = d.get('pages') or 0
        pages = len(pages) if isinstance(pages, list) else pages
        for mk in d.get('marks') or []:
            if pages and mk.get('p', 0) >= pages: out.append(('O', d['id'], f"рамка на сторінці {mk.get('p')}, а сторінок {pages}"))
        u = (d.get('url') or '').split('?')[0]
        if '/ark:/61903/1:1:' in u: byurl[u].append(d['id'])
    for u, ids in byurl.items():
        if len(ids) > 1: out.append(('P', ', '.join(sorted(ids)), f'той самий запис FamilySearch у кількох документах: {u}'))
    # Q — чоловіче ім'я в жіночому записі про смерть (дочь/жена) і навпаки
    for d in D.values():
        t = (d.get('title') or '')
        if t.startswith('Смерть') and re.search(r'\bдочь\b', d.get('line') or '') and re.search(r'\bсынъ?\b', d.get('line') or '') is None:
            for pid in (d.get('people') or [])[:1]:
                q = P.get(pid)
                if q and q.get('sex') == 'm': add('Q', q, f"у {d['id']} записано «дочь», а картка чоловіча")
    # B, C
    for par, ch in kids.items():
        q = P.get(par)
        if not q or q.get('sex') != 'f': continue
        cs = sorted([c for c in ch if ymd(c.get('b')) and not approx(c.get('b'))], key=lambda c: ymd(c['b']))
        for x, y in zip(cs, cs[1:]):
            m = months(ymd(x['b']), ymd(y['b']))
            if 0.2 < m < 9: add('B', y, f"народжений через {m:.1f} міс. після {nm(x)} ({x['b']} → {y['b']}), та сама мати {nm(q)}")
    for par, ch in kids.items():
        q = P.get(par)
        if not q or q.get('sex') != 'm': continue
        byn = defaultdict(list)
        for c in ch: byn[(c.get('n') or '').split('(')[0].strip()].append(c)
        for n, cs in byn.items():
            if len(cs) < 2: continue
            for i, x in enumerate(cs):
                for y in cs[i + 1:]:
                    xb, yb = yr(x.get('b')), yr(y.get('b')); xd, yd = yr(x.get('d')), yr(y.get('d'))
                    if xb and yb:
                        older, younger, od = (x, y, xd) if xb <= yb else (y, x, yd)
                        if od is None or od > yr(younger.get('b')):
                            if x.get('mo') == y.get('mo') or not x.get('mo') or not y.get('mo'):
                                add('C', younger, f"старший брат/сестра з тим самим ім'ям {nm(older)} ({older.get('b')}–{older.get('d') or '?'}) ще живий, коли народився цей ({younger.get('b')})")
    out.sort()
    from collections import Counter
    print('Знайдено:', len(out), dict(Counter(o[0] for o in out)))
    for c, w, m in out: print(f' {c} | {w} | {m}')
    if '--json' in a: json.dump(out, open(a[a.index('--json') + 1], 'w'), ensure_ascii=False, indent=1)

if __name__ == '__main__': main()
