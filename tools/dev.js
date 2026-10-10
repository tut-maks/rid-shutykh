// Локальна перевірка без Supabase: DB_MOCK=1 node tools/dev.js  → http://localhost:3000
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
process.env.DB_MOCK = '1';
process.env.BOOTSTRAP_TOKEN ||= 'dev-bootstrap-token';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
process.chdir(ROOT);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const handlers = {};
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/')) {
    const name = u.pathname.slice(5).replace(/[^a-z]/g, '');
    try { handlers[name] ||= (await import(path.join(ROOT, 'api', name + '.js'))).default; return handlers[name](req, res); }
    catch (e) { res.statusCode = 404; return res.end('no api'); }
  }
  let f = path.join(ROOT, 'public', u.pathname === '/' ? 'index.html' : u.pathname);
  if (!f.startsWith(path.join(ROOT, 'public')) || !fs.existsSync(f)) f = path.join(ROOT, 'public', 'index.html');
  res.setHeader('content-type', MIME[path.extname(f)] || 'application/octet-stream');
  const csp = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')).headers[0].headers.find(h => h.key === 'Content-Security-Policy').value.replace('upgrade-insecure-requests', '');
  res.setHeader('content-security-policy', csp);
  res.end(fs.readFileSync(f));
}).listen(process.env.PORT || 3000, () => console.log('dev on', process.env.PORT || 3000));
