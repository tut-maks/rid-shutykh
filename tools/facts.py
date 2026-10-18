#!/usr/bin/env python3
"""Журнал перевірок фактів (пам'ять Claude між сесіями).

Кожен факт сайту — окремий рядок у facts/facts.csv: хто/що, поле, значення на сайті,
документи-джерела, статус перевірки, коли й як перевірено.

  python3 tools/facts.py build <live.json>   — оновити журнал з живих даних сайту
                                              (статуси зберігаються; якщо значення змінилось — «змінилось»)
  python3 tools/facts.py set <ключ> <статус> "<примітка>"  — записати результат перевірки
  python3 tools/facts.py todo [поле] [N]     — що ще не перевірено (за пріоритетом)
  python3 tools/facts.py who <id|ім'я>       — усе про людину: факти, статуси, документи (контекст для нових знахідок)
  python3 tools/facts.py stats               — скільки чого перевірено
  python3 tools/facts.py derive              — батьки/подружжя/місця, які називає вже звірений документ, → «звірено» (є і в build)

live.json — вивантаження /api/data (+ texts), як для check.py --live.
"""
import csv, json, re, sys, hashlib, datetime, os
from collections import defaultdict, Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FN = os.path.join(ROOT, 'facts', 'facts.csv')
COLS = ['key', 'kind', 'id', 'who', 'field', 'value', 'docs', 'status', 'checked', 'note', 'h']
# Статуси (від найнадійнішого):
ST = ['звірено зі сканом', 'звірено з покажчиком FS', 'зі слів родичів', 'припущення', 'оцінка за віком',
      'є скан — не звірено', 'за покажчиком FS — скан не звірено', 'без документа', 'змінилось — перевірити', 'суперечність']
FIELDS = {'name': "Ім'я", 'b': 'Народження', 'd': 'Смерть', 'bp': 'Місце народження', 'dp': 'Місце смерті',
          'sex': 'Стать', 'hyp': 'Припущення', 'f': 'Батько', 'mo': 'Мати', 'sp': 'Подружжя', 'war': 'Війна',
          'date': 'Дата документа', 'place': 'Місце документа', 'line': 'Рядок (текст джерела)', 'people': 'Хто в документі'}
TODAY = datetime.date.today().strftime('%d.%m.%Y')
H = lambda v: hashlib.sha1(str(v).encode()).hexdigest()[:10]


def load_csv():
    if not os.path.exists(FN): return {}
    with open(FN, newline='', encoding='utf-8') as f: return {r['key']: r for r in csv.DictReader(f)}


def save_csv(rows):
    os.makedirs(os.path.dirname(FN), exist_ok=True)
    with open(FN, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=COLS); w.writeheader()
        for k in sorted(rows, key=lambda k: (rows[k]['kind'], rows[k]['id'], list(FIELDS).index(rows[k]['field']) if rows[k]['field'] in FIELDS else 99)):
            w.writerow({c: rows[k].get(c, '') for c in COLS})


def nm(p):
    if not p: return ''
    return ' '.join(x for x in [p.get('n'), p.get('pt'), p.get('s')] if x) + (f" ({p.get('m')})" if p.get('m') else '')


def ymd(s):
    m = re.search(r'(\d{1,2})\.(\d{1,2})\.(\d{4})', str(s or ''))
    return (int(m[1]), int(m[2]), int(m[3])) if m else None


def build(live):
    L = json.load(open(live, encoding='utf-8'))
    P = {p['id']: p for p in L['persons']}; D = {d['id']: d for d in L['documents']}
    SP = defaultdict(list)
    for u in L.get('unions', []): SP[u['a']].append((u['b'], u.get('date', ''))); SP[u['b']].append((u['a'], u.get('date', '')))
    DOCS = defaultdict(list)
    for d in D.values():
        for pid in d.get('people') or []: DOCS[pid].append(d)
    old = load_csv(); new = {}

    def doc_status(d):
        idx = 'як у покажчику FamilySearch' in (d.get('text') or '')
        has = bool(d.get('pages') or d.get('marks'))
        if idx: return 'за покажчиком FS — скан не звірено'
        return 'є скан — не звірено' if has else 'без документа'

    def put(kind, id_, who, field, value, docs, auto):
        key = f'{kind}:{id_}:{field}'; h = H(value)
        r = {'key': key, 'kind': kind, 'id': id_, 'who': who, 'field': field, 'value': str(value), 'docs': ' '.join(docs), 'h': h}
        o = old.get(key)
        if o and o.get('h') == h and o.get('status'):
            r.update(status=o['status'], checked=o.get('checked', ''), note=o.get('note', ''))
        elif o and o.get('status') and o.get('h') != h and o['status'] not in ('без документа',):
            r.update(status='змінилось — перевірити', checked='', note=f"було: {o.get('value', '')[:80]} ({o['status']}, {o.get('checked', '')})")
        else:
            r.update(status=auto, checked='', note='')
        new[key] = r

    for p in P.values():
        pid, who = p['id'], nm(p)
        ds = DOCS[pid]; hyp = bool(p.get('hyp'))
        put('p', pid, who, 'name', who, [d['id'] for d in ds][:6], 'є скан — не звірено' if ds else ('припущення' if hyp else 'зі слів родичів'))
        if hyp: put('p', pid, who, 'hyp', 'зв\'язок у дереві — припущення: ' + str(p.get('hyp'))[:120], [], 'припущення')
        for fld, kinds in (('b', ('Народж', 'Хрещ')), ('d', ('Смерть',))):
            v = p.get(fld) or ''
            if not v: continue
            match = [d for d in ds if d.get('title', '').startswith(kinds) and ymd(d.get('date')) and ymd(d.get('date')) == ymd(v)]
            yr = re.search(r'(\d{4})', v); yr = int(yr[1]) if yr else 0
            if match: auto = doc_status(match[0]); src = [d['id'] for d in match]
            elif v.startswith(('~', 'бл')) or not ymd(v): auto, src = ('оцінка за віком' if yr and yr < 1920 else 'зі слів родичів'), []
            else: auto, src = ('без документа' if yr < 1920 else 'зі слів родичів'), []
            if hyp and not match and auto not in ('зі слів родичів',): auto = 'припущення'
            put('p', pid, who, fld, v, src, auto)
        for fld in ('bp', 'dp'):
            if p.get(fld): put('p', pid, who, fld, p[fld], [], 'без документа')
        for fld in ('f', 'mo'):
            q = P.get(p.get(fld))
            if q: put('p', pid, who, fld, f"{nm(q)} [{q['id']}]", [], 'припущення' if hyp else 'без документа')
        for sid, dt in SP[pid]:
            q = P.get(sid)
            if q: put('p', pid, who, 'sp', f"{nm(q)} [{sid}] ⚭ {dt}".strip(), [], 'без документа')
        if p.get('war'): put('p', pid, who, 'war', json.dumps(p['war'], ensure_ascii=False), [], 'без документа')
    for d in D.values():
        who = d.get('title', '')[:90]; auto = doc_status(d)
        if d.get('date'): put('d', d['id'], who, 'date', d['date'], [d['id']], auto)
        if d.get('place'): put('d', d['id'], who, 'place', d['place'], [d['id']], auto)
        if d.get('line'): put('d', d['id'], who, 'line', d['line'], [d['id']], auto)
        put('d', d['id'], who, 'people', ' '.join(d.get('people') or []), [d['id']], auto)
    # поля з документом, де факт підтверджено документом зі «звірено» — підтягуємо статус
    for k, r in new.items():
        if r['kind'] == 'p' and r['field'] in ('b', 'd') and r['docs'] and r['status'] in ('є скан — не звірено', 'за покажчиком FS — скан не звірено'):
            ds = new.get(f"d:{r['docs'].split()[0]}:date")
            if ds and ds['status'].startswith('звірено'): r.update(status=ds['status'], checked=ds['checked'], note=ds['note'] or 'за документом ' + r['docs'])
    derive(new)
    gone = [k for k in old if k not in new]
    save_csv(new)
    print(f'рядків: {len(new)} (було {len(old)}, зникло {len(gone)})'); stats(new)


def derive(rows):
    """Батьки / подружжя / місце — «звірено», якщо їх називає вже звірений документ про саму людину:
    метрика народження (f, mo, bp), запис про смерть (dp), запис про вінчання обох (sp)."""
    ok = lambda r: r and r['status'].startswith('звірено')
    D = {r['id']: r for r in rows.values() if r['kind'] == 'd' and r['field'] == 'people'}
    PL = {r['id']: r['value'] for r in rows.values() if r['kind'] == 'd' and r['field'] == 'place'}
    n = 0
    def mark(r, did, how):
        nonlocal n
        dr = rows.get(f'd:{did}:date') or {}
        r.update(status=dr.get('status', 'звірено зі сканом'), checked=dr.get('checked', ''), note=how + ' ' + did); n += 1
    for r in list(rows.values()):
        if r['kind'] != 'p' or r['status'] != 'без документа': continue
        pid, f = r['id'], r['field']
        if f in ('f', 'mo', 'bp'):
            br = rows.get(f'p:{pid}:b')
            if not ok(br) or not br['docs']: continue
            did = br['docs'].split()[0]; ppl = (D.get(did) or {}).get('value', '').split()
            if f in ('f', 'mo'):
                m = re.search(r'\[([^\]]+)\]', r['value'])
                if m and m[1] in ppl: mark(r, did, 'названо в метриці народження')
            elif PL.get(did) and r['value'].split(',')[0].strip().lower().startswith(PL[did].split(',')[0].strip().lower()[:6]):
                mark(r, did, 'місце — за метрикою народження')
        elif f == 'dp':
            dr = rows.get(f'p:{pid}:d')
            if ok(dr) and dr['docs']:
                did = dr['docs'].split()[0]
                if PL.get(did) and r['value'].split(',')[0].strip().lower().startswith(PL[did].split(',')[0].strip().lower()[:6]):
                    mark(r, did, 'місце — за записом про смерть')
        elif f == 'sp':
            m = re.search(r'\[([^\]]+)\]', r['value'])
            if not m: continue
            for did, dr in D.items():
                t = rows.get(f'd:{did}:date', {})
                if t.get('who', '').startswith('Вінчання') and ok(t) and pid in dr['value'].split() and m[1] in dr['value'].split():
                    mark(r, did, 'запис про вінчання'); break
    return n


def stats(rows=None):
    rows = rows or load_csv(); c = Counter(r['status'] for r in rows.values())
    for s in ST + [s for s in c if s not in ST]:
        if c.get(s): print(f'  {s:40s} {c[s]:6d}')
    cf = Counter((r['field'], r['status']) for r in rows.values() if r['field'] in ('b', 'd', 'date'))
    print('  — дати: ' + ', '.join(f"{FIELDS[f]}/{s}: {n}" for (f, s), n in sorted(cf.items()) if n > 0))


def setst(key, status, note=''):
    rows = load_csv()
    keys = [k for k in rows if k == key or (key.endswith('*') and k.startswith(key[:-1]))]
    if not keys: sys.exit('немає ключа ' + key)
    for k in keys: rows[k].update(status=status, checked=TODAY, note=note or rows[k].get('note', ''))
    save_csv(rows); print('записано:', len(keys))


PRI = ['суперечність', 'змінилось — перевірити', 'за покажчиком FS — скан не звірено', 'є скан — не звірено', 'без документа']


def todo(field=None, n=40):
    rows = load_csv(); L = [r for r in rows.values() if r['status'] in PRI and (not field or r['field'] == field)]
    L.sort(key=lambda r: (PRI.index(r['status']), r['field'] not in ('b', 'd', 'date'), r['key']))
    for r in L[:n]: print(f"{r['key']:40s} {r['status']:36s} {r['value'][:60]}  [{r['docs']}]")
    print(len(L), 'усього')


def who(q):
    rows = load_csv(); ql = q.lower()
    ids = {r['id'] for r in rows.values() if r['kind'] == 'p' and (r['id'] == q or ql in r['who'].lower())}
    for pid in sorted(ids):
        R = [r for r in rows.values() if r['kind'] == 'p' and r['id'] == pid]
        print(f"\n## {R[0]['who']} [{pid}]")
        for r in sorted(R, key=lambda r: list(FIELDS).index(r['field'])):
            print(f"  {FIELDS[r['field']]:18s} {r['value'][:70]:70s} | {r['status']}{' ' + r['checked'] if r['checked'] else ''}{' — ' + r['note'][:80] if r['note'] else ''}")
        docs = sorted({r['id'] for r in rows.values() if r['kind'] == 'd' and r['field'] == 'people' and pid in r['value'].split()})
        for did in docs:
            dr = rows.get(f'd:{did}:date', {}); print(f"  док {did}: {dr.get('who', '')[:70]} | {dr.get('status', '')}")


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a: print(__doc__)
    elif a[0] == 'build': build(a[1])
    elif a[0] == 'set': setst(a[1], a[2], a[3] if len(a) > 3 else '')
    elif a[0] == 'todo': todo(a[1] if len(a) > 1 and not a[1].isdigit() else None, int(a[-1]) if a[-1].isdigit() else 40)
    elif a[0] == 'who': who(' '.join(a[1:]))
    elif a[0] == 'stats': stats()
    elif a[0] == 'derive':
        rows = load_csv(); print('підтверджено документами:', derive(rows)); save_csv(rows); stats(rows)
