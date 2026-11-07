# Arolsen (07.11): документи людей з Вороньків і Веприка — на сайт як документи (без прив'язки до карток, поки родина не підтвердить) + рядок в «Історії сіл».
import json, os
from PIL import Image
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/'
HQ = R + 'facts/arolsen/hq/arolsenhq_'
U = 'https://collections.arolsen-archives.org/en/search/person/'
SRC = 'Arolsen Archives (Бад-Арользен), онлайн-колекція; оригінал скану з сервера архіву, вивантажено 07.11.2026.'
D = [
 ('mykhailo1924', 'Шутий Михайло, 05.09.1924, Вороньки — список іноземців (Німеччина, 1943)', ['shutyi_mykhailo_1924_spysok_001'], '70976159',
  'Список іноземців ITS 063, № 3775: «Шутий Михайло, 05.09.1924, Woronky Tschernigow»; у колонці 8 — дата 19.5.43.', 'Вороньки'),
 ('ivan1926', 'Шутий (Schuti) Іван, 1926, Веприк — Kalle & Co. (Вісбаден), шахта в Дортмунді, Веферлінген (1942–1945)', ['shutyi_ivan_1926_kalle_001', 'shutyi_ivan_1926_dortmund_001', 'shutyi_ivan_1926_spysok_001', 'shutyi_ivan_1926_spysok_002'], '75793051',
  'Картка фірми Kalle & Co. AG, Вісбаден-Біберіх: № 7362, «Schuti Iwan», 03.11.1926, Weprik/Russ., Hilfswerker (підсобний робітник), прибув 10.8.42, неодружений, вибув 29.07.1943. Шахта «Adolf von Hansemann», Дортмунд, список росіян, № 328: «Schuti Iwan, 3.11.26, Weprik», працював 3.8.43–2.11.43. Список ITS 106, № 580: «Шутий Іван, 03.10.1926, Weprik Tschernigow», з 4.11.1943 — Gerhard-Schacht, Weferlingen; «v.d. amer. Besatzungstruppen abtransportiert April 1945» (вивезений американськими військами у квітні 1945).',
  'Веприк', 'Є припущення: усі три записи — одна людина (Іван, нар. 1926 у Веприку) — на підставі імені, прізвища, села, року й того, що дати йдуть одна за одною без перерв (Kalle 10.8.42–29.7.43 → Дортмунд 3.8.43–2.11.43 → Веферлінген з 4.11.43). Дата народження в одному записі 3.10, у двох — 3.11.'),
 ('dmytro1915', 'Шутий Дмитро, 1915, Веприк — міська лікарня Лерте (1943)', ['shutyi_dmytro_1915_lehrte_001'], '70590255',
  'Міська лікарня Лерте (біля Ганновера), список «Russen», № 179: «Шутий Дмитро, 1915, Weprik»; у лікарні 20.8.–13.9.1943, діагноз «Hypersekretion».', 'Веприк'),
 ('levchenko1924', 'Левченко Іван, 30.01.1924, Веприк — концтабір Штуттгоф (1942)', ['levchenko_ivan_1924_stutthof_001', 'levchenko_ivan_1924_stutthof_002'], '4550741',
  'КТ Штуттгоф, № 15683, Personalbogen: «Lewtschenko Iwan, 30.01.1924, Weprik, Krs. Czernikow»; неодружений, сільгоспробітник, православний, освіта — народна школа; у в\'язниці з 17.7.42, у таборі з 10.8.42; заарештований у Данцигу, причина — «seinen Arbeitsplatz verlassen» (залишив робоче місце); батько Овсій (Owschi) Левченко, мати Макрина.', 'Веприк',
  'Є припущення: батько Івана — Євсевій Іванович Левченко з Веприка (хрещений дітей Павла Яковича Левченка 1910 і 1912 рр.) — на підставі імені (Овсій — народна форма імені Євсевій), прізвища й села.'),
 ('dryvynskyi1923', 'Дривинський Володимир, 12.03.1923, Веприк — концтабір Штуттгоф, помер 13.10.1942', ['dryvynskyi_volodymyr_1923_a_001', 'dryvynskyi_volodymyr_1923_a_002', 'dryvynskyi_volodymyr_1923_b_001', 'dryvynskyi_volodymyr_1923_b_002', 'dryvynskyi_volodymyr_1923_c_001', 'dryvynskyi_volodymyr_1923_c_002', 'dryvynskyi_volodymyr_1923_d_001', 'dryvynskyi_volodymyr_1923_d_002'], '4453743',
  'КТ Штуттгоф, № 15659: «Drywinskij Wladimir, 12.03.1923, Weprik, Nowo-Basanski Rayon, Kr. Czernikow»; рішення гестапо Данцига 30.7.1942 — 42 дні табору примусового «виховання» за те, що самовільно залишив роботу; привезений 10.8.42; батьки Петро Дривинський («verschleppt» — вивезений) і Христина, з дому Шиян. Помер 13.10.1942 у лікарні в\'язнів КТ Штуттгоф, причина — «серцево-судинна недостатність»; спалений 17.10.1942.', 'Веприк'),
 ('dryvynskyi1926', 'Дривинський Олексій, 1926, Веприк — Kalle & Co., Вісбаден (1942–1943)', ['dryvynskyi_oleksii_1926_kalle_001'], '',
  'Картка фірми Kalle & Co. AG, Вісбаден-Біберіх: № 7361, «Drywinskij Alexej, 1926, Weprik/Russ.», Hilfswerker, прибув 10.8.42, неодружений, вибув 29.3.43.', 'Веприк'),
 ('sutuha1924', 'Сутуга Олексій, 21.04.1924, Веприк — концтабір Штуттгоф, помер 14.03.1943', ['sutuha_oleksii_1924_stutthof_001', 'sutuha_oleksii_1924_stutthof_002'], '4655445',
  'КТ Штуттгоф, № 16186: «Sutuga Alexej, 21.04.1924, Wejbrück Kreis Tschernikow»; сільгоспробітник; батько Микола Сутуга; привезений 4.9.42 (Stapo Danzig); «verstorben» (помер) 14.03.1943.', 'Веприк'),
 ('vasylak1924', 'Василяк Андрій, 07.04.1924, Веприк — концтабір Штуттгоф, помер 4.12.1942', ['vasylak_andrii_1924_stutthof_001', 'vasylak_andrii_1924_stutthof_002'], '4675810',
  'КТ Штуттгоф, № 15523: «Wasiljak Andrej, 07.04.1924, Weprik, Kr. Czernikow»; сільгоспробітник; батько помер, мати Ганна, з дому Лукашевська(?); Stapo Bromberg, «Arbeitsverweigerung» (відмова працювати); привезений 6.8.42. Помер 4.12.1942, спалений 8.12.1942.', 'Веприк'),
 ('halii1927', 'Галій(?) Катерина, 05.12.1927, Веприк — лікарня Св. Йосипа, Потсдам', ['halai_kateryna_1927_potsdam_001', 'halai_kateryna_1927_potsdam_002'], '70955928',
  'Список хворих лікарні Св. Йосипа, Потсдам (ITS 024): «Halÿ (Halij) Katharina, 05.12.1927, Weprik/Ukraine»; місце роботи — Dr. W. Kretschmer(?), Babelsberg II.', 'Веприк',
  'Є припущення: прізвище — Галай — на підставі написання й села.'),
 ('janok1924', 'Янок Микола, 28.08.1924, Веприк — концтабори Штуттгоф і Дахау (1942)', ['janok_mykola_1924_stutthof_001', 'janok_mykola_1924_stutthof_002'], '4502354',
  'КТ Штуттгоф, № 15680: «Janok Nikolaj, 28.08.1924, Weprik, Kr. Czernikow»; сільгоспробітник, православний; батьки Андрій Янок і Катерина, з дому Тщеленко(?); заарештований Stapo Danzig, причина «seinen Arbeitsplatz verlassen»; привезений 10.8.42; «Überführt am 14.11.42 KL. Dachau» — переведений у Дахау 14.11.1942.', 'Веприк',
  'За словами мами Максима, цей Микола Янок — не з нашої родини Янків.'),
 ('turchyn1901', 'Турчин Микола, 25.12.1901, Вороньки — радянський військовополонений, шталаг X B Зандбостель', ['turchyn_mykola_1901_stalag_001', 'turchyn_mykola_1901_stalag_002', 'turchyn_mykola_1901_stalag_003', 'turchyn_mykola_1901_stalag_004'], '76670389',
  'Особова картка військовополоненого, шталаг X B (Зандбостель), № 125447: «Turtschin Nikolaj, 25.12.1901, D. Woronki, Kr. Nowobasanskij, Gau Tschernigow», «sowjet. Sold.», селянин (Bauer); зріст 172, волосся чорне, очі блакитні, одружений, дітей 5. 5.7.42 прибув у шталаг X B; 5.7.42 — Gesamthafenbetrieb GmbH (портове підприємство, Бремен); 10.12.42 — Arbeitskommando 301, Handwerker; 20.7.44 — щеплення від тифу.', 'Вороньки'),
 ('turchyn1911', 'Турчин Пелагея, 1911, Вороньки — анкета іноземця, громада Мозель (1943)', ['turchyn_pelaheia_1911_anketa_001'], '75813930',
  'Анкета реєстрації іноземця, громада Мозель: «Turtschin Pelageja, 1911»; неодружена, сільгоспробітниця; прибула 22.4.1943; останнє місце проживання «Woronki, Kreis Tschernigow»; роботодавець Louis Dittmar.', 'Вороньки'),
 ('samoilyk1922', 'Самойлик Анна, 19.12.1922, Вороньки — Нідергебра, ткацька фабрика Otto Egeler (1942–1943)', ['samoilyk_anna_1922_niedergebra_001', 'samoilyk_anna_1922_niedergebra_spysok_001', 'samoilyk_anna_1922_niedergebra_spysok_002'], '71028289',
  'Реєстраційна книга громади Нідергебра, № 35: «Samoilik Anna, 19.12.1922, Woronki Kr. Nowo-Bas.», прибула 10.06.1942. Домовий список Нідергебра на 10.10.1943 — табір остарбайтерів ткацької фабрики Otto Egeler (Bleicherode), № 15, Weberin (ткаля).', 'Вороньки'),
 ('vovk1922', 'Вовк Анастасія Яківна, 03.04.1922, Вороньки — Люденшайд (1942–1943), повернулася додому', ['vovk_anastasiia_1922_ludenscheid_001'], '70572989',
  'Amt Lüdenscheid, Kreis Altena (Вестфалія), № 199: «Wowk Anastasija Jakowlewna, 03.04.1922, Woronki»; працювала 6.11.42–7.8.43, примітка «zurück in die Heimat» (повернулася на батьківщину). У тому ж списку № 203 — Величко Олександра Михайлівна, 25.3.22, Вороньки, 6.11.42–11.4.45.', 'Вороньки'),
 ('lesek1924', 'Лесек(?) Іван, 10.03.1924, Вороньки — концтабір Штуттгоф, помер 1.3.1943', ['lesek_ivan_1924_stutthof_001', 'lesek_ivan_1924_stutthof_002'], '4549206',
  'КТ Штуттгоф, № 15871: «Lesek(?) Iwan, 10.03.1924, Woronki, Kr. Czernikow»; сільгоспробітник, православний, неодружений, батьки померли; Stapo Dirschau(?)/Danzig, «Arbeitsvertragsbruch» (порушення трудового договору); привезений 20.8.42. Помер 1.3.1943, спалений 4.3.1943.', 'Вороньки'),
 ('tsiutsiura1925', 'Цюцюра Володимир, 26.11.1925, Вороньки — зобов\'язання робітника (1942)', ['tsiutsiura_volodymyr_1925_001'], '78845836',
  'Зобов\'язання робітника (нім./рос.), № 726: «Zuzura Wladimir, 26.11.1925, Woronki Kreis Tschernigow», підписане 9.5.42; підпис кирилицею «Цюцюра Владимир».', 'Вороньки'),
]
m = json.load(open(R + 'seed/import/manifest.json')); items = m['items'] if isinstance(m, dict) else m
have = {i['key'] for i in items}
os.makedirs(R + 'seed/import', exist_ok=True); n = 0
for row in D:
    slug, title, files, pid, line, vil = row[:6]; note = row[6] if len(row) > 6 else ''
    key = 'aro7-' + slug
    if key in have: continue
    F = []
    for k, f in enumerate(files):
        src = HQ + f + '.jpg'; im = Image.open(src).convert('RGB')
        fn = f'{key}-{k + 1}.jpg'; tn = f'{key}-{k + 1}-t.jpg'
        if max(im.size) > 2600: im.thumbnail((2600, 2600))
        im.save(R + 'seed/import/' + fn, quality=86); t = im.copy(); t.thumbnail((420, 420)); t.save(R + 'seed/import/' + tn, quality=80)
        F.append({'file': fn, 'thumb': tn})
    text = f'Документ з архіву Arolsen про жителя {"Веприка" if vil == "Веприк" else "Вороньків"}, якого під час Другої світової війни вивезли до Німеччини. До картки в дереві поки не прив\'язано: родина ще не підтвердила, хто це. ' + note
    items.append({'key': key, 'kind': 'doc', 'id': 'aro7' + slug, 'files': F, 'data': {'title': 'Arolsen: ' + title, 'place': '', 'src': SRC, 'url': (U + pid) if pid else 'https://collections.arolsen-archives.org/', 'line': line, 'text': text.strip(), 'people': []}})
    n += 1
json.dump(m, open(R + 'seed/import/manifest.json', 'w'), ensure_ascii=False, indent=1)
print('додано', n)
