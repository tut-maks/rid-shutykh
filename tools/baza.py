#!/usr/bin/env python3
"""«База» — усі люди, яких ми прочитали в джерелах (і не наші), однією таблицею.

Файли: facts/baza/src_<джерело>.csv (UTF-8, «;», перший рядок — заголовок). Один рядок = одна людина так, як її записано в джерелі.
Обов'язкові колонки: село;прізвище;ім'я;по батькові. Бажані: стать;вік;рік;двір;роль;заняття;господарство;кадр;аркуш;примітка.
Назву джерела й посилання для кожного файлу — у BAZA_SRC (api/data.js). Сайт віддає ці рядки через /api/data?baza=1,
а кнопка «⬇ Уся база однією таблицею» (Цифри роду, власник) зводить їх з усіма картками дерева в один CSV.

  python3 tools/baza.py check                 — перевірити всі файли (колонки, порожні прізвища, дублі рядків), підсумок
  python3 tools/baza.py find <прізвище> [ім'я] — пошук людини по всіх джерелах бази
  python3 tools/baza.py match <live.json>     — хто з бази збігається з картками дерева (прізвище+ім'я+по батькові)
"""
import csv, glob, json, os, sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
N = "ім'я"
NEED = ['село', 'прізвище', N, 'по батькові']

def load():
    out = []
    for fn in sorted(glob.glob(os.path.join(ROOT, 'facts', 'baza', 'src_*.csv'))):
        with open(fn, encoding='utf-8-sig') as f:
            for i, r in enumerate(csv.DictReader(f, delimiter=';'), 2):
                r['_file'], r['_line'] = os.path.basename(fn), i
                out.append(r)
    return out

def norm(*a):
    return '|'.join(str(x or '').lower().replace('’', '').replace("'", '').strip() for x in a)

def check():
    rows, err = load(), 0
    files = Counter(r['_file'] for r in rows)
    for fn in sorted(glob.glob(os.path.join(ROOT, 'facts', 'baza', 'src_*.csv'))):
        head = open(fn, encoding='utf-8-sig').readline().strip().split(';')
        miss = [c for c in NEED if c not in head]
        if miss: print(f'ПОМИЛКА {os.path.basename(fn)}: немає колонок {miss}'); err += 1
    for r in rows:
        if not (r.get('прізвище') or '').strip() and not (r.get("ім'я") or '').strip():
            print(f"ПОМИЛКА {r['_file']}:{r['_line']}: ні прізвища, ні імені"); err += 1
    dup = Counter((r['_file'], norm(*[r.get(c) for c in NEED + ['вік', 'рік', 'двір', 'роль']])) for r in rows)
    for (f, k), n in dup.items():
        if n > 1: print(f'увага {f}: однаковий рядок ×{n}: {k}  (якщо так у джерелі — позначте в «примітка»)')
    print(f'Рядків: {len(rows)}; файлів: {len(files)}'); [print(f'  {f}: {n}') for f, n in files.items()]
    print('Найчастіші прізвища:', ', '.join(f'{s} {n}' for s, n in Counter(r['прізвище'] for r in rows).most_common(15)))
    return err

def find(sur, name=''):
    for r in load():
        if r['прізвище'].lower().startswith(sur.lower()) and (not name or r["ім'я"].lower().startswith(name.lower())):
            print(f"{r['_file']}:{r['_line']}  {r['село']}  {r['прізвище']} {r[N]} {r['по батькові']}  вік {r.get('вік','')}  рік {r.get('рік','')}  {r.get('роль','') or r.get('заняття','')}  {r.get('примітка','')}")

def match(live):
    P = json.load(open(live, encoding='utf-8'))['persons']
    idx = {}
    for p in P:
        for s in filter(None, [p.get('s'), p.get('m')]):
            idx.setdefault(norm(s, p.get('n'), p.get('pt')), []).append(p['id'])
    for r in load():
        ids = idx.get(norm(r['прізвище'], r["ім'я"], r['по батькові']))
        if ids: print(f"{r['_file']}:{r['_line']}  {r['село']} {r['прізвище']} {r[N]} {r['по батькові']} {r.get('рік','')}  →  {', '.join(ids)}")

if __name__ == '__main__':
    a = sys.argv[1:] or ['check']
    if a[0] == 'check': sys.exit(1 if check() else 0)
    if a[0] == 'find': find(*a[1:3])
    if a[0] == 'match': match(a[1])
