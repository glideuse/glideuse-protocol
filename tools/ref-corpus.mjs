// Builds research/reference-copy.txt from saved reference sources (visible text, attributes, string literals).
// Usage: node tools/ref-corpus.mjs <dir-with-index.html-site.js-ring.js>
import fs from 'node:fs';
import path from 'node:path';

const src = process.argv[2];
const root = path.resolve(import.meta.dirname, '..');
let html = fs.readFileSync(path.join(src, 'index.html'), 'utf8').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, ' ');
const attrs = [...html.matchAll(/(?:content|placeholder|title|aria-label)="([^"]*)"/g)].map((m) => m[1]);
const text = html.replace(/<[^>]+>/g, ' ');
const js = fs.readFileSync(path.join(src, 'site.js'), 'utf8') + '\n' + fs.readFileSync(path.join(src, 'ring.js'), 'utf8');
const lits = [];
const re = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
let m;
while ((m = re.exec(js))) lits.push(m[2].replace(/<[^>]+>/g, ' ').replace(/\$\{[^}]*\}/g, ' '));
fs.mkdirSync(path.join(root, 'research'), { recursive: true });
fs.writeFileSync(path.join(root, 'research', 'reference-copy.txt'), [text, ...attrs, ...lits].join('\n').replace(/[ \t]+/g, ' '));
console.log('corpus bytes', fs.statSync(path.join(root, 'research', 'reference-copy.txt')).size);
