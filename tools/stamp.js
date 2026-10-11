// Позначка версії: node tools/stamp.js — оновлює public/version.json, BUILD у app.js і ?v= в index.html.
// Відкриті сторінки раз на кілька хвилин звіряють version.json і показують «Є оновлення — Оновити».
import fs from 'node:fs';
const v = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
fs.writeFileSync('public/version.json', JSON.stringify({ v }) + '\n');
const js = fs.readFileSync('public/app.js', 'utf8').replace(/const BUILD = '[^']*';/, `const BUILD = '${v}';`);
fs.writeFileSync('public/app.js', js);
const html = fs.readFileSync('public/index.html', 'utf8').replace(/\?v=[\w]+"/g, `?v=${v}"`);
fs.writeFileSync('public/index.html', html);
console.log('version', v);
