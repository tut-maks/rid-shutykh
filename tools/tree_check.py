#!/usr/bin/env python3
"""Перевірка будови дерева (третій спосіб, після check.py і deep_check.py).

  python3 tools/tree_check.py <live.json> [--fam <id>]

Перевірки:
  R  людина виявляється власним предком (петля в дереві)
  S  шлюб людини з самою собою, двічі той самий шлюб, шлюб людей однієї статі
  T  дата шлюбу: комусь із подружжя < 15 років, або шлюб після смерті когось із них
  U  дитина подружжя народилась раніше ніж за рік до їхнього шлюбу (може бути інший шлюб / помилковий зв'язок)
  V  людина без жодного зв'язку (ні батьків, ні дітей, ні подружжя) — на дереві її не видно
  W  можливий дубль: ті самі ім'я + по батькові + прізвище і рік народження ±2 (або ті самі батьки)
  X  посилання [[p:id|Ім'я]] у текстах: ім'я в посиланні не схоже на ім'я в картці (можливо, не той id)
  Y  посилання на неіснуючу картку / документ
  Z  дитина записана в батька, а батько — жінка (або мати — чоловік)
  Q  в описі «брат / син / дружина / дядько … [[p:id]]», а за деревом ці двоє так не пов'язані
"""
import json, re, sys
from collections import defaultdict

def yr(s):
    m = re.search(r'(\d{4})', str(s or '')); return int(m.group(1)) if m else None
def ymd(s):
    m = re.search(r'(\d{1,2})\.(\d{1,2})\.(\d{4})', str(s or '')); return (int(m[3]), int(m[2]), int(m[1])) if m else None

def nf(x):
    x = (x or '').lower().replace('ʼ', "'").replace('’', "'")
    for a, b in (('євф', 'еф'), ('ѳ', 'ф'), ('і', 'и'), ('ї', 'и'), ('є', 'е'), ('ѣ', 'е'), ('ъ', ''), ('й', 'и'), ('ф', 'т'), ('х', 'к'), ('о', 'и'), ('ю', 'у'), ('я', 'а')):
        x = x.replace(a, b)
    return x
def n3(x): return nf(x)[:3]
def like(w, c):
    a, b = nf(w), nf(c)
    return a[:3] == b[:3] or (len(b) >= 5 and b[:5] in a) or (len(a) >= 5 and a[:5] in b)

ALT = {'юхим': 'євфим', 'євфим': 'юхим', 'іван': 'іоанн', 'іоанн': 'іван', 'федір': 'феодор', 'феодор': 'федір', 'олексій': 'алексій',
       'опанас': 'афанасій', 'гнат': 'ігнат', 'ігнат': 'гнат', 'параска': 'параскева', 'ганна': 'анна', 'анна': 'ганна', 'настя': 'анастасія',
       'анастасія': 'настя', 'уляна': 'юліанія', 'юліанія': 'уляна', 'юліана': 'уляна', 'мотря': 'матрона', 'одарка': 'дарія', 'дарія': 'одарка',
       'пилип': 'филип', 'филип': 'пилип', 'семен': 'симеон', 'симеон': 'семен', 'дмитро': 'димитрій', 'хома': 'фома', 'омелян': 'ємельян',
       'ємельян': 'омелян', 'яким': 'іоаким', 'євдокія': 'явдоха', 'катерина': 'екатерина', 'кузьма': 'косма', 'косма': 'кузьма', 'трохим': 'трофим',
       'тимофій': 'тиміш', 'тиміш': 'тимофій', 'маруся': 'марія', 'галя': 'анна', 'гнатович': 'ігнатович', 'пархом': 'пахом', 'мокрина': 'макрина'}

def names_of(p):
    out = set()
    for f in [p.get('n') or ''] + re.findall(r'\(([^)]+)\)', p.get('n') or ''):
        w = f.split('(')[0].strip().split()
        if w: out.add(w[0].strip('«»"').lower())
    for w in list(out):
        if w in ALT: out.add(ALT[w])
    return out

def main():
    a = sys.argv[1:]; L = json.load(open(a[0], encoding='utf-8'))
    fam = a[a.index('--fam') + 1] if '--fam' in a else None
    P = {p['id']: p for p in L['persons']}; D = {d['id']: d for d in L['documents']}
    out = []
    def nm(p): return ' '.join(x for x in [p.get('n'), p.get('pt'), p.get('s')] if x) + f" [{p['id']}]"
    def add(code, p, msg):
        if p is not None and fam and fam not in (p.get('fam') or []): return
        out.append((code, nm(p) if p else '', msg))
    kids = defaultdict(list)
    for p in P.values():
        for k in ('f', 'mo'):
            if p.get(k) in P: kids[p[k]].append(p)
    SP = defaultdict(list); seen = set()
    for u in L.get('unions', []):
        x, y = u.get('a'), u.get('b')
        if x not in P or y not in P:
            add('Y', P.get(x) or P.get(y), f"шлюб {u.get('id')} посилається на неіснуючу картку ({x} / {y})"); continue
        SP[x].append((y, u)); SP[y].append((x, u))
        key = tuple(sorted([x, y]))
        if x == y: add('S', P[x], 'шлюб із самим собою')
        elif key in seen: add('S', P[x], f'той самий шлюб двічі з {nm(P[y])}')
        seen.add(key)
        sx, sy = P[x].get('sex'), P[y].get('sex')
        if sx and sy and sx == sy and x != y: add('S', P[x], f'шлюб людей однієї статі: {nm(P[y])}')
        md = ymd(u.get('date')) or ((yr(u.get('date')), 6, 30) if yr(u.get('date')) else None)
        if md:
            for q in (P[x], P[y]):
                b = ymd(q.get('b')) or ((yr(q.get('b')), 6, 30) if yr(q.get('b')) and not str(q.get('b')).startswith('~') else None)
                dd = ymd(q.get('d'))
                if b and (md[0] - b[0]) - ((md[1], md[2]) < (b[1], b[2])) < 15:
                    add('T', q, f"шлюб {u.get('date')} — їй/йому ~{md[0]-b[0]} р. (нар. {q.get('b')})")
                if dd and md > dd:
                    add('T', q, f"шлюб {u.get('date')} пізніше смерті {q.get('d')}")
            ch = [c for c in kids[x] if c in kids[y]]
            for c in ch:
                cb = ymd(c.get('b'))
                if cb and ymd(u.get('date')) and (md[0] - cb[0]) * 12 + (md[1] - cb[1]) > 12:
                    add('U', c, f"народився(лась) {c.get('b')}, а шлюб батьків {nm(P[x])} і {nm(P[y])} — {u.get('date')}")
    # Z
    for p in P.values():
        f, m = P.get(p.get('f')), P.get(p.get('mo'))
        if f and f.get('sex') == 'f': add('Z', p, f'батько {nm(f)} — жінка')
        if m and m.get('sex') == 'm': add('Z', p, f'мати {nm(m)} — чоловік')
        for k in ('f', 'mo'):
            if p.get(k) and p[k] not in P: add('Y', p, f'{k} = {p[k]} — такої картки немає')
    # R
    for p in P.values():
        st, vis = [p['id']], set()
        while st:
            c = st.pop()
            for k in ('f', 'mo'):
                q = (P.get(c) or {}).get(k)
                if not q: continue
                if q == p['id']: add('R', p, 'є власним предком'); st = []; break
                if q not in vis: vis.add(q); st.append(q)
    # V
    for p in P.values():
        if not p.get('f') and not p.get('mo') and not kids[p['id']] and not SP[p['id']]:
            add('V', p, 'без батьків, дітей і подружжя')
    # W
    by = defaultdict(list)
    for p in P.values():
        key = (n3(p.get('n')), (p.get('pt') or '')[:4].lower(), n3(p.get('s')))
        by[key].append(p)
    for grp in by.values():
        for i in range(len(grp)):
            for j in range(i + 1, len(grp)):
                p, q = grp[i], grp[j]
                if not (p.get('pt') and q.get('pt')): continue
                if names_of(p).isdisjoint(names_of(q)): continue
                yp, yq = yr(p.get('b')), yr(q.get('b'))
                same_par = (p.get('f') and p.get('f') == q.get('f')) or (p.get('mo') and p.get('mo') == q.get('mo'))
                dp, dq = ymd(p.get('d')), ymd(q.get('d'))
                if same_par:
                    bp, bq = ymd(p.get('b')), ymd(q.get('b'))
                    # тезки-брати: другий народився після смерті першого — нормально
                    if (dp and bq and bq > dp) or (dq and bp and bp > dq): continue
                    if bp and bq and bp != bq: continue
                    add('W', p, f'той самий батько/мати й ім\'я: {nm(q)} ({p.get("b")} / {q.get("b")})')
                elif yp and yq and abs(yp - yq) <= 2:
                    add('W', p, f'схожа людина: {nm(q)} ({p.get("b")} / {q.get("b")})')
    # X, Y — посилання в текстах
    texts = []
    for p in P.values(): texts.append((p, 'опис', p.get('note') or ''))
    for d in D.values():
        for k in ('note', 'line', 'title'): texts.append((None, f"док. {d['id']} {k}", d.get(k) or ''))
    for k, t in (L.get('texts') or {}).items():
        texts.append((None, k, json.dumps(t, ensure_ascii=False) if not isinstance(t, str) else t))
    for owner, where, t in texts:
        for m in re.finditer(r'\[\[(p|d):([^|\]]+)\|([^\]]*)\]\]', t):
            kind, i, lab = m.group(1), m.group(2).strip(), m.group(3)
            if kind == 'd':
                if i not in D: add('Y', owner, f'{where}: посилання на неіснуючий документ {i}')
                continue
            q = P.get(i)
            if not q: add('Y', owner, f'{where}: посилання на неіснуючу картку {i} («{lab}»)'); continue
            w = [x for x in re.findall(r"[А-ЯІЇЄҐЁѢѲA-Z][а-яіїєґёѣѳʼ'’a-z]+", lab)]
            if not w: continue
            first = w[0].lower()
            if first in ('шутий', 'шута', 'шутого', 'шутої', 'шутому', 'шутою', 'шуті', 'шутих'):
                if len(w) < 2: continue
                first = w[1].lower()
            cand = names_of(q) | {(q.get('s') or '').lower()}
            if q.get('pt'): cand.add(q['pt'].lower())
            if any(like(x.lower(), c) for x in w for c in cand if c): continue
            add('X', owner, f'{where}: «{lab}» → картка {nm(q)}')
    # Q — родинні слова перед посиланням
    def par(i): q = P.get(i) or {}; return {x for x in (q.get('f'), q.get('mo')) if x}
    def sp(i): return {y for y, _ in SP[i]}
    def sib(i): return {c['id'] for x in par(i) for c in kids[x]} - {i}
    def ch(i): return {c['id'] for c in kids[i]}
    def gp(i): return {g for x in par(i) for g in par(x)}
    def gc(i): return {g for x in ch(i) for g in ch(x)}
    def unc(i): return {u for x in par(i) for u in sib(x)} | {w for x in par(i) for u in sib(x) for w in sp(u)}
    def nep(i): return {n for s_ in sib(i) for n in ch(s_)} | {n for z in sp(i) for s_ in sib(z) for n in ch(s_)}
    def inlaw(i): return {x for z in sp(i) for x in par(z) | sib(z)} | {z for s_ in sib(i) for z in sp(s_)} | {z for c in ch(i) for z in sp(c)} | {x for z in sp(i) for x in sib(z) for x in sp(x)}
    REL = [(r'брат|сестр', lambda a, b: b in sib(a)),
           (r'син|доч|дит', lambda a, b: b in ch(a) or a in ch(b)),
           (r'батьк|мат[иеір]|матір', lambda a, b: b in par(a) or a in par(b)),
           (r'дружин|чолов|вдов|подруж', lambda a, b: b in sp(a)),
           (r'онук|онуч|дід|діда|баб', lambda a, b: b in gp(a) or b in gc(a)),
           (r'дядь|дядь|дядьк|тіт|племін', lambda a, b: b in unc(a) or b in nep(a)),
           (r'свекр|тест|тещ|зят|невіст|своя|шурин|дівер', lambda a, b: b in inlaw(a) or a in inlaw(b))]
    for p in P.values():
        t = p.get('note') or ''
        for m in re.finditer(r'(?<![А-Яа-яіїєґ])((?:рідн\w+ |зведен\w+ |молодш\w+ |старш\w+ |перш\w+ |друг\w+ |покійн\w+ )?)([а-яіїєґ]+)\s+(?:—\s+)?\[\[p:([^|\]]+)\|([^\]]*)\]\]', t):
            word, q = m.group(2), m.group(3).strip()
            if q not in P or q == p['id'] or t[max(0, m.start(2) - 3):m.start(2)] == 'по ': continue
            for rx, ok in REL:
                if re.match(rf'^(?:{rx})', word):
                    # припущення в реченні — пропускаємо, якщо зв'язок не на дереві, але сказано «Є припущення»
                    st = t.rfind('.', 0, m.start()); en = t.find('.', m.end())
                    sent = t[st + 1:en if en > 0 else None].strip()
                    if re.search(r'припущен|Тоді|Якщо|Чи ', sent):
                        # непідтверджене може й не бути на дереві, але якщо ці двоє вже пов'язані ІНАКШЕ — це помилка слова
                        other = [nm_ for nm_, (rx2, ok2) in zip(['брат/сестра', 'син/дочка', 'батько/мати', 'подружжя', 'дід/онук', 'дядько/племінник'], REL[:6]) if rx2 != rx and (ok2(p['id'], q) or ok2(q, p['id']))]
                        if other and not (ok(p['id'], q) or ok(q, p['id'])):
                            add('Q', p, f'«{word} [[{q}|{m.group(4)}]]», а за деревом — {other[0]} | {sent[:160]}')
                        break
                    if not (ok(p['id'], q) or ok(q, p['id']) or any(ok(z, q) or ok(q, z) for z in sp(p['id']) | sib(p['id']))):
                        add('Q', p, f'«{word} [[{q}|{m.group(4)}]]» — за деревом інший зв\'язок | {sent[:160]}')
                    break
    order = 'RSZYTUQWXV'
    out.sort(key=lambda r: (order.index(r[0]), r[1]))
    cnt = defaultdict(int)
    for r in out: cnt[r[0]] += 1
    print('Знайдено:', len(out), dict(cnt))
    for c, n, m in out: print(f' {c} | {n} | {m}')

if __name__ == '__main__':
    main()
