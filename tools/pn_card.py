#!/usr/bin/env python3
"""Обрізає скріншот сторінки «Пам'яті народу» (панель «О документе») і зберігає з мініатюрою.
python3 tools/pn_card.py <скрін> <вихід.jpg> x0 y0 x1 y1"""
import sys
from PIL import Image
s,o=sys.argv[1],sys.argv[2]; b=tuple(map(int,sys.argv[3:7]))
im=Image.open(s).convert('RGB').crop(b); im.save(o,quality=90)
t=im.copy(); t.thumbnail((420,420)); t.save(o[:-4]+'-t.jpg',quality=85); print(o,im.size)
