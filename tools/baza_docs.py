#!/usr/bin/env python3
"""Збирає в «Базу» всіх людей, названих у цитатах документів сайту (метрики, сповідні, ЗАГС, описи…):
батьків, хрещених, поручителів, свідків, священиків, сусідів — наших і чужих.

Джерело — seed/seed.json + seed/import/manifest.json (документи kind 'doc' з усіма docpatch по черзі),
поля `line` і `text`: беремо текст у «…» (так ми завжди цитуємо джерело).
Результат — facts/baza/src_documents.csv (одна людина як записана в документі — один рядок).

  python3 tools/baza_docs.py            — перебудувати файл
Імена лишаються в написанні джерела (старий правопис: «Иоаннъ Михайловъ Шутый»).
Код людини дерева ставиться, якщо документ прив'язаний до неї (people) і збігаються ім'я та прізвище/по батькові.
"""
import csv, json, os, re
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'facts', 'baza', 'src_documents.csv')

def docs_and_people():
    seed = json.load(open(os.path.join(ROOT, 'seed', 'seed.json'), encoding='utf-8'))
    D = {d['id']: dict(d) for d in seed.get('documents', [])}
    P = {p['id']: dict(p) for p in seed.get('persons', [])}
    for it in json.load(open(os.path.join(ROOT, 'seed', 'import', 'manifest.json'), encoding='utf-8')):
        k, i, data = it.get('kind'), it.get('id'), it.get('data') or {}
        if k == 'doc': D[i] = {'id': i, **data}
        elif k == 'docpatch' and i in D: D[i].update(data)
        elif k == 'person': P[i] = {'id': i, **data}
        elif k == 'personpatch' and i in P and isinstance(it.get('data'), dict): P[i].update({a: b for a, b in it['data'].items() if isinstance(b, (str, int, list))})
    return D, P

CAP = r"[А-ЯІЇЄҐЁѲѢ][а-яіїєґёѳѣъьʼ'’-]+"
PATR = re.compile(r"(ов|ев|ёв|ѣв|ин|ова|ева|ина|овна|евна|ична|ович|евич|ич)$")
STOP = set("""Св Святых Святого Святой Таинствами Таинство Покровской Троицкой Рождества Христова Церкви Церковь Церковной Божией Господа Бога Богородицы
Января Февраля Марта Апреля Мая Июня Июля Августа Сентября Октября Ноября Декабря Губернии Уезда Уѣзда Волости Села Деревни Хутора Черниговской Козелецкаго
Козелецкого Вороньки Вороньков Веприка Веприк Веприцкий Вороньковский Свидовца Козацкаго Быкова Апраксина Графа Графъ Кочубея Разумовскаго Малороссийской
Православного Православнаго Священник Священникъ Диакон Пономарь Дьячек Крестьянин Крестьянка Мещанин Казак Козак Солдат Солдатка Вдова Вдовец Девица Отставной
Запасной Рядовой Унтер Его Ея Их Сын Дочь Жена Законная Родился Родилась Крещен Умер Умерла Венчаны Жених Невеста Восприемники Поручители Свидетели
Таинство Причащен Исповедан Напутствован Год Лет Года Рядовый Ново Нового Старого Басанской Сотни Полку Полка Переяславского Киевского Ниженского Нежинского
Подданный Подданная Подданого Житель Жители Жительница Собственник Собственника Владения Звания Посполитого Посполитый Иван Ивана""".split()) - {'Иван', 'Ивана'}
ROLE = [('восприемни', 'хрещений/хрещена'), ('поручител', 'поручитель'), ('свидетел', 'свідок'), ('священник', 'священик'), ('диакон', 'диякон'),
        ('псаломщик', 'псаломщик'), ('пономар', 'паламар'), ('дьяч', 'дяк'), ('жена его', 'дружина'), ('жена', 'дружина'), ('законная жена', 'дружина'),
        ('сын', 'син'), ('дочь', 'дочка'), ('дочер', 'дочка'), ('вдова', 'вдова'), ('вдовец', 'вдівець'), ('жених', 'наречений'), ('невеста', 'наречена'),
        ('девица', 'дівиця'), ('умерш', 'померлий'), ('родител', 'батьки'), ('мать', 'мати'), ('отец', 'батько'), ('брат', 'брат'), ('сестра', 'сестра')]

def role_of(ctx):
    c = ctx.lower(); best, pos = '', -1
    for k, r in ROLE:
        i = c.rfind(k)
        if i > pos: best, pos = r, i
    return best

def frame(src):
    m = re.search(r'кадр[и]?\s*(\d+)', src or ''); return m.group(1) if m else ''

def main():
    D, P = docs_and_people()
    rows, seen = [], set()
    for d in D.values():
        txt = ' '.join(str(d.get(k) or '') for k in ('line', 'text'))
        quotes = re.findall(r'«([^»]{3,})»', txt)
        if not quotes: continue
        yr = (re.search(r'(1[6-9]\d\d)', str(d.get('date') or '')) or [None, ''])[1] if d.get('date') else ''
        linked = [P[x] for x in d.get('people', []) if x in P]
        for q in quotes:
            q2 = q.replace('ъ ', ' ').replace('ъ,', ',')
            for m in re.finditer(rf"({CAP})\s+({CAP})(?:\s+({CAP}))?", q2):
                w1, w2, w3 = m.group(1), m.group(2), m.group(3) or ''
                w1c, w2c, w3c = (w.rstrip('ъ') for w in (w1, w2, w3))
                if w1c in STOP or len(w1c) < 3 or '-' in w1c or re.search(r'(ская|ский|скій|ское|ская)$', w1c.lower()): continue
                if w2c.endswith('-') or re.search(r'(ская|ский|скій|ское)$', w2c.lower()): continue
                if PATR.search(w2c.lower()) and w2c not in STOP:
                    name, patr, sur = w1c, w2c, (w3c if w3c and w3c not in STOP else '')
                elif w2c not in STOP and len(w2c) > 2 and not w3:
                    name, patr, sur = w1c, '', w2c
                else:
                    continue
                age = (re.match(r"\s*,?\s*(\d{1,3})\s*(?:лет|л\.|год|г\.|р\.)", q2[m.end():]) or [None, ''])[1]
                ctx = q2[max(0, m.start() - 60):m.start()]
                sex = 'ж' if re.search(r'(ова|ева|ина|овна|евна|ична|ая)$', (patr or sur).lower()) else 'ч'
                key = (d['id'], name, patr, sur)
                if key in seen: continue
                seen.add(key)
                tid = ''
                for p in linked:
                    nm = str(p.get('n') or '').lower()[:3]; sn = str(p.get('s') or '')[:4].lower()
                    if nm and (name.lower()[:3] == nm or name.lower()[:2] == nm[:2]) and (not sur or sur.lower()[:4] == sn or (p.get('m') or '')[:4].lower() == sur.lower()[:4]):
                        tid = p['id']; break
                rows.append([d.get('place') or '', sur, name, patr, sex, age, yr, '', role_of(ctx), '', '', frame(d.get('src')), '',
                             f"{d.get('title') or ''} [{d['id']}]", d['id'], tid, (d.get('url') or '')])
    rows.sort(key=lambda r: (r[1], r[2], r[6]))
    with open(OUT, 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f, delimiter=';', lineterminator='\n')
        w.writerow(['село', 'прізвище', "ім'я", 'по батькові', 'стать', 'вік', 'рік', 'двір', 'роль', 'заняття', 'господарство', 'кадр', 'аркуш', 'примітка', 'документ', 'код у дереві', 'посилання'])
        w.writerows(rows)
    print('рядків:', len(rows), 'документів з цитатами:', len({r[14] for r in rows}), 'прив\'язано до карток:', sum(1 for r in rows if r[15]))
    print('прізвища:', Counter(r[1] for r in rows).most_common(20))

if __name__ == '__main__':
    main()
