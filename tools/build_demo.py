# Збирає перегляд дизайну (artifact) з робочого інтерфейсу + seed: python3 tools/build_demo.py /home/claude/demo
import json, sys, os, shutil
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1]
os.makedirs(OUT + '/scans', exist_ok=True)
for f in os.listdir(ROOT + '/seed/scans'): shutil.copy(ROOT + '/seed/scans/' + f, OUT + '/scans/' + f)
seed = json.load(open(ROOT + '/seed/seed.json'))
app = open(ROOT + '/public/app.js').read()
css = open(ROOT + '/public/app.css').read()
docs = {d['id']: d['pages'] for d in seed['documents']}
old = "const img = (q, thumb) => `/api/file?${q}${thumb ? '&thumb=1' : ''}`;"
assert old in app
app = app.replace(old, """const img = (q, thumb) => { const u = new URLSearchParams(q); if (u.get('doc')) { const f = (window.DEMO_DOCS[u.get('doc')] || [])[Number(u.get('page') || 0)]; return 'scans/' + (thumb ? 't-' : '') + f; } return ''; };""")
shim = open(ROOT + '/tools/demo_shim.js').read().replace('__DOCS__', json.dumps(docs, ensure_ascii=False)).replace('__SEED__', json.dumps(seed, ensure_ascii=False))
html = f"""<title>Рід Шутих</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Old+Standard+TT:ital,wght@0,400;0,700;1,400&family=Golos+Text:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>{css}
.demo-note{{background:#2C4A6E;color:#fff;text-align:center;font-size:13px;padding:6px 16px}}</style>
<div class="demo-note">Перегляд дизайну. Дані справжні, але зміни тут не зберігаються. Робочий сайт буде на власному домені з входом за запрошенням.</div>
<div id="app"><div class="boot">Рід Шутих</div></div>
<div id="layer"></div>
<script>{shim}</script>
<script>{app}</script>"""
open(OUT + '/index.html', 'w').write(html)
print('ok', len(html))
