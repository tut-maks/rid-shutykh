#!/usr/bin/env python3
"""Зшиває скріншоти-плитки скану з «Пам'яті народу» в одне зображення для сайту.

Використання:
  python3 tools/pn_stitch.py <вихід.jpg> <h1> <плитка1> <плитка2> [...] -- <h2> <плитка> ...
  Кожна група (розділена "--") — один горизонтальний ряд плиток; h — висота корисної
  частини плиток у пікселях (решту знизу обрізаємо). Ряди ставляться один під одним
  з тонкою сірою лінією між ними. Поруч кладеться мініатюра *-t.jpg (420 px).
"""
import sys
from PIL import Image

out = sys.argv[1]
groups, cur = [], []
for a in sys.argv[2:]:
    if a == '--':
        groups.append(cur); cur = []
    else:
        cur.append(a)
if cur:
    groups.append(cur)

rows = []
for g in groups:
    h = int(g[0])
    ims = [Image.open(p).convert('RGB') for p in g[1:]]
    ims = [im.crop((0, 0, im.width, min(h, im.height))) for im in ims]
    w = sum(im.width for im in ims)
    row = Image.new('RGB', (w, h), 'white')
    x = 0
    for im in ims:
        row.paste(im, (x, 0)); x += im.width
    # обрізати порожнє біле поле праворуч (від останньої неповної плитки)
    import PIL.ImageOps as IO
    bb = IO.invert(row.convert('L')).point(lambda v: 255 if v > 8 else 0).getbbox()
    if bb: row = row.crop((0, 0, bb[2], row.height))
    rows.append(row)

W = max(r.width for r in rows)
H = sum(r.height for r in rows) + 3 * (len(rows) - 1)
res = Image.new('RGB', (W, H), (200, 200, 200))
y = 0
for r in rows:
    res.paste(r, (0, y)); y += r.height + 3
res.save(out, quality=92)
t = res.copy(); t.thumbnail((420, 420)); t.save(out[:-4] + '-t.jpg', quality=85)
print(out, res.size)
