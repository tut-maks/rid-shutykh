# Знімки сторінок-джерел «Історії сіл» (07.11.2026): на випадок, якщо сайт зникне. Кожен знімок — документ «Знімок сторінки: …» з url;
# на сторінці «Історія сіл» біля посилання з'являється «📷 знімок». Портрети відомих людей і російська символіка на знімках закриті / обрізані.
import json, os, re, urllib.parse
from PIL import Image, ImageDraw
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/'
SH = '/tmp/shots/'
BLANK = {  # (x0,y0,x1,y1) у кадрі 800x1000
 '18': [(470, 134, 638, 380), (470, 664, 638, 900)],               # портрети (Вікіпедія)
 '21': [(450, 236, 626, 428), (166, 746, 268, 842), (266, 746, 362, 842)],
 '17': [(0, 34, 100, 1000)],                                        # мініатюри слайдів
 '01': [(0, 66, 120, 120), (650, 0, 800, 126)], '03': [(0, 66, 120, 120), (650, 0, 800, 126)],
 '05': [(0, 66, 120, 120), (650, 0, 800, 126)], '09': [(0, 66, 120, 120), (650, 0, 800, 126)],  # радянська емблема й реклама (igsu)
}
CROP = {'61': (110, 110, 690, 1000)}  # soldat.ru — лише текст зведень, без банерів і символіки
rows = [l.strip().split('|', 1) for l in open(SH + 'map.txt') if '|' in l]
by = {}
for k, u in rows:
    n = k.split('_')[0]; by.setdefault(n, {'url': u.split('#')[0], 'k': []})['k'].append(k)
m = json.load(open(R + 'seed/import/manifest.json')); have = {i['key'] for i in m}; add = 0
for n, x in sorted(by.items()):
    key = 'shot7-' + n
    if key in have: continue
    F = []
    for j, k in enumerate(sorted(set(x['k']), key=lambda s: (len(s), s))):
        im = Image.open(SH + k + '.jpg').convert('RGB'); d = ImageDraw.Draw(im)
        if j == 0:
            for r in BLANK.get(n, []): d.rectangle(r, fill=(236, 233, 226)); d.text((r[0] + 6, r[1] + 6), 'приховано', fill=(150, 140, 130))
            if n in CROP: im = im.crop(CROP[n])
        fn = f'shot7-{n}-{j + 1}.jpg'; tn = f'shot7-{n}-{j + 1}-t.jpg'
        im.save(R + 'seed/import/' + fn, quality=88); t = im.copy(); t.thumbnail((420, 420)); t.save(R + 'seed/import/' + tn, quality=80)
        F.append({'file': fn, 'thumb': tn})
    u = urllib.parse.urlsplit(x['url']); host = u.netloc.replace('www.', ''); tail = urllib.parse.unquote(u.path.rstrip('/').split('/')[-1] or '')[:60]
    m.append({'key': key, 'kind': 'doc', 'id': 'shot7' + n, 'files': F, 'data': {
        'title': f'Знімок сторінки: {host}' + (f' — {tail}' if tail else ''), 'date': '07.11.2026', 'place': '', 'url': x['url'],
        'src': f'Знімок екрана сторінки {x["url"]}, зроблено 07.11.2026 — на випадок, якщо сайт стане недоступним.',
        'line': 'Перший екран сторінки' + (' і продовження статті (2-й знімок)' if len(F) > 1 else '') + '.' + (' Портрети відомих людей на знімку закрито.' if n in ('18', '21') else '') + (' Рекламу й символіку сайту прибрано.' if n in ('01', '03', '05', '09', '61') else ''),
        'text': 'Збережена копія вигляду сторінки-джерела для «Історії сіл».', 'people': []}})
    add += 1
json.dump(m, open(R + 'seed/import/manifest.json', 'w'), ensure_ascii=False, indent=1)
print('додано', add)
