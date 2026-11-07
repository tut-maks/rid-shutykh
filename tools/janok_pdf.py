"""PDF для родини Янків: «Микола Андрійович Янок, 1924» — історія за документами Arolsen і метрикою 1918 р.
Запуск: python3 tools/janok_pdf.py  → /home/claude/out/Микола_Янок_1924_документи.pdf"""
import os
from PIL import Image
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image as RLImage, PageBreak, KeepTogether
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

F = '/usr/share/fonts/truetype/dejavu/'
pdfmetrics.registerFont(TTFont('DV', F + 'DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DVB', F + 'DejaVuSans-Bold.ttf'))
pdfmetrics.registerFont(TTFont('DVS', F + 'DejaVuSerif.ttf'))
pdfmetrics.registerFont(TTFont('DVSB', F + 'DejaVuSerif-Bold.ttf'))
R = '/home/claude/rid-shutykh/facts/'
OUT = '/home/claude/out/Микола_Янок_1924_документи.pdf'
TMP = '/home/claude/pdf_tmp_janok/'
os.makedirs(TMP, exist_ok=True); os.makedirs(os.path.dirname(OUT), exist_ok=True)

INK = colors.HexColor('#2b2118'); WINE = colors.HexColor('#7a2335'); GREY = colors.HexColor('#6b6158')
H1 = ParagraphStyle('h1', fontName='DVSB', fontSize=21, leading=26, textColor=INK, spaceAfter=4)
SUB = ParagraphStyle('sub', fontName='DVS', fontSize=12, leading=16, textColor=GREY, spaceAfter=10)
H2 = ParagraphStyle('h2', fontName='DVSB', fontSize=14, leading=18, textColor=WINE, spaceBefore=6, spaceAfter=4)
P = ParagraphStyle('p', fontName='DV', fontSize=10.3, leading=14.8, textColor=INK, spaceAfter=5)
SM = ParagraphStyle('sm', parent=P, fontSize=8.5, leading=11.5, textColor=GREY)
TR = ParagraphStyle('tr', parent=P, fontSize=9.2, leading=12.8, borderColor=colors.HexColor('#d9cbb8'),
                    borderWidth=0.6, borderPadding=(5, 6, 5, 6), spaceBefore=4, spaceAfter=14)
W = A4[0] - 36 * mm
MAXH = 150 * mm


def img(path, maxh=MAXH, crop=None):
    im = Image.open(path).convert('RGB')
    if crop:
        w, h = im.size
        im = im.crop((int(crop[0] * w), int(crop[1] * h), int(crop[2] * w), int(crop[3] * h)))
    im.thumbnail((2200, 2200))
    out = TMP + os.path.basename(path).replace('.jpg', '') + ('_c' if crop else '') + '.jpg'
    im.save(out, quality=88)
    w, h = im.size
    s = min(W / w, maxh / h)
    return RLImage(out, w * s, h * s)


def doc(title, files, tr, crop=None, maxh=MAXH):
    parts = [Paragraph(title, H2)]
    for f in files:
        parts.append(img(f, maxh / (1 if len(files) == 1 else 1.6), crop))
        parts.append(Spacer(1, 3))
    parts.append(Paragraph(tr, TR))
    return KeepTogether(parts)


A = R + 'arolsen/hq/'; B = R + 'arolsen/hq2/janok_bw/'; C = R + 'arolsen/hq2/'
S = []
S += [Paragraph('Микола Андрійович Янок', H1),
      Paragraph('народився 28 серпня 1924 року в селі Веприк на Чернігівщині. Шлях через концтабори 1942–1945 рр. за документами Arolsen Archives', SUB)]
S += [Paragraph('Що розповідають документи', H2)]
for t in [
    'Микола народився <b>28 серпня 1924 року у Веприку</b> (тоді — Ново-Басанський район). Його батьки — <b>Андрій Янок і Катерина</b>, у дівоцтві <b>Чаленко</b> (так записано в німецьких картках: «Katharina, geb. Tschalenko», «Mutter: Katja J., Webrij»). У метричній книзі Троїцької церкви Веприка за 1918 рік записане народження його старшої сестри <b>Любові</b> (24 жовтня 1918) — дочки «крестьянина Андрея Димитриева Янка и законной жены его Екатерины Петровой». Є припущення, що батько Миколи — саме Андрій Дмитрович Янок (нар. 14 жовтня 1894 р., син Дмитра Афанасійовича Янка й Євдокії Спиридонівни), мати — Катерина Петрівна. Що Микола — син саме цієї пари, видно з імен батьків і села; інших пар «Андрій і Катерина Янки» у метриках Веприка немає.',
    'Під час війни Микола опинився на роботах у Данцигу (тепер Гданськ, Польща) — у картках записано «Landarbeiter» (сільськогосподарський робітник) і «Dreher» (токар).',
    'У <b>червні 1942 року</b> гестапо Данцига заарештувало його «за те, що залишив робоче місце» («seinen Arbeitsplatz verlassen»). <b>10 серпня 1942</b> року його привезли в концтабір <b>Штуттгоф</b> (в\'язень № 15680, позначка «Erziehung» — «виховний» в\'язень). <b>14 листопада 1942</b> його перевели в концтабір <b>Дахау</b> (прибув 19.11.1942, в\'язень № 40302, робоча команда Аллах).',
    '<b>23 березня 1944</b> року з групою з 199 в\'язнів його перевезли з Дахау в концтабір <b>Бухенвальд</b> (в\'язень № 46252, «російський цивільний робітник»). Там його записали в робочу команду «Emma»; на одній з карток стоїть «Eisenach» (Ейзенах).',
    'Останній запис про нього — штамп <b>«3. APR. 1945 SACHSENHAUSEN»</b>: за місяць до кінця війни його відправили з Бухенвальда в концтабір <b>Заксенгаузен</b> (на трудовій картці — «Sachsenh. 31/3»). Що з ним сталося далі, у документах Arolsen, доступних онлайн, не записано.',
    'На особовій картці Бухенвальда стоїть штамп <b>«I.T.S. FOTO No. 1341»</b>. Це означає, що до картки, ймовірно, було прикріплене фото, яке архів зберігає окремо. В онлайн-архіві його немає; його можна попросити в Arolsen Archives (безкоштовний запит на сайті arolsen-archives.org, розділ «Search for people / Make an inquiry»), вказавши: Janok (Janak) Nikolaj, 28.08.1924, Buchenwald Nr. 46252, I.T.S. Foto Nr. 1341.',
]:
    S.append(Paragraph(t, P))
S.append(Paragraph('Коротко: Веприк, 28.08.1924 → робота в Данцигу → арешт, червень 1942 → Штуттгоф, 10.08.1942 → Дахау, 19.11.1942 → Бухенвальд, 23.03.1944 → Заксенгаузен, 3.04.1945 → ?', TR))
S.append(Paragraph('Джерела: Arolsen Archives (collections.arolsen-archives.org) — особові справи КТ Штуттгоф, Дахау, Бухенвальд; FamilySearch — метрична книга Троїцької церкви с. Веприк 1918 р. (плівка 007783354, кадр 718). Переклади з німецької — наші; що в документі нечітко, позначено «(?)». Зібрав Максим Шутий, листопад 2026.', SM))
S.append(PageBreak())

S.append(doc('1. Метрика сестри Любові, Веприк, 1918', [R + 'fs_yanok/yanok_liubov_1918_f718.jpg'],
             '№ 60 (жін.). Народилася 24, хрещена 24 жовтня 1918 р. — <b>Любов</b>. Батьки: «Крестьянинъ Андрей Димитріевъ Янокъ и законная жена его Екатерина Петрова, оба православные». Хрещені: селянин Тимофій Омелянович Олексієнко і козачка Акилина Василівна Басанько(?). На полях — позначка про видачу свідоцтва 1973 р.',
             crop=(0, 0, 1, 1)))
S.append(doc('2. Картка в\'язня КТ Штуттгоф, 1942', [A + 'arolsenhq_janok_mykola_1924_stutthof_001.jpg', A + 'arolsenhq_janok_mykola_1924_stutthof_002.jpg'],
             'Комендатура КТ Штуттгоф, політичний відділ. <b>Janok Nikolaj</b>, нар. 28.8.24 у Weprik, Kr. Czernikow; сільгоспробітник; православний; «Russe». <b>Батьки: Andreij Janok, Katharina, geb. Tschalenko</b> (Андрій Янок, Катерина з дому Чаленко). № 15680, «Erziehung» (виховний в\'язень). Заарештований Stapo Danzig за те, що залишив робоче місце; привезений 10.8.42. На звороті: «Überführt am 14.11.42 KL. Dachau» — переведений у Дахау 14.11.1942.'))
S.append(doc('3. Дахау: картка й книга реєстрації, 1942', [C + 'aro3_janok_dachau_card_001.jpg', B + 'janok_130431319_1.jpg'],
             'Картка Дахау: Janok Nikolai, № 40302, «Sch» (в\'язень «превентивного арешту»), команда Allach, сільгоспробітник, Weprik, 28.8.24; прибув «19. Nov. 1942 v. Stu.» (зі Штуттгофа); «1.– orth. Russe»; штамп «BUCHENWALD 24. MRZ. 1944». Книга реєстрації (права сторінка): № 40302 Janok Nikolaj, 28.8.24, Weprig — у групі, що прибула 19.11.1942 зі Штуттгофа.'))
S.append(doc('4. Список Бухенвальда, 7 квітня 1944', [B + 'janok_5282766_1.jpg'],
             'Weimar-Buchenwald, 7. April 1944. «Поіменний список 199 в\'язнів, переведених з КТ Дахау в команду „Emma“». Серед «Russische Zivilarbeiter» (російські цивільні робітники): <b>46252 Janok, Nikolaj</b>.'))
S.append(doc('5. Особова картка в\'язня Бухенвальда', [B + 'janak_19_001.jpg', B + 'janak_19_002.jpg'],
             'Häftlings-Personal-Karte, KL Buchenwald, № 46252. <b>Janak Nikolaj</b>, нар. 28.8.1924 у Webrij; неодружений; проживав: Webrij, Prov. Tschernigow; православний; громадянство — СРСР. Родичі: «Katja J.». Направлений Stapo Danzig у КТ Дахау; причина — «російський цивільний робітник». Переведений 23.3.1944 у Бухенвальд. На звороті: фах — «Dreher» (токар). Штамп «I.T.S. FOTO No. 1341».'))
S.append(doc('6. Картка-ордер і картка речей', [B + 'janak_20_001.jpg', B + 'janak_21_001.jpg'],
             'Картка: Janak Nikolaj, № 46252, токар; нар. 28.8.1924 у Webrij – Tschernigow; православний, неодружений; громадянство — «Ukrainer». <b>Адреса родичів: «Katja geb. Tschalenko, Webrij – Tschernigow»</b> (Катя з дому Чаленко, Веприк). Останнє місце проживання — Данциг. Заарештований у червні 1942 гестапо Данцига; у «превентивному арешті» з червня 1942; у Бухенвальді з 23.3.44.<br/>Картка речей: «Mutter: Katja J., Webrij /Tschernigow/» (мати); прибув 23.III.44 з KL Dachau.'))
S.append(doc('7. Поштова, номерна й трудова картки — Заксенгаузен, 1945', [B + 'janak_22_001.jpg', B + 'janak_23_001.jpg', B + 'janak_24_001.jpg'],
             'Поштова картка: Polit. Russe, № 46.252 Janok Nikolaj, нар. 28.8.24 у Weprik; «Emma»; «Von KL Dachau eingel. 28. März 1944»; <b>штамп «3. APR. 1945 SACHSENHAUSEN»</b>. Номерна картка — те саме. Трудова картка: «Janak, Dreher (токар); Sachsenh. 31/3; Kdo. Emma».'))
S.append(doc('8. Довідкові картки ITS', [B + 'janok_6171152_1.jpg', B + 'janok_10108968_1.jpg'],
             'Картка-посилання ITS: «JANOK, Nikolaj, 28.8.1924, see: JANAK» — у різних документах прізвище писали Janok і Janak. Конверт справи Дахау: Janok Nicolai, 28.8.1924, № 40302.'))

SimpleDocTemplate(OUT, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
                  title='Микола Андрійович Янок, 1924 — документи', author='Максим Шутий').build(S)
print(OUT, os.path.getsize(OUT))
