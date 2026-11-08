"""gwar.mil.ru (Перша світова) → facts/baza/src_gwar_ww1.csv: усі записи з Козелецького й Остерського повітів, що знайшлися
пошуком за прізвищами дерева і за Вороньківською / Ново-Басанською / Бобровицькою волостями (08.11.2026)."""
import json, csv, re, sys
d = json.load(open(sys.argv[1] if len(sys.argv) > 1 else '/tmp/gw.json'))
def bp(x): return ', '.join(v for v in [x.get('birth_place_gubernia'), x.get('birth_place_uezd'), x.get('birth_place_volost'), x.get('birth_place')] if v)
VIL = [('Веприк', 'Веприк'), ('Вопровк', 'Веприк'), ('Венрик', 'Веприк'), ('Свидов', 'Свидовець'), ('Сведов', 'Свидовець'), ('Озеря', 'Озеряни'), ('Озерен', 'Озеряни'),
       ('Александров', 'Олександрівка'), ('Пусто', 'Пустотин'), ('Лидин', 'Лідин'), ('Вороньки', 'Вороньки'), ('Воронки', 'Вороньки'), ('Вороньково', 'Вороньки'),
       ('Бобровиц', 'Бобровиця'), ('Ново-Бас', 'Нова Басань'), ('Новая Басань', 'Нова Басань'), ('Басань Новая', 'Нова Басань')]
VOL = [('Вороньк', 'Вороньківська вол.'), ('Воронков', 'Вороньківська вол.'), ('Ново-Басан', 'Ново-Басанська вол.'), ('Бобровиц', 'Бобровицька вол.'), ('Щастнов', 'Щастнівська вол.')]
T = {'chelovek_gospital': 'картотека втрат', 'chelovek_donesenie': 'іменний список втрат', 'chelovek_nagrazhdenie': 'нагородження', 'chelovek_plen': 'полон'}
rows = []
for k, v in d.items():
    x = v['src']; s = bp(x)
    if not re.search('Козел|Остер', s): continue
    loc = x.get('birth_place') or ''
    vil = next((n for a, n in VIL if a in loc), '') or next((n for a, n in VOL if a in s), '') or s.split(', ')[-1]
    ev = ' – '.join(dict.fromkeys(z for z in [x.get('event_date_from'), x.get('event_date_to')] if z))
    note = '; '.join(z for z in [
        'Місце: ' + s, 'Доля: ' + (x.get('vibitie_prichina') or '—') + (' ' + ev if ev else ''),
        ('Де: ' + (x.get('vibitie_mesto') or x.get('event_place'))) if (x.get('vibitie_mesto') or x.get('event_place')) else '',
        'Документ: ' + (x.get('doc_type') or T.get(v['t'], v['t'])), (x.get('archive_short') or 'РГВИА'),
        'gwar.mil.ru №' + k, 'https://gwar.mil.ru/heroes/' + v['t'] + k + '/'] if z)
    rows.append([vil, x.get('last_name') or '', x.get('first_name') or '', x.get('middle_name') or '', 'ч', '', '1914–1917', '',
                 'Перша світова: ' + T.get(v['t'], v['t']), ' '.join(z for z in [x.get('rank'), x.get('military_unit_name') or x.get('document_author')] if z), '', k, '', note])
rows.sort(key=lambda r: (r[0], r[1], r[2], r[3]))
with open('/home/claude/rid-shutykh/facts/baza/src_gwar_ww1.csv', 'w', newline='') as f:
    w = csv.writer(f, delimiter=';'); w.writerow(["село", "прізвище", "ім'я", "по батькові", "стать", "вік", "рік", "двір", "роль", "заняття", "господарство", "кадр", "аркуш", "примітка"]); w.writerows(rows)
print(len(rows))
