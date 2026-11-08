"""Дрезден (StSG), база «Радянські військовополонені»: скріншоти записів з наших сіл → документ; абзац в «Історії роду» (08.11.2026)."""
import json
from PIL import Image
R = '/home/claude/rid-shutykh/'; MAN = R + 'seed/import/manifest.json'; IMP = R + 'seed/import/'
S = '/tmp/claude-tool-results/264018d5-870a-50e5-8291-5e95e7710f28/mcp-claude-in-chrome-blob-'
SH = [S + '1794099589690-sg3pwk-f5684c89.jpg', S + '1794099596977-nagtb8-c542317f.jpg', S + '1794099604701-u9e81t-8e8ad097.jpg', S + '1794099612521-111zdf-b260bc5c.jpg']
CROP = [(500, 55, 1290, 707), (500, 0, 1290, 600), (500, 0, 1290, 707), (500, 0, 1290, 460)]
m = json.load(open(MAN)); have = {x.get('key') for x in m}
files = []
for i, (p, c) in enumerate(zip(SH, CROP)):
    fn = 'dres811_%d.jpg' % (i + 1); im = Image.open(p).convert('RGB').crop(c); im.save(IMP + fn, quality=92)
    t = im.copy(); t.thumbnail((420, 420)); t.save(IMP + fn.replace('.jpg', '-t.jpg'), quality=85); files.append({'file': fn, 'thumb': fn.replace('.jpg', '-t.jpg')})
ALL = {'x': 0.0, 'y': 0.0, 'w': 1.0, 'h': 1.0}
LINE = ('Записи бази (прізвище, ім\'я, по батькові — у німецькій транслітерації; дата народження; дата смерті; місце народження; № запису): '
        '«Schutyj Nikolaj Grigorij», 27.01.1923, «Woronki, Gebiet Tschernigow», № 558585; '
        '«Onoschko Semen Nikita», 15.09.1908, «Tschernigowskaja.Woronki», № 425464; '
        '«Gorowoj Wladimir Fjodor», 17.06.1918, помер 09.07.1942, «Weprik» (№ 303736) і «Weprik, Gebiet Poltawa» (№ 517785); '
        '«Turtschin Andrej Iossif», 1912, помер 15.10.1942, «Woronki», № 261005; '
        '«Lawrinenko Stepan Semen», 18.03.1914, «Tschernigowskaja, Weprik», № 418418; '
        '«Kolesnik Wassilij», 17.02.1919, «Woronki», № 743697; «Kolesnik Wassilij (Iwan)», 28.02.1922, помер 22.04.1942, «Woronki», № 774423 і 263203; '
        '«Jazenko Alexandr Alexej», 15.03.1921, помер 01.12.1941, «Swidowez, Gebiet Tschernigow», № 660489; '
        '«Jazenko Andrej Sergej», 29.11.1913, «N.Basan», № 428807; '
        '«Woloschok Alexandr Andrej», 02.07.1919, помер 07.11.1941, «Oserjany, Gebiet Tschernigow», № 625217.')
TEXT = ('Це радянські військовополонені, яких тримали в таборах на території Німеччини; база не пише, хто повернувся. У дереві цих людей поки немає. '
        'Шутий Микола Григорович, 27.01.1923, — та сама дата народження, що й у «SCHUTIJ Nikolaj» в Arolsen; Є припущення, що це одна людина — на підставі імені й дати. '
        'Чиї вони сини — шукати в записах ЗАГС 1908–1923 рр. Скріншоти зроблено зі сторінки бази 08.11.2026 (записи зібрано пошуком за прізвищами на одну сторінку й розгорнуто).')
if 'dres811' not in have:
    m.append({'key': 'dres811', 'kind': 'doc', 'id': 'dres811', 'files': files, 'data': {
        'title': 'Радянські військовополонені з наших сіл (база Документаційного центру Дрезден)', 'date': '1941–1945', 'place': 'Вороньки, Веприк, Свидовець, Озеряни, Нова Басань',
        'src': 'Stiftung Sächsische Gedenkstätten, Dokumentationsstelle Dresden — база «Радянські військовополонені» (табори на території Німецького Райху)',
        'url': 'https://en.stsg.de/cms/dokstelle/search-online-archives/soviet-prisoners-war', 'line': LINE, 'text': TEXT, 'people': [],
        'marks': [{'p': i, **ALL} for i in range(4)], 'maybe': True}})
if 'dres811-text-history' not in have:
    H = [x for x in m if x['kind'] == 'text' and x.get('id') == 'history'][-1]; md = H['value']['md']
    A = '## Як жили: земля, млини, худоба (1767–1782)'
    SEC = ('### У німецькому полоні (1941–1945)\n\n'
           'У базі радянських військовополонених Документаційного центру Дрезден (табори на території Німеччини) записані люди з наших сіл ([[d:dres811|скріншоти]]): '
           'з Вороньків — Микола Григорович Шутий (27.01.1923), Семен Микитович Оношко (15.09.1908), Андрій Йосипович Турчин (1912, помер у полоні 15.10.1942), Василь Колесник (17.02.1919) і Василь Іванович Колесник (28.02.1922, помер 22.04.1942); '
           'з Веприка — Володимир Федорович Горовий (17.06.1918, помер 9.07.1942) і Степан Семенович Лавриненко (18.03.1914); '
           'зі Свидовця — Олександр Олексійович Яценко (15.03.1921, помер 1.12.1941); з Озерян — Олександр Андрійович Волошок (2.07.1919, помер 7.11.1941); з Нової Басані — Андрій Сергійович Яценко (29.11.1913). '
           'У дереві їх поки немає; чиї вони сини — шукаємо. Повні картки полонених (табір, номер, часто фото) бувають в ОБД «Мемориал» (розділ «Картотека военнопленных»).\n\n')
    assert A in md and '### У німецькому полоні' not in md
    v = dict(H['value']); v['md'] = md.replace(A, SEC + A, 1)
    m.append({'key': 'dres811-text-history', 'kind': 'text', 'id': 'history', 'value': v})
json.dump(m, open(MAN, 'w'), ensure_ascii=False, indent=1); print('ok')
