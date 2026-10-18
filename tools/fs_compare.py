#!/usr/bin/env python3
"""Звірка карток із покажчиком FamilySearch (четвертий спосіб перевірки).

  python3 tools/fs_compare.py <live.json> <fsrec.json> [all]

fsrec.json — записи FS за посиланнями документів (1:1:XXXX-XXX): у вкладці familysearch.org (увійшовши)
для кожного id fetch("/platform/records/personas/"+id, {Accept: application/x-gedcomx-v1+json, Authorization: Bearer <fssessionid>})
і стиснути до {ps:[{id,n,g,pr,f:["Birth|дата|місце|"]}], rel:["ParentChild|p1|p2"]}.
Показує: дата народження/смерті в картці ≠ FS, батьки в FS ≠ батьки в картці, головна особа запису не серед людей документа.
Розбіжності — підозри: FS часто дає день хрещення замість народження, помиляється в іменах; звіряти зі сканом."""
import json,re,sys
L=json.load(open(sys.argv[1])); R=json.load(open(sys.argv[2]))
P={p['id']:p for p in L['persons']}
MON={'Jan':1,'Feb':2,'Mar':3,'Apr':4,'May':5,'Jun':6,'Jul':7,'Aug':8,'Sep':9,'Oct':10,'Nov':11,'Dec':12}
def fsd(s):
    m=re.match(r'(\d{1,2}) (\w{3}) (\d{4})',s or '')
    return (int(m[3]),MON.get(m[2],0),int(m[1])) if m else None
def ymd(s):
    m=re.search(r'(\d{1,2})\.(\d{1,2})\.(\d{4})',str(s or '')); return (int(m[3]),int(m[2]),int(m[1])) if m else None
def yr(s):
    m=re.search(r'(\d{4})',str(s or '')); return int(m[1]) if m else None
TR=str.maketrans({'і':'и','ї':'и','є':'е','ѣ':'е','ъ':'','й':'и','ы':'и','ё':'е','ф':'т','ѳ':'т','х':'к','о':'и','ю':'у','я':'а','э':'е','г':'г','ґ':'г','ь':''})
AL={'иван':'иоанн','іван':'иоанн','юхим':'евфим','ефим':'евфим','федір':'феодор','федор':'феодор','олексій':'алексий','алексей':'алексий','опанас':'афанасий','гнат':'игнатий','ігнат':'игнатий','игнат':'игнатий',
    'ганна':'анна','параска':'параскева','настасія':'анастасия','настасия':'анастасия','уляна':'иулиания','юліанія':'иулиания','юліана':'иулиания','улиана':'иулиания','мотря':'матрона','одарка':'дария','дарья':'дария',
    'пилип':'филипп','филип':'филипп','семен':'симеон','дмитро':'димитрий','дмитрий':'димитрий','хома':'фома','омелян':'емельян','ємельян':'емельян','емелиан':'емельян','яким':'иоаким','аким':'иоаким','євдокія':'евдокия','явдоха':'евдокия',
    'кузьма':'косма','козьма':'косма','трохим':'трофим','тимофій':'тимофей','григорій':'григорий','яків':'иаков','яков':'иаков','петро':'петр','павло':'павел','михайло':'михаил','данило':'даниил','кирило':'кирилл','гаврило':'гавриил','гавриїл':'гавриил',
    'катерина':'екатерина','марина':'марина','марія':'мария','агафія':'агафия','ксенія':'ксения','оксана':'ксения','христина':'христина','ірина':'ирина','орина':'ирина','варвара':'варвара','пелагія':'пелагия','палажка':'пелагия','олена':'елена','єлена':'елена',
    'стефан':'стефан','степан':'стефан','василь':'василий','андрій':'андрей','антон':'антоний','антоній':'антоний','максим':'максим','микита':'никита','никита':'никита','лаврентій':'лаврентий','терентій':'терентий','леонтій':'леонтий','сила':'сила','мина':'мина','олександр':'александр','олександра':'александра','александер':'александр','надія':'надежда','микола':'николай','тетяна':'татиана','татьяна':'татиана','сава':'савва','віра':'вера','федот':'феодосий','феодот':'феодосий','феодосій':'феодосий','мотрона':'матрона','матвій':'матфей','матвей':'матфей','ілля':'илия','илья':'илия','єремій':'иеремий','костянтин':'константин','федора':'феодора','емілія':'евфимия','євфимія':'евфимия','ефимия':'евфимия','пархом':'парамий','паромий':'парамий','козьма':'косма','касма':'косма','євфросинія':'евфросиния','ефросиния':'евфросиния','улиана':'иулиания','ульяна':'иулиания','макрына':'макрина','мокрина':'макрина'}
def key(n):
    n=(n or '').split('(')[0].strip().split()
    if not n: return ''
    w=n[0].lower().strip('«»"')
    w=AL.get(w,w)
    return w.translate(TR)[:4]
def keys_of(n):
    out={key(n)}
    for a in re.findall(r'\(([^)]+)\)',n or ''): out.add(key(a))
    return out
out=[]
docs_by_fs={}
for d in L['documents']:
    for u in [d.get('url') or '']:
        m=re.search(r'1:1:([0-9A-Z]{4}-[0-9A-Z]{3,4})',u)
        if m: docs_by_fs.setdefault(m[1],[]).append(d)
for fid,rec in R.items():
    if 'ps' not in rec: out.append(('ERR',fid,str(rec))); continue
    ps={p['id']:p for p in rec['ps']}
    pr=next((p for p in rec['ps'] if p['pr']),None)
    if not pr: continue
    par=[ps[r.split('|')[1]] for r in rec['rel'] if r.startswith('ParentChild') and r.split('|')[2]==pr['id'] and r.split('|')[1] in ps]
    for d in docs_by_fs.get(fid,[]):
        ppl=[P[i] for i in d.get('people') or [] if i in P]
        cand=[p for p in ppl if key(pr['n']) in keys_of(p.get('n'))]
        if not cand:
            out.append(('NAME',fid,f"{d['id']}: у записі FS головна особа «{pr['n']}», а серед людей документа такого імені немає: {[p['n'] for p in ppl]}")); continue
        if len(cand)>1:
            cand=[c for c in cand if not (c.get('f') in [x['id'] for x in ppl] and False)] # лишаємо всіх
        c=cand[0]
        for f in pr['f']:
            t,dt,pl,val=(f.split('|')+['','','',''])[:4]
            fd=fsd(dt)
            if t in ('Birth','Christening','Baptism') and fd and re.search(r'Народж|Хрещ|Метрик',d.get('title') or ''):
                cb=ymd(c.get('b'))
                if cb and cb!=fd and t=='Birth': out.append(('B',fid,f"{d['id']} {c['id']} {c['n']}: у картці нар. {c.get('b')}, у FS {dt}"))
                if not cb and not str(c.get('b') or '').startswith('~') and t=='Birth': out.append(('B?',fid,f"{d['id']} {c['id']} {c['n']}: у картці нар. «{c.get('b')}», у FS {dt}"))
            if t=='Death' and fd:
                cd=ymd(c.get('d'))
                if cd and cd!=fd: out.append(('D',fid,f"{d['id']} {c['id']} {c['n']}: у картці пом. {c.get('d')}, у FS {dt}"))
                if not cd: out.append(('D?',fid,f"{d['id']} {c['id']} {c['n']}: у картці пом. «{c.get('d')}», у FS {dt}"))
        # батьки
        for q in par:
            g=q.get('g'); kk=key(q['n'])
            sf=P.get(c.get('f')); sm=P.get(c.get('mo'))
            opts=[x for x in (sf,sm) if x]
            if opts and not any(kk in keys_of(x['n']) for x in opts):
                out.append(('PAR',fid,f"{d['id']} {c['id']} {c['n']}: батько/мати в FS «{q['n']}», а в картці: {[x['n']+' '+(x.get('pt') or '') for x in opts]}"))
order=['ERR','NAME','B','D','PAR','B?','D?']
out.sort(key=lambda r:order.index(r[0]))
from collections import Counter
print(Counter(r[0] for r in out))
for r in out:
    if r[0]!='NAME' or len(sys.argv)>3: print(r[0],'|',r[1],'|',r[2])
