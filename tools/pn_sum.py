#!/usr/bin/env python3
"""Зведена картка людини з «Пам'яті народу»: заголовок (ім'я, рік) з першого скріну + блок «Сводная информация» з другого.
python3 tools/pn_sum.py <скрін1> <скрін2> <вихід.jpg> y2_top y2_bottom"""
import sys
from PIL import Image
a=Image.open(sys.argv[1]).convert('RGB').crop((15,110,785,195))
y0,y1=int(sys.argv[4]),int(sys.argv[5])
b=Image.open(sys.argv[2]).convert('RGB').crop((15,y0,785,y1))
r=Image.new('RGB',(770,a.height+b.height),'white');r.paste(a,(0,0));r.paste(b,(0,a.height))
o=sys.argv[3];r.save(o,quality=90);t=r.copy();t.thumbnail((420,420));t.save(o[:-4]+'-t.jpg',quality=85);print(o,r.size)
