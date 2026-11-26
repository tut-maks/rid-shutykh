"""Імпорт 26.11.2026 (6): Яніна Леонідівна підтвердила (передав Максим), що Анастасія (нар. 21.11.1919, Ємилівка,
метрика Топорища № 154) — старша сестра Франки. Нова картка, документ прив'язано, «Припущення» й «Історія роду» оновлено."""
import json
R = '/home/claude/rid-shutykh/'
MAN = R + 'seed/import/manifest.json'
m = json.load(open(MAN)); have = {it.get('key') for it in m}; new = []
def add(it):
    if it['key'] not in have: new.append(it)
W = 'за словами Яніни Леонідівни (передав Максим, 26.11.2026)'

add({'key': 'ser-p-anastasiia', 'kind': 'person', 'id': 'anastasiia_ser', 'data': {
  'n': 'Анастасія', 'pt': 'Ігнатівна', 's': 'Сержанська', 'sex': 'f', 'f': 'ignat_ser', 'mo': 'marta_ser', 'fam': ['derhach'],
  'b': '21.11.1919', 'bp': 'д. Ємилівка (парафія костелу м. Топорище)',
  'note': 'Народилася 21 листопада 1919 р. в д. Ємилівка. Метрика римо-католицького костелу м. Топорище: «154 | 21 Ноябр. 1919 г. | Анастасія | д. Эмиловка | Игнатій и Марианна изъ Кабатовъ Сержанскіе» ([[d:top19anast|скан, № 154]]).\n\nСтарша сестра [[p:franya|Франки Ігнатівни]] — ' + W + '. У метриці мати названа «Марианна», у радянському свідоцтві Франки — «Марта».\n\nПодальша доля невідома.'}})
add({'key': 'ser-dp-anastasiia', 'kind': 'docpatch', 'id': 'top19anast', 'data': {
  'people': ['ignat_ser', 'marta_ser', 'anastasiia_ser'],
  'text': 'Найдавніший знайдений запис про дітей [[p:ignat_ser|Ігнатія]] й [[p:marta_ser|Марти (Марианни)]] Сержанських з Ємилівки: римо-католицька (польська) парафія Топорище. Що [[p:anastasiia_ser|Анастасія]] — старша сестра [[p:franya|Франки]], ' + W + '. У радянському свідоцтві Франки (запис 1979 р.) мати названа «Марта», тут — «Марианна».'}})

hy = json.loads(json.dumps([x for x in m if x['kind'] == 'text' and x['id'] == 'hyps'][-1]['value']))
for it in hy['items']:
    if it['id'] == 'ser-anastasiia-1919':
        it['people'] = ['ignat_ser', 'marta_ser', 'franya', 'anastasiia_ser']
        it['basis'] = it['basis'].replace(' Якщо підтвердиться, Анастасія — старша сестра Франки. Запитати Яніну Леонідівну про Анастасію.',
          ' Що [[p:anastasiia_ser|Анастасія]] (1919) — старша сестра Франки, ' + W + '; отже, запис 1919 р. — про батьків Франки. Чи Юліана (1904) — теж їхня дочка, ще не підтверджено.')
        assert 'старша сестра Франки, ' + W in it['basis']
add({'key': 'hyps-anastasiia-ser', 'kind': 'text', 'id': 'hyps', 'value': hy})

md = [x for x in m if x['kind'] == 'text' and x['id'] == 'history'][-1]['value']['md']
A = 'дочка Анастасія ([[d:top19anast|№ 154]]).'
assert md.count(A) == 1
md = md.replace(A, 'дочка [[p:anastasiia_ser|Анастасія]] ([[d:top19anast|№ 154]]); що Анастасія — старша сестра Франки, ' + W + '.')
add({'key': 'text-history-anastasiia', 'kind': 'text', 'id': 'history', 'value': {'md': md, 'updated': '2026-11-26'}})
m.extend(new); json.dump(m, open(MAN, 'w'), ensure_ascii=False, indent=1)
print('додано:', [i['key'] for i in new])
