"""ОБД «Мемориал» → facts/baza/src_obd_memorial.csv (усі записи з наших сіл; як у джерелі).

Вхід: JSON-и, зібрані в браузері (localStorage на obd-memorial.ru, вивантажено файлом):
  list.json  — {id: [id, тип документа, рядок результату пошуку, запит]}
  info.json  — {id: {поле картки: значення, _title, _img}}
Використання: python3 tools/obd_baza.py <list.json> [<list2.json> ...] -- <info.json>
Рядок потрапляє в базу, якщо місце народження/призову — наші села (Вороньки, Веприк, Озеряни, Лідин,
Олександрівка, Свидовець, Пустотин, Козацьке) або це Шуті з Ново-Басанського/Бобровицького р-ну.
"""
import csv, json, re, sys

R = '/home/claude/rid-shutykh/'
OUT = R + 'facts/baza/src_obd_memorial.csv'
COLS = ["село", "прізвище", "ім'я", "по батькові", "стать", "вік", "рік", "двір", "роль", "заняття", "господарство", "кадр", "аркуш", "примітка"]

a = sys.argv[1:]
i = a.index('--')
lists, infos = a[:i], a[i + 1:]
L = {}
for f in lists:
    L.update(json.load(open(f)))
I = {}
for f in infos:
    I.update(json.load(open(f)))

VIL = [('Воронь', 'Вороньки'), ('Воронк', 'Вороньки'), ('Вороны', 'Вороньки'), ('Воротк', 'Вороньки'), ('с. Ворона', 'Вороньки'),
       ('Веприк', 'Веприк'), ('Озерян', 'Озеряни'), ('Лидин', 'Лідин'), ('Свидов', 'Свидовець'), ('Пустот', 'Пустотин'),
       ('Казацк', 'Козацьке'), ('Козацк', 'Козацьке'), ('Александровк', 'Олександрівка')]
OURREG = re.compile(r'Басан|Бобров|Лосинов|Носов|Нежин')

def village(*ss):
    for s in ss:
        if not s:
            continue
        for k, v in VIL:
            if k in s and (OURREG.search(s) or v in ('Вороньки', 'Веприк') and 'Чернигов' in s):
                return v
    return ''

rows = []
for id, v in I.items():
    if not v.get('Фамилия'):
        continue
    bp = v.get('Место рождения', '')
    pr = v.get('Дата и место призыва', '')
    lr = (L.get(id) or [''] * 3)[2]
    vil = village(bp, pr, lr)
    sh = v['Фамилия'].startswith('Шут') and not v['Фамилия'].startswith('Шутько')
    if not vil and not (sh and OURREG.search(bp + pr + lr)):
        continue
    y = re.findall(r'(1[89]\d\d)', v.get('Дата рождения/Возраст', ''))
    typ = (L.get(id) or ['', ''])[1] or re.sub(r'^.*?:\s*', '', v.get('_title', '').split(' : ')[-1])
    note = []
    for k in ('Дата рождения/Возраст', 'Место рождения', 'Дата и место призыва', 'Последнее место службы', 'Причина выбытия', 'Дата выбытия', 'Дата смерти', 'Судьба',
              'Место выбытия', 'Первичное место захоронения', 'Место захоронения', 'Госпиталь', 'Лагерь', 'Лагерный номер', 'Дата пленения', 'Место пленения', 'Доп. информация'):
        if v.get(k):
            note.append(f'{k}: {v[k]}')
    src = ', '.join(x for x in [v.get('Название источника донесения') or v.get('Название источника информации'),
                               ('ф. ' + v['Номер фонда источника информации']) if v.get('Номер фонда источника информации') else '',
                               ('оп. ' + v['Номер описи источника информации']) if v.get('Номер описи источника информации') else '',
                               ('спр. ' + v['Номер дела источника информации']) if v.get('Номер дела источника информации') else ''] if x)
    note.append(f'ОБД «Мемориал» №{id} ({typ}){"; " + src if src else ""}; https://obd-memorial.ru/html/info.htm?id={id}')
    rows.append({'село': vil or ('Чернігівщина' if 'Чернигов' in bp + pr + lr else ''), 'прізвище': v['Фамилия'], "ім'я": v.get('Имя', ''),
                 'по батькові': v.get('Отчество', ''), 'стать': 'ж' if re.search(r'(вна|чна|ая)$', v.get('Отчество', '') + ' ' + v['Фамилия']) and v.get('Отчество', '').endswith('на') else 'ч',
                 'вік': '', 'рік': y[0] if y else '', 'двір': '', 'роль': 'ОБД: ' + typ[:40], 'заняття': v.get('Воинское звание', ''), 'господарство': '',
                 'кадр': id, 'аркуш': '', 'примітка': '; '.join(note)})

rows.sort(key=lambda r: (r['село'], r['прізвище'], r["ім'я"], r['по батькові'], r['кадр']))
with open(OUT, 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=COLS, delimiter=';')
    w.writeheader()
    w.writerows(rows)
from collections import Counter
print(len(rows), 'рядків;', Counter(r['село'] for r in rows))
