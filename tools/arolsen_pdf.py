import os, sys
sys.path.insert(0,'/home/claude')
from translations import T
from PIL import Image, ImageOps
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

SRC = '/home/claude/rid-shutykh/facts/arolsen/'
TMP = '/home/claude/pdf_tmp/'
os.makedirs(TMP, exist_ok=True)
OUT = '/home/claude/out/Arolsen_Вороньки_Веприк_документи.pdf'
os.makedirs(os.path.dirname(OUT), exist_ok=True)

INK = colors.HexColor('#2b2118'); WINE = colors.HexColor('#7a2335'); GREY = colors.HexColor('#6b6158')
H1 = ParagraphStyle('h1', fontName='DVSB', fontSize=20, leading=25, textColor=INK, spaceAfter=6)
H2 = ParagraphStyle('h2', fontName='DVSB', fontSize=14.5, leading=19, textColor=WINE, spaceBefore=4, spaceAfter=4)
P = ParagraphStyle('p', fontName='DV', fontSize=10, leading=14.2, textColor=INK, spaceAfter=4)
SM = ParagraphStyle('sm', parent=P, fontSize=8.5, leading=11.5, textColor=GREY)
HY = ParagraphStyle('hy', parent=P, backColor=colors.HexColor('#f6efe6'), borderPadding=(5, 6, 5, 6), spaceBefore=4, spaceAfter=8)
TR = ParagraphStyle('tr', parent=P, fontSize=9, leading=12.5, leftIndent=6, borderColor=colors.HexColor('#d9cbb8'), borderWidth=0.6, borderPadding=(5,6,5,6), spaceBefore=2, spaceAfter=12)
CAP = ParagraphStyle('cap', parent=SM, alignment=1, spaceAfter=10)

W = A4[0] - 36 * mm


def img(name, maxh=110 * mm, cap=None):
    p = SRC + name
    im = Image.open(p).convert('RGB')
    g = ImageOps.grayscale(im)
    bbox = g.point(lambda v: 255 if v > 28 else 0).getbbox()
    if bbox:
        im = im.crop(bbox)
    out = TMP + name
    im.save(out, quality=92)
    w, h = im.size
    sc = min(W / w, maxh / h)
    r = RLImage(out, width=w * sc, height=h * sc)
    items = [r]
    if cap:
        items.append(Paragraph(cap, CAP))
    else:
        items.append(Spacer(1, 6))
    out_items = [KeepTogether(items)]
    if name in T:
        out_items.append(Paragraph(T[name], TR))
    return out_items


def person(title, facts, hyp, images, src):
    s = [Paragraph(title, H2)]
    for f in facts:
        s.append(Paragraph(f, P))
    if hyp:
        s.append(Paragraph(hyp, HY))
    for im in images:
        s.extend(img(*im))
    s.append(Paragraph('Джерело: ' + src, SM))
    s.append(PageBreak())
    return s


story = []
story += [
    Paragraph('Наші села й прізвища в документах Arolsen Archives, 1942–1945', H1),
    Paragraph('Остарбайтери, в’язні концтаборів і військовополонені з наших сіл', ParagraphStyle('sub', parent=P, fontName='DVS', fontSize=12, leading=16, textColor=GREY, spaceAfter=10)),
    Paragraph('<b>Що це.</b> Arolsen Archives (Німеччина) — міжнародний архів документів про людей, яких переслідував нацистський режим: вивезених на примусову працю, в’язнів концтаборів, військовополонених. Документи нижче знайдено 07.11.2026 у його онлайн-архіві за назвами сіл Веприк і Вороньки та за прізвищем Шутий.', P),
    Paragraph('<b>Важливо.</b> Ці люди — з наших сіл, але ми <b>не знаємо, чи вони наші родичі</b>. Найімовірніше, більшість — односельці. У нашому родовому дереві їх поки немає. Усе, що написано про можливу спорідненість, — лише припущення (позначено «Є припущення»). Імена, дати й місця подано так, як записано в документах; німецькі писарі часто перекручували слов’янські імена й назви.', HY),
    Paragraph('<b>Які прізвища знайдено:</b> <b>Шутий</b> (Вороньки, Веприк), <b>Левченко</b> (Веприк), <b>Галай</b> (Веприк, імовірно), <b>Янок</b> (Веприк), <b>Дривинський</b> (Веприк), <b>Турчин</b>, <b>Самойлик</b>, <b>Вовк</b> (Вороньки), <b>Семена</b> (місце не вказано), <b>Перчета</b> (Київ), а також односельці: Сутуга, Василяк (Веприк), Лесек, Цюцюра, Величко (Вороньки).', P),
    Paragraph('<b>Шукали й не знайшли з наших сіл:</b> Вдовинець, Красновид, Батечко, Половець (крім одного запису без документа), Горовий (є двоє з Веприка, але документи без подробиць), Телятник, Талавира, Крук (Розкошівка).', SM),
    Paragraph('<b>Прохання до родини.</b> Подивіться, будь ласка: може, хтось упізнає ці імена, пам’ятає розповіді старших про Німеччину, знає, чиї це діти, хто повернувся, а хто ні. Будь-яка згадка допоможе — напишіть у групу або Максимові.', P),
    Spacer(1, 6),
    Paragraph('<b>Як читати.</b> «Erziehung» — «виховний» в’язень: людей, які втекли з місця примусової роботи, гестапо відправляло на кілька тижнів у табір. «Stapo» — державна поліція (гестапо). Kr. Czernikow / Tschernigow — Чернігівська область. Дати в німецьких документах — день.місяць.рік.', SM),
    PageBreak(),
]

# ---- Шуті
story += person('Шутий Михайло, нар. 05.09.1924, «Woronky Tschernigow»',
    ['Рядок № 3775 у списку іноземців, що працювали в Німеччині (повоєнний список, складений для розшуку, ITS 063). Записано: Schuty Michail, 5.9.24, Woronky Tschernigow; остання колонка — 19.5.43 (найімовірніше, дата прибуття або реєстрації).'],
    'Є припущення: Шуті у Вороньках — один великий рід, тож Михайло майже напевно далекий родич, але з якої гілки (чий син) — невідомо. Метрики, які ми маємо, закінчуються 1922 роком.',
    [('shutyi_mykhailo_1924_spysok_ryadok.jpg', 40 * mm, 'Рядок 3775: Schuty Michail, 5.9.24, Woronky Tschernigow, 19.5.43'),
     ('shutyi_mykhailo_1924_spysok_full.jpg', 150 * mm, 'Уся сторінка списку')],
    'Arolsen Archives, 2.1.4.2, документ 4685021 (DocID 70976159)')

story += person('Шутий Іван, нар. 1926, Веприк',
    ['<b>1)</b> Картка хімічного заводу Kalle &amp; Co. AG, Вісбаден-Біберіх: № 7362, Schuti Iwan, Hilfswerker (підсобний робітник), нар. 3.11.1926, Weprik/Russ., прибув 10.8.42, неодружений; вибув 29 липня 1943.',
     '<b>2)</b> Шахта «Adolf von Hansemann», Дортмунд, список росіян № 328: Schuti Iwan, 3.11.26, Weprik — працював 3.8.43 – 2.11.43.',
     '<b>3)</b> Список ITS 106, № 580: Schuty Iwan, 3.10.1926, Weprik Tschernigow; з 4.11.1943 — Gerhard-Schacht (шахта), Веферлінген; примітка: «v. d. amer. Besatzungstruppen abtransportiert April 1945» — у квітні 1945 вивезений американськими військами.'],
    'Є припущення: усі три записи — одна людина (дати йдуть одна за одною без розриву; в одному документі день народження 3.10, у двох — 3.11). Шутих у Веприку майже не було; поруч, на хуторі Лідин, жив Яків Петрович Шутий — чи Іван його родич, невідомо.',
    [('shutyi_ivan_1926_kalle_karta.jpg', 80 * mm, 'Картка Kalle &amp; Co. (праворуч): Schuti Iwan, Hilfswerker, 3.11.1926, Weprik/Russ.'),
     ('shutyi_ivan_1926_dortmund_ryadok.jpg', 40 * mm, 'Дортмунд, шахта Adolf von Hansemann, № 328'),
     ('shutyi_ivan_1926_ryadok.jpg', 40 * mm, 'Список ITS 106, № 580: Schuty Iwan, 3.10.1926, Weprik Tschernigow, з 4.11.1943'),
     ('shutyi_ivan_1926_pravyi_bik.jpg', 100 * mm, 'Права частина того ж списку: Gerhard-Schacht, Weferlingen; «вивезений американськими військами у квітні 1945»')],
    'Arolsen Archives: картотека Kalle &amp; Co. (10003885), 2.1.2.1 NW 022, документ 4685025')

story += person('Шутий Дмитро, 1915 р. н., Веприк',
    ['Список хворих-«росіян» міської лікарні Лерте (біля Ганновера), № 179: Schuty Dmitrij, 1915, Weprik — у лікарні 20.8. – 13.9.1943, діагноз «Hypersekretion».'],
    'Є припущення: у нашому дереві Дмитра Шутого 1915 року немає; хто він — невідомо.',
    [('shutyi_dmytro_1915_ryadok.jpg', 45 * mm, 'Рядок 179: Schuty Dmitrij, 1915, Weprik, 20.8.–13.9.43'),
     ('shutyi_dmytro_1915_likarnia_full.jpg', 150 * mm, 'Уся сторінка (Stadtkrankenhaus Lehrte)')],
    'Arolsen Archives, 2.1.2.1 NI 010 (DocID 70590255)')

# ---- Веприк, Штуттгоф
story += person('Янок Микола, нар. 28.08.1924, Веприк',
    ['Картка в’язня концтабору Штуттгоф (біля Данцига) № 15680: Janok Nikolaj, 28.8.24, Weprik, Kr. Czernikow; сільгоспробітник, православний; <b>батьки — Андрій Янок і Катерина, з дому Тщеленко(?)</b>; заарештований гестапо Данцига, причина — «seinen Arbeitsplatz verlassen» (залишив робоче місце); у таборі з 10.8.1942; позначка «Erziehung» (виховний в’язень).'],
    'Є припущення: Яноки — й наша родина (Григорій Юхимович Янок, 1909). Якщо Андрій Янок — його брат, то Микола 1924 — двоюрідний брат Миколи Григоровича Янка (1939). Це не доведено.',
    [('janok_mykola_1924_kl_karta.jpg', 120 * mm, 'Картка політвідділу КТ Штуттгоф'),
     ('janok_mykola_1924_kl_obkl.jpg', 90 * mm, 'Обкладинка особової справи')],
    'Arolsen Archives, 1.1.41.2, особова справа 01014102 052.111 (DocID 4502354)')

story += person('Левченко Іван, нар. 30.01.1924, Веприк',
    ['Анкета (Personalbogen) в’язня КТ Штуттгоф № 15683: Lewczenko Iwan, 30.1.1924, Weprik, Krs. Czernikow; неодружений, сільгоспробітник, православний, освіта — народна школа; під вартою з 17.7.1942; арештований у Данцигу, причина — «залишив робоче місце»; <b>батько — Овсій (Owschi) Левченко, мати — Макрина, з дому Олексіївна(?)</b>.'],
    'Є припущення: Овсій — народна форма імені Євсевій. У метриках Веприка 1910–1912 рр. є Євсевій Іванович Левченко — хрещений дітей Павла Яковича Левченка (брата Ігната Левченка з нашої маминої лінії). Чи це батько Івана і чи він родич — невідомо.',
    [('levchenko_ivan_1924_stutthof_personalbogen.jpg', 170 * mm, None)],
    'Arolsen Archives, 1.1.41.2, особова справа 01014102 077.074 (DocID 4550741)')

story += person('Дривинський Володимир, нар. 12.03.1923, Веприк — помер у концтаборі',
    ['<b>1)</b> Рішення гестапо Данцига від 30.7.1942: Wladimir Driwinski, 12.3.1923, Weprik, район Ново-Басанський, Чернігівська обл.; за те, що «самовільно залишив роботу», — 42 дні в таборі «трудового виховання»; дата звільнення — 21.9.42.',
     '<b>2)</b> Картка в’язня КТ Штуттгоф № 15659: <b>батьки — Петро Дривинський («verschleppt» — вивезений) і Христина, з дому Шиян</b>; у таборі з 10.8.1942.',
     '<b>3)</b> Повідомлення комендатури КТ Штуттгоф до гестапо Данцига: <b>Володимир Дривинський помер 13 жовтня 1942 року</b> в лікарні для в’язнів; причина в довідці — серцево-судинна недостатність.'],
    'Не родич (наскільки відомо), але Дривинські — давній веприцький рід. Можливо, хтось знає родину Петра й Христини (Шиян) Дривинських.',
    [('dryvynskyi_volodymyr_1923_gestapo_rishennia.jpg', 150 * mm, 'Рішення гестапо (Einweisungsbeschluss), 30.7.1942'),
     ('dryvynskyi_volodymyr_1923_karta.jpg', 110 * mm, 'Картка в’язня'),
     ('dryvynskyi_volodymyr_1923_povidomlennia_smert.jpg', 110 * mm, 'Повідомлення про смерть 13.10.1942'),
     ('dryvynskyi_volodymyr_1923_stutthof_smert.jpg', 110 * mm, 'Довідка табірної лікарні')],
    'Arolsen Archives, 1.1.41.2, особова справа 01014102 024.437 (DocID 4453743)')

story += person('Сутуга Олексій, нар. 21.04.1924, Веприк — помер у концтаборі',
    ['Картка особистих речей в’язня КТ Штуттгоф № 16186: Sutuga Alexej, 21.4.1924, «Wejbrück Kreis Tschernikow» (так писар записав Веприк), сільгоспробітник; <b>батько — Микола Сутуга</b>; привезений гестапо Данцига 4.9.1942; штамп <b>«verstorben 14. März 1943»</b> — помер 14 березня 1943 року.'],
    'Сутуги були кумами наших Галаїв (хрестили їхніх дітей у 1902–1906 рр.), але про спорідненість документи не кажуть.',
    [('sutuha_oleksii_1924_stutthof_verkh.jpg', 90 * mm, 'Верх картки: «verstorben 14 März 1943»'),
     ('sutuha_oleksii_1924_stutthof_full.jpg', 150 * mm, 'Картка повністю')],
    'Arolsen Archives, 1.1.41.2, особова справа 01014102 130.166 (DocID 4655445)')

story += person('Василяк Андрій, нар. 07.04.1924, Веприк',
    ['Картка в’язня КТ Штуттгоф № 15523: Wasylak Andrej, 7.4.24, Weprik, Kr. Czernikow; сільгоспробітник, православний; батько помер, <b>мати — Ганна, з дому Лукашевська(?)</b>; гестапо Бромберга, причина — «Arbeitsverweigerung» (відмова працювати); у таборі з 6.8.1942; позначка «Erziehung».'],
    None,
    [('vasylak_andrii_1924_stutthof_karta.jpg', 120 * mm, None)],
    'Arolsen Archives, 1.1.41.2, особова справа 01014102 140.334 (DocID 4675810)')

story += person('Дривинський Олексій, 1926 р. н., Веприк',
    ['Картка заводу Kalle &amp; Co. AG, Вісбаден-Біберіх: № 7361, Drewinski Alexeij, Hilfswerker, 1926, Weprik/Russ., прибув 10.8.42 (тим самим транспортом, що й Іван Шутий), неодружений; вибув 29.3.43.'],
    None,
    [('dryvynskyi_oleksii_1926_kalle_karta.jpg', 80 * mm, 'Картка ліворуч')],
    'Arolsen Archives, картотека Kalle &amp; Co. AG (10003885)')

story += person('Галай(?) Катерина, нар. 05.12.1927, Веприк',
    ['Список хворих лікарні Св. Йосипа в Потсдамі (рукописний): «Halij Katharina, 5.12.27, Weprik/Ukraine», місце роботи — Dr. W. Kretschmer(?), Бабельсберг.'],
    'Є припущення: прізвище, найімовірніше, Галай — на підставі написання й села. Галаї — наша мамина лінія (прабабуся Феодосія Федорівна Галай). Батьком Катерини міг бути, наприклад, хтось із братів Феодосії — Панас (1902), Микола (1903) чи Семен (1905), але у Веприку були й інші родини Галаїв. Не доведено.',
    [('halai_kateryna_1927_ryadok.jpg', 40 * mm, 'Рядок: Halij Katharina, 5.12.27, Weprik/Ukraine'),
     ('halai_kateryna_1927_potsdam_full.jpg', 150 * mm, 'Уся сторінка')],
    'Arolsen Archives, 2.1.4.1 BB 020 (DocID 70955928)')

# ---- Вороньки
story += person('Турчин Микола, нар. 25.12.1901, Вороньки — військовополонений',
    ['Картка радянського військовополоненого, шталаг X B (Зандбостель): № 125447, «sowjet. Soldat», Turtschin Nikolaj, нар. 25.12.1901, д. Вороньки, Ново-Басанський р-н, Чернігівщина; селянин. 5.7.1942 прибув у шталаг X B; з 5.7.1942 — портове підприємство (Gesamthafenbetrieb, Бремен), з 10.12.1942 — робоча команда 301 (ремісник); 20.7.1944 — щеплення від тифу.'],
    'Турчини — давній вороньківський рід, у переписах 1767 і 1782 рр. Чи повернувся Микола — невідомо.',
    [('turchyn_mykola_1901_stalag_karta.jpg', 120 * mm, 'Картка військовополоненого'),
     ('turchyn_mykola_1901_robocha_karta.jpg', 110 * mm, 'Робоча картка')],
    'Arolsen Archives, 2.2.2.1 (DocID 76670389)')

story += person('Турчин Пелагея, 1911 р. н., Вороньки',
    ['Анкета реєстрації іноземця, громада Мозель (Німеччина): Pelagja Turtschin, 1911, Вороньки; неодружена, сільгоспробітниця; прибула 22.4.1943; останнє місце проживання — Вороньки, Чернігівщина; роботодавець — Louis Dittmar.'],
    None,
    [('turchyn_pelaheia_1911_anketa.jpg', 170 * mm, None)],
    'Arolsen Archives, 10006147 (DocID 75813930)')

story += person('Самойлик Анна, нар. 19.12.1922, Вороньки',
    ['Книга реєстрації громади Нідергебра (Тюрингія), № 35: Samojlik Anna, 19.12.22, «Woronki Kr. Nowo-Bas.» (Ново-Басанський р-н); прибула 10.06.1942.'],
    'Самойлики — вороньківський рід, у нашому дереві є давні Самойлики; чия Анна дочка — невідомо.',
    [('samoilyk_anna_1922_ryadok.jpg', 110 * mm, 'Рядки 33–36: № 35 — Samojlik Anna'),
     ('samoilyk_anna_1922_niedergebra_full.jpg', 120 * mm, 'Розворот книги')],
    'Arolsen Archives, 10008197 (DocID 71028289)')

story += person('Вовк Анастасія Яківна, нар. 03.04.1922, Вороньки',
    ['Список іноземців, Amt Lüdenscheid, Kreis Altena (Вестфалія), № 199: Wolk Anastasija Jakowlewna, 3.4.22, Woronki; працювала з 6.11.42 по 7.8.43, примітка — <b>«zurück in die Heimat» (повернулася на батьківщину)</b>. У тому ж списку № 203 — Величко Олександра Михайлівна, 25.3.22, Вороньки (6.11.42 – 11.4.45).'],
    None,
    [('vovk_anastasiia_1922_ludenscheid.jpg', 170 * mm, None)],
    'Arolsen Archives, 2.1.2.1 NW 004 (DocID 70572989)')

story += person('Лесек(?) Іван, нар. 10.03.1924, Вороньки',
    ['Картка в’язня КТ Штуттгоф № 15871: Lessek Iwan, 10.3.24, Woronki, Kr. Czernikow; сільгоспробітник, православний, неодружений; <b>батьки померли</b>; гестапо Дірхау(?)/Данцига, причина — «Arbeitsvertragsbruch» (порушення трудового договору); у таборі з 20.8.1942; позначка «Erziehung».'],
    'Прізвище в документі — Lessek; як воно звучало по-нашому (Лесик? Лісик?), невідомо.',
    [('lesek_ivan_1924_stutthof_karta.jpg', 120 * mm, None)],
    'Arolsen Archives, 1.1.41.2, особова справа 01014102 076.220 (DocID 4549206)')

story += person('Цюцюра Володимир, нар. 26.11.1925, Вороньки',
    ['Зобов’язання робітника (німецькою й російською) № 726, підписане 9.5.1942; власноручний підпис кирилицею: «Цюцюра Владимир». У покажчику: «Woronki Kreis Tschernigow».'],
    None,
    [('tsiutsiura_volodymyr_1925_zoboviazannia.jpg', 170 * mm, None)],
    'Arolsen Archives (DocID 78845836)')

story += person('Семена Анастасія, нар. 15.03.1910 (місце не вказано)',
    ['Список іноземців ITS 076, № 736: Semena, Anastasia, 15.3.1910; у Німеччині з 1.5.1942 до травня 1945, працювала в маєтку v. Wulffensche Loburg (Лобург); повернулася додому («i. d. Heimat zur.»). Місця народження в рядку немає.'],
    'Є припущення (дуже обережно): наша прабабуся Анастасія Макарівна Семена народилася приблизно 1909–1911 р., і в записі 1934 р. вона ще під дівочим прізвищем. Але в 1942 р. вона мала дітей 7–11 років, а матерів вивозили рідше; місця народження в документі немає. Чи хтось чув, що баба Настя була в Німеччині?',
    [('semena_anastasiia_1910_loburg_spysok.jpg', 170 * mm, 'Рядок 736: Semena, Anastasia, 15.3.10')],
    'Arolsen Archives, 2.1.4.2, документ 4685034 (DocID 70978154)')

story += person('Перчета Валентин, нар. 05.03.1925, Київ',
    ['Картка концтабору Дахау: Pertscheta Valentin, № 29982, «Sch» (в’язень «превентивного арешту»), нар. 5.3.1925 у Києві, учень, адреса — Київ, вул. Борщагівська, 102; прибув 6 травня 1942, переведений 5 червня 1942. Пізніше — номери 46489 / 2555 (довідкова картка табору Флоссенбюрг, ще один варіант написання — Piertscheta).'],
    'Прізвище Перчета — рідкісне; Перчети нашого дерева — з Озерян (Степан Діомидович Перчета, кінець XIX ст.). Чи Валентин з Києва — з тієї ж родини, невідомо. Можливо, хтось із Перчетів знає?',
    [('perchet_valentyn_1925_dachau_karta.jpg', 80 * mm, 'Картка КТ Дахау'),
     ('perchet_valentyn_1925_flossenburg_hinweis.jpg', 100 * mm, 'Довідкова картка (КТ Флоссенбюрг)')],
    'Arolsen Archives: 1.1.6 (Дахау), 1.1.8 (Флоссенбюрг), DocID 10724210, 1681737')

story += [Paragraph('Що далі', H2),
    Paragraph('Якщо хтось упізнає людину — напишіть, ким вона доводилася, чи повернулася додому, чи є фото або листи. Записи про народження 1922–1927 рр. (з іменами батьків) зберігаються в архіві; ми готуємо запит.', P),
    Paragraph('Копії документів надано Arolsen Archives (collections.arolsen-archives.org) для особистого дослідження. Підготував Максим Шутий, 07.11.2026.', SM)]


def deco(c, d):
    c.saveState()
    c.setFont('DV', 8)
    c.setFillColor(GREY)
    c.drawString(18 * mm, 10 * mm, 'Вороньки й Веприк в Arolsen Archives · для родини')
    c.drawRightString(A4[0] - 18 * mm, 10 * mm, str(d.page))
    c.restoreState()


doc = SimpleDocTemplate(OUT, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
                        title='Вороньки й Веприк в Arolsen Archives', author='Максим Шутий')
doc.build(story, onFirstPage=deco, onLaterPages=deco)
print(OUT)
