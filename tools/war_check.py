#!/usr/bin/env python3
"""Перевірка всіх, хто за віком міг воювати в Другій світовій (правило власника, 22.10.2026).

Кандидати: чоловіки 1880–1927 р. н. (і жінки 1915–1927 з --women), які не померли до 22.06.1941.
Журнал пошуку — facts/war_search.csv: id; ПІБ; рік; дата перевірки; результат; де шукали / примітка.
Результат: «знайдено» (є документ, на картці стоїть war), «не знайдено», «неоднозначно» (кандидати є, але певно не наш).

  python3 tools/war_check.py todo <live.json> [--women]   — хто ще не перевірений (або новий)
  python3 tools/war_check.py list <live.json> [--women]   — усі кандидати зі статусом
  python3 tools/war_check.py set <id> <результат> "<примітка>" [--name "ПІБ"] [--year 1914]
"""
import csv, json, os, re, sys, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG = os.path.join(ROOT, 'facts', 'war_search.csv')
F = ['id', 'name', 'year', 'checked', 'result', 'note']


def yr(s):
    m = re.search(r'(1[89]\d\d|20\d\d)', str(s or ''))
    return int(m.group(1)) if m else None


def load_log():
    if not os.path.exists(LOG):
        return {}
    with open(LOG, encoding='utf-8') as f:
        return {r['id']: r for r in csv.DictReader(f)}


def save_log(d):
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    with open(LOG, 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, F)
        w.writeheader()
        for k in sorted(d, key=lambda k: (d[k].get('year') or '', k)):
            w.writerow({x: d[k].get(x, '') for x in F})


def cands(live, women=False):
    D = json.load(open(live, encoding='utf-8'))
    out = []
    for p in D['persons']:
        b, d = yr(p.get('b')), yr(p.get('d'))
        if not b:
            continue
        m = p.get('sex') == 'm' and 1880 <= b <= 1927
        w = women and p.get('sex') == 'f' and 1915 <= b <= 1927
        if not (m or w):
            continue
        if d and d < 1941:
            continue
        nm = ' '.join(x for x in [p.get('s'), p.get('n'), p.get('pt')] if x)
        out.append((b, p['id'], nm, p.get('bp') or '', p.get('war')))
    return sorted(out)


def main():
    a = sys.argv[1:]
    if not a or a[0] not in ('todo', 'list', 'set'):
        print(__doc__); return
    log = load_log()
    if a[0] == 'set':
        pid, res, note = a[1], a[2], a[3] if len(a) > 3 else ''
        r = log.get(pid, {'id': pid})
        if '--name' in a: r['name'] = a[a.index('--name') + 1]
        if '--year' in a: r['year'] = a[a.index('--year') + 1]
        r.update(result=res, note=note, checked=datetime.date.today().isoformat())
        log[pid] = r; save_log(log); print('записано:', pid, res); return
    c = cands(a[1], '--women' in a)
    todo = 0
    for b, pid, nm, bp, war in c:
        r = log.get(pid)
        st = (r['result'] + ' ' + r['checked']) if r else '— НЕ ПЕРЕВІРЕНО'
        if war and (not r or r['result'] != 'знайдено'):
            st += ' (на картці є war — внести в журнал)'
        if a[0] == 'list' or not r:
            print(f'{b} | {pid} | {nm} | {bp} | {st}')
        if not r:
            todo += 1
    print(f'\nКандидатів: {len(c)}, не перевірено: {todo}')


if __name__ == '__main__':
    main()
