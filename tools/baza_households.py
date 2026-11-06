#!/usr/bin/env python3
"""Переводить подвірні нотатки (Рум'янцевський опис 1767, перепис 1782 тощо) у рядки «Бази»: одна людина — один рядок.

Формат нотаток (по рядку на двір):
  Двір 75 (арк.355зв-358зв): 1 хата Яким Шутий 64 (жена Тетяна Дмитрівна 58 з Вороньків); син Григорій 35 (...); ... Батько Тиміш Шутий. Господарство: ...
Діти в дужках після людини отримують її прізвище; без прізвища — прізвище двору (голова двору, «Батько …» або «Покійний …»).

  python3 tools/baza_households.py <нотатки.txt> <вихід.csv> <село> <рік> [«назва джерела»]
"""
import csv, re, sys

ROLES = {'жена': 'дружина', 'сини': 'син', 'син': 'син', 'дочки': 'дочка', 'дочка': 'дочка', 'брат': 'брат', 'брати': 'брат', 'сестра': 'сестра',
         'зять': 'зять', 'підсусідок': 'підсусідок', 'підсусідки': 'підсусідок', 'підсусідка': 'підсусідка', 'наймит': 'наймит', 'наймити': 'наймит',
         'служниця': 'служниця', 'служитель': 'служитель', 'мати': 'мати', 'невістка': 'невістка', 'невістка-вдова': 'невістка, вдова', 'вдова': 'вдова',
         'онук': 'онук', 'онука': 'онука', 'теща': 'теща', 'своячок': 'своячок', 'свояк': 'свояк', 'свояки': 'свояк', 'своячка': 'своячка', 'братанич': 'братанич',
         'племінники': 'племінник', 'шурин': 'шурин', 'бабуся': 'бабуся', 'родичі': 'родич', 'дівка': 'наймичка', 'діти': 'дитина', 'пономар': 'паламар',
         'сусідка': 'сусідка', 'хата': '', 'покійний': 'покійний', 'батько': 'покійний батько', 'батьки': 'покійний батько', 'тесть': 'тесть'}
FEM = {'вдова', 'дружина', 'дочка', 'сестра', 'мати', 'невістка', 'невістка, вдова', 'онука', 'теща', 'служниця', 'своячка', 'бабуся', 'наймичка', 'підсусідка', 'сусідка'}
MASC_A = {'Микита', 'Никита', 'Сава', 'Хома', 'Кузьма', 'Ілля', 'Лука', 'Фома', 'Мако', 'Яцько', 'Грицько', 'Терешко', 'Лесько', 'Онисько', 'Тишко', 'Харко', 'Демко', 'Панько', 'Євко', 'Ковпа'}
NAME = r"[А-ЯІЇЄҐ][а-яіїєґʼ'’-]+"
TOK = re.compile(rf"({NAME})(?:\s+({NAME}))?(?:\s+({NAME}))?(\(\?\))?\s+(\d{{1,3}})(\(\?\))?")
PATR = re.compile(r"(ович|евич|івна|ївна|овна|ична|ич)$")

def sex_of(name, role):
    if role in FEM: return 'ж'
    if role in ('син', 'брат', 'зять', 'наймит', 'служитель', 'онук', 'своячок', 'свояк', 'братанич', 'шурин', 'тесть', 'племінник', 'підсусідок', 'покійний', 'покійний батько'): return 'ч'
    return 'ж' if re.search(r'[ая]$', name) and name not in MASC_A else 'ч'

def parse(line):
    m = re.match(r'\s*Двір\s+(\S+)\s*\(([^)]*)\)\s*:\s*(.*)$', line)
    if not m: return None, []
    dvir, ark, body = m.group(1), m.group(2), m.group(3)
    econ = ''
    em = re.search(r'Господарство:\s*(.*?)(?:\.\s*[А-ЯІЇЄ]|$)', body)
    if em: econ = em.group(1).strip().rstrip('.'); body = body[:em.start()] + body[em.end() - 1 if em.group(0).endswith(tuple('АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЮЯ')) else em.end():]
    # прізвище двору: «Батько/Покійний Ім'я Прізвище» або перший «Ім'я Прізвище вік»
    hs = ''
    bm = re.search(rf"(?:Батько|Покійний|покійний)\s+({NAME})\s+({NAME})", body)
    if bm: hs = bm.group(2)
    people, depth_sur, depth_role, cur = [], [], [], {'s': hs, 'role': 'голова двору'}
    i, first = 0, True
    role, last_sur = 'голова двору', hs
    # проходимо текст по символах-розділювачах, відстежуючи дужки й слова-ролі
    pos = 0
    for tm in re.finditer(rf"\(|\)|;|{TOK.pattern}|(?<![А-Яа-яіїєґ'’])(жена|сини|син|дочки|дочка|брати|брат|сестра|зять|підсусідки|підсусідок|підсусідка|наймити|наймит|служниця|служитель|мати|невістка-вдова|невістка|вдова|онук|онука|теща|своячок|свояки|свояк|своячка|братанич|племінники|шурин|бабуся|родичі|дівка|діти|пономар|сусідка|хата|Покійний|покійний|Батько|Батьки|Тесть|тесть)(?![а-яіїєґ'’])", body):
        t = tm.group(0)
        if t == '(':
            depth_sur.append(last_sur); depth_role.append(role); role = 'дитина'; continue
        if t == ')':
            last_sur = depth_sur.pop() if depth_sur else hs; role = depth_role.pop() if depth_role else role; continue
        if t == ';':
            role = '' if not depth_sur else role; continue
        w = t.lower()
        if w in ROLES and not TOK.fullmatch(t):
            role = ROLES[w] if ROLES[w] else role; continue
        g = TOK.match(t)
        if not g: continue
        n, a2, a3, q1, age, q2 = g.groups()
        if n.lower() in ROLES or n in ('Яцько',) and False: continue
        patr, sur = '', ''
        for x in (a2, a3):
            if not x: continue
            if PATR.search(x): patr = x
            elif x.lower() not in ROLES: sur = x
        r = role or ('голова двору' if first else '')
        if r in ('покійний', 'покійний батько'): continue
        if sur: last_sur = sur
        s_use = sur or (depth_sur[-1] if depth_sur and r in ('дитина', 'син', 'дочка', 'дружина') else (last_sur if r in ('дружина', 'син', 'дочка', 'дитина', 'брат', 'сестра', 'онук', 'онука', 'невістка', 'мати', 'вдова', 'голова двору') else ''))
        if not s_use and first: s_use = hs
        if first and not hs and sur: hs = sur
        if r == 'дружина' and depth_sur: s_use = depth_sur[-1] or s_use
        people.append({'s': s_use, 'n': n, 'pt': patr, 'sex': sex_of(n, r), 'age': age + ('(?)' if q2 else ''), 'role': r or 'член двору', 'q': '(?)' if q1 else ''})
        first = False
        if r == 'дружина': role = 'дитина' if depth_sur else ''
    for p in people: p.update(dvir=dvir, ark=ark)
    if people and econ: people[0]['econ'] = econ
    return dvir, people

def main(src, out, village, year, title=''):
    rows = []
    for line in open(src, encoding='utf-8'):
        d, ps = parse(line)
        for p in ps:
            rows.append([village, p['s'] + p['q'], p['n'], p['pt'], p['sex'], p['age'], year, p['dvir'], p['role'], '', p.get('econ', ''), '', p['ark'],
                         'прізвище для родини — за головою двору (у джерелі прізвища жінок і дітей часто не писали)' if p['role'] not in ('голова двору',) and p['s'] else ''])
    with open(out, 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f, delimiter=';', lineterminator='\n')
        w.writerow(['село', 'прізвище', "ім'я", 'по батькові', 'стать', 'вік', 'рік', 'двір', 'роль', 'заняття', 'господарство', 'кадр', 'аркуш', 'примітка'])
        w.writerows(rows)
    print('людей:', len(rows), 'дворів:', len({r[7] for r in rows}))

if __name__ == '__main__':
    main(*sys.argv[1:])
