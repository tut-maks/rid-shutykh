#!/usr/bin/env python3
"""Складає кілька вирізок скріншотів одна під одною (ширина x 15..785).
python3 tools/pn_multi.py <вихід.jpg> <файл:y0:y1> [<файл:y0:y1> ...]"""
import sys
from PIL import Image
parts=[]
for a in sys.argv[2:]:
    f,y0,y1=a.rsplit(':',2); parts.append(Image.open(f).convert('RGB').crop((15,int(y0),785,int(y1))))
r=Image.new('RGB',(770,sum(p.height for p in parts)),'white');y=0
for p in parts: r.paste(p,(0,y)); y+=p.height
o=sys.argv[1];r.save(o,quality=90);t=r.copy();t.thumbnail((420,420));t.save(o[:-4]+'-t.jpg',quality=85);print(o,r.size)
