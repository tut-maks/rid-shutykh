"""Імпорт на сайт документів «Пам'яті народу», знайдених 07.11.2026 (facts/pn_new, pn_new2, pn_vasyli).
Створює файли в seed/import/ (скан + мініатюра -t.jpg 420 px) і додає пункти doc / personpatch у manifest.
Повторний запуск безпечний: пункти з тим самим key не дублюються."""
import json, re, os, shutil
from PIL import Image

R = '/home/claude/rid-shutykh/'
MAN = R + 'seed/import/manifest.json'
IMP = R + 'seed/import/'
m = json.load(open(MAN))
have = {it.get('key') for it in m}
P = {}
for p in json.load(open(R + 'seed/seed.json'))['persons']:
    P[p['id']] = dict(p)
for it in m:
    if it.get('kind') == 'person':
        P[it['id']] = dict(P.get(it['id'], {}), **it['data'])

def full(pid):
    v = P[pid]
    return ' '.join(x for x in [v.get('n', ''), v.get('pt', ''), v.get('s', '')] if x)

def year(pid):
    b = str(P[pid].get('b', ''))
    y = re.findall(r'1[89]\d\d', b)
    return y[0] if y else ''

TYPES = [
    ('Зведена картка', 'Зведена картка «Пам\'яті народу»'), ('уточняющий потери', 'Документ, що уточнює втрати'),
    ('Поіменний список поховання', 'Список поховання'), ('Список похованих', 'Список поховання'),
    ('уточнює втрати', 'Документ, що уточнює втрати'), ('Донесение о безвозвратных', 'Донесення про безповоротні втрати'),
    ('Список безповоротних', 'Список безповоротних втрат'), ('Облікова картотека', 'Облікова картотека втрат'),
    ('обліковій картотеці', 'Облікова картотека втрат'), ('Зведена картка', 'Зведена картка «Пам\'яті народу»'),
    ('Ювілейна картотека', 'Ювілейна картотека нагород'), ('Іменний список', 'Іменний список частини'),
    ('Наказ про виключення', 'Наказ про виключення зі списків'), ('Нагородний лист', 'Нагородний лист'),
    ('Наказ №', 'Наказ про нагородження'), ('реєстраційна картка', 'Картка пересильного пункту'),
    ('Реєстраційна картка', 'Картка пересильного пункту'), ('ВПП', 'Військово-пересильний пункт'),
]

def dtype(desc):
    for k, v in TYPES:
        if k in desc:
            return v
    return 'Документ «Пам\'яті народу»'

def put_file(src, name):
    dst = IMP + name
    im = Image.open(src).convert('RGB')
    if not os.path.exists(dst):
        im.save(dst, quality=92)
    t = im.copy(); t.thumbnail((420, 420)); t.save(IMP + name.replace('.jpg', '-t.jpg'), quality=85)

new = []

def add_doc(key, did, files, title, date, src, url, line, text, people, marks=None):
    if key in have:
        return
    d = {'title': title, 'place': '', 'src': src, 'url': url, 'line': line, 'text': text, 'people': people}
    if date:
        d['date'] = date
    if marks:
        d['marks'] = marks
    new.append({'key': key, 'kind': 'doc', 'id': did, 'files': [{'file': f, 'thumb': f.replace('.jpg', '-t.jpg')} for f in files], 'data': d})

HYP = 'Є припущення, що це [[p:{pid}|{name}]] — на підставі імені, по батькові, прізвища й села (рік народження в базі може відрізнятися на 1–2 роки).'

# --- 1. facts/pn_new/items.md (ранкова порція) ---
for l in open(R + 'facts/pn_new/items.md'):
    if not l.startswith('- pn_'):
        continue
    parts = [p.strip() for p in l[2:].split('|')]
    if len(parts) < 4:
        continue
    fn = parts[0].split(' ')[0]; url = parts[1]; pid = parts[2]; desc = '|'.join(parts[3:]).strip()
    if pid not in P or '❓' in parts[2] or 'НОВИЙ' in parts[2]:
        continue
    if not os.path.exists(R + 'facts/pn_new/' + fn):
        continue
    slug = fn[3:-4].replace('_', '-')
    name = 'pn7-' + slug + '.jpg'
    put_file(R + 'facts/pn_new/' + fn, name)
    t = dtype(desc)
    add_doc('pn7-' + slug, 'pn7' + slug.replace('-', ''), [name], '%s: %s (%s)' % (t, full(pid), year(pid)), '',
            'База «Память народа» (pamyat-naroda.ru), скан/картка бази; вивантажено 07.11.2026.', url,
            re.sub(r'\*\*', '', desc), HYP.format(pid=pid, name=full(pid)), [pid])

# --- 2. pn_new2 і pn_vasyli: метадані + рамки ---
SKIP = {'17758997', '31972171', '40673716', '1052984131', '1989973154', '1990428527', '13583795'}
NOTES = {}
for l in open(R + 'facts/pn_new2/items.md'):
    mm = re.search(r'heroes/[a-z\-_]+?(\d+)/ \| (\w+) \| (.*)', l)
    if mm:
        NOTES[mm.group(1)] = (mm.group(2), mm.group(3))
for base, metaf, rowsf in [('pn_new2', 'meta.json', 'rows.json'), ('pn_vasyli', 'meta.json', None)]:
    meta = json.load(open(R + 'facts/%s/%s' % (base, metaf)))
    rows = json.load(open(R + 'facts/%s/%s' % (base, rowsf))) if rowsf else {}
    for did, v in meta.items():
        if did in SKIP:
            continue
        if base == 'pn_vasyli':
            if did != '61590114':
                continue
            pid = 'r8_vasyl_l'
        else:
            pid = v['who']
        if pid not in P:
            continue
        files, marks = [], []
        for i, p in enumerate(v['pages']):
            fn = ('pn_%s_%s_p%s.jpg' % (v['who'], did, p['pos'])) if base == 'pn_new2' else ('v_%s_p%s.jpg' % (did, p['pos']))
            srcf = R + 'facts/%s/%s' % (base, fn)
            if not os.path.exists(srcf):
                continue
            name = 'pn7-%s-p%s.jpg' % (did, p['pos'])
            put_file(srcf, name)
            files.append(name)
            box = rows.get(fn)
            if not box and base == 'pn_vasyli':
                src = p.get('src') or ''
                mm = re.search(r'<s c="(\d+),(\d+),(\d+),(\d+)" id="%s"' % did, src)
                iw = re.search(r'w="(\d+)" h="(\d+)"', src)
                if mm and iw:
                    W, H = int(iw.group(1)), int(iw.group(2))
                    x, y, w, h = map(int, mm.groups())
                    box = [round(x / W, 4), round(y / H, 4), round(w / W, 4), round(h / H, 4)]
            if box and box[3] < 0.5:
                marks.append({'p': len(files) - 1, 'x': box[0], 'y': box[1], 'w': box[2], 'h': box[3]})
        if not files:
            continue
        txt = v.get('txt', '')
        t = txt.split(' Дата рождения')[0]
        kind = dtype(t + ' ' + v.get('type', ''))
        if 'nagrazhdenie' in v.get('type', '') or 'Наградной документ' in txt:
            kind = 'Наказ про нагородження'
        if 'Печатная Книга Памяти' in txt:
            kind = 'Книга пам\'яті'
        if 'Военно-пересыльные' in txt:
            kind = 'Військово-пересильний пункт / запасний полк'
        dm = re.search(r'Дата документа: (\d\d\.\d\d\.\d{4})', txt)
        note = NOTES.get(did, ('', ''))[1]
        if base == 'pn_vasyli':
            note = ('Рядок №19 (зчитано зі скану): «Шутый Василий Леонтьевич, солдат, стрелок, 1914, Черниговская обл., с. Вороньки; '
                    'Октябрьским РВК г. Днепропетровска 6 ноября 1943 г.; связь прекратилась в ноябре 1943 года, часть не установлена, '
                    'можно считать пропавшим без вести в мае 1944 года»; дружина — Майстренко Наталія Антонівна, м. Дніпропетровськ, '
                    'вул. Короленківська, 47, кв. 8. Рішення — Жовтневий райвійськкомат м. Дніпропетровська, 6.11.1947.')
        line = re.sub(r'\*\*', '', note) + (' Поля бази: ' + re.sub(r'\s*О документе$', '', txt) if txt else '')
        add_doc('pn7-' + did, 'pn7d' + did, files, '%s: %s (%s)' % (kind, full(pid), year(pid)), dm.group(1) if dm else '',
                'База «Память народа» (pamyat-naroda.ru), скан в оригінальній роздільності з cdn сайту; вивантажено 07.11.2026.',
                'https://pamyat-naroda.ru/heroes/%s%s/' % (v.get('type','memorial-chelovek_dopolnitelnoe_donesenie'), did), line, HYP.format(pid=pid, name=full(pid)), [pid], marks)

# --- 3. війна на картці Василя Леонтійовича ---
k = 'pn7-war-r8_vasyl_l'
if k not in have:
    new.append({'key': k, 'kind': 'personpatch', 'person': 'r8_vasyl_l', 'set': {'war': {'w': 'ww2', 'f': 'mis', 'h': True}}})
k = 'pn7-note-r8_vasyl_l'
if k not in have:
    new.append({'key': k, 'kind': 'personpatch', 'person': 'r8_vasyl_l', 'append':
                'Є припущення (на підставі імені, по батькові, року й села): це «Шутый Василий Леонтьевич», 1914 р. н., з Вороньків, '
                'призваний Жовтневим РВК м. Дніпропетровська 6.11.1943; зв\'язок з ним припинився в листопаді 1943 р., у травні 1944 р. '
                'визнаний таким, що пропав безвісти; дружина — Наталія Антонівна Майстренко, Дніпропетровськ ([[d:pn7d61590114|документ]]).'})

m.extend(new)
json.dump(m, open(MAN, 'w'), ensure_ascii=False, indent=1)
print('додано пунктів:', len(new))
for it in new:
    print(it['key'], it.get('data', {}).get('title', '') if it['kind'] == 'doc' else it['kind'])
