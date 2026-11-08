// Static build: src/ + register.json (+ brand assets) -> dist/. No bundler, no network.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeAssets, tokens } from './assets.mjs';

export const root = path.resolve(import.meta.dirname, '..');
const STATES = ['stated', 'absent', 'unconfirmed'];
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const HEX40 = /^0x[0-9a-fA-F]{40}$/;

const X_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
const GH_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function validate(reg) {
  const ids = new Set();
  for (const r of reg.records) {
    if (ids.has(r.id)) throw new Error('duplicate record ' + r.id);
    ids.add(r.id);
    if (!STATES.includes(r.state)) throw new Error(`record ${r.id}: bad state ${r.state}`);
    if (r.state !== 'stated') {
      for (const k of ['value', 'url', 'endpoints', 'rpc']) if (k in r) throw new Error(`record ${r.id} is ${r.state} and must not carry ${k}`);
    } else {
      if (r.id === 'ca' && !(B58.test(r.value || '') || HEX40.test(r.value || ''))) throw new Error('ca value is not address shaped');
      if ((r.id === 'x' || r.id === 'github') && !/^https:\/\//.test(r.url || '')) throw new Error(`${r.id} needs an https url`);
    }
  }
  return reg;
}

export const handleOf = (url, kind) => {
  const parts = new URL(url).pathname.split('/').filter(Boolean);
  if (!parts.length) return new URL(url).hostname;
  return kind === 'github' ? parts.slice(0, 2).join('/') : '@' + parts[0].replace(/^@/, '');
};

const publicRegister = (reg) => ({
  records: reg.records.map((r) => {
    const o = { id: r.id, label: r.label, state: r.state };
    if (r.state === 'stated') for (const k of ['value', 'url', 'endpoints']) if (k in r) o[k] = r[k];
    return o;
  }),
});

function social(rec, kind, svg) {
  const label = kind === 'x' ? 'X' : 'GitHub';
  if (rec && rec.state === 'stated') {
    const h = handleOf(rec.url, kind);
    return `<a class="icon-link" data-social="${kind}" data-state="stated" href="${esc(rec.url)}" target="_blank" rel="noopener noreferrer" aria-label="${label} ${esc(h)}">${svg}</a>`;
  }
  return `<span class="icon-link is-inert" data-social="${kind}" data-state="${rec ? rec.state : 'absent'}" role="img" aria-disabled="true" aria-label="${label}, pending">${svg}</span>`;
}

function caBand(rec) {
  if (rec && rec.state === 'stated') {
    return `<button class="ca" id="ca" type="button" data-state="stated" aria-label="Copy contract address"><span class="ca-k">Contract address</span><span class="ca-v">${esc(rec.value)}</span><span class="ca-act">Copy</span></button>`;
  }
  return `<div class="ca" id="ca" data-state="${rec ? rec.state : 'absent'}" aria-disabled="true"><span class="ca-k">Contract address</span><span class="ca-v">pending</span></div>`;
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, f.name), b = path.join(to, f.name);
    f.isDirectory() ? copyDir(a, b) : fs.copyFileSync(a, b);
  }
}

export async function build({ registerPath = path.join(root, 'register.json'), registerObj = null, out = path.join(root, 'dist'), assets = true } = {}) {
  out = path.resolve(out);
  const inside = (p) => p.startsWith(root + path.sep);
  if (!inside(out)) throw new Error('refusing to write outside the project: ' + out);
  const reg = validate(registerObj || JSON.parse(fs.readFileSync(registerPath, 'utf8')));
  const rec = (id) => reg.records.find((r) => r.id === id);
  const tk = tokens();

  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  copyDir(path.join(root, 'src', 'css'), path.join(out, 'css'));
  copyDir(path.join(root, 'src', 'js'), path.join(out, 'js'));
  if (assets) await makeAssets(out);

  let html = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
  const json = JSON.stringify(publicRegister(reg)).replace(/</g, '\\u003c');
  html = html
    .replace('{{THEME_COLOR}}', tk['color-bg'])
    .replace('{{SOCIAL}}', social(rec('x'), 'x', X_SVG) + social(rec('github'), 'github', GH_SVG))
    .replace('{{CA_BAND}}', caBand(rec('ca')))
    .replace('{{REGISTER_JSON}}', json);
  if (/\{\{[A-Z_]+\}\}/.test(html)) throw new Error('unreplaced placeholder');
  fs.writeFileSync(path.join(out, 'index.html'), html);
  fs.writeFileSync(path.join(out, '_headers'), '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n\n/assets/*\n  Cache-Control: public, max-age=86400\n');
  return { out, records: reg.records.length };
}

if (process.argv[1] && process.argv[1].endsWith('build.mjs')) {
  const r = await build();
  console.log('built', r.out, 'records', r.records);
}
