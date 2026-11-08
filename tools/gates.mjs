// npm run gates: static, register, and runtime checks over dist/ plus generated state variants.
// Every register-dependent check reads the record state at run time; nothing hardcodes an expected state.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { JSDOM, VirtualConsole } from 'jsdom';
import { build, root, validate, handleOf } from './build.mjs';

const VERBOSE = process.argv.includes('--verbose');
let total = 0; const failed = [];
const check = (name, cond, detail) => {
  total++;
  if (!cond) { failed.push(name); console.log('FAIL', name, detail === undefined ? '' : '::', detail === undefined ? '' : String(detail).slice(0, 300)); }
  else if (VERBOSE) console.log('ok  ', name);
};
const section = (s) => console.log('\n== ' + s);
const read = (p) => fs.readFileSync(p, 'utf8');
const walk = (d, skip = () => false) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => { const p = path.join(d, e.name); if (skip(p, e)) return []; return e.isDirectory() ? walk(p, skip) : [p]; });
const DIST = path.join(root, 'dist');
const REG = JSON.parse(read(path.join(root, 'register.json')));

/* ============================================================ helpers */
const B58G = /(?<![A-Za-z0-9])[1-9A-HJ-NP-Za-km-z]{32,44}(?![A-Za-z0-9])/g;
const HEXG = /(?<![A-Za-z0-9])0x[0-9a-fA-F]{40}(?![A-Za-z0-9])/g;
/** Address-shaped strings must match a stated register value. 0x hex is matched, never rejected outright. */
export function scanAddresses(text, statedValues) {
  const ok = new Set(statedValues);
  const found = [...(text.match(B58G) || []), ...(text.match(HEXG) || [])];
  return found.filter((s) => !ok.has(s));
}
const STOP = new Set('a an and are as at be by for from has have i in into is it its of on or that the their this to we with you your up our not no so than then there these those was were will can may more most one each every'.split(' '));
const words = (t) => (t.toLowerCase().match(/[a-z0-9]+(?:'[a-z]+)?/g) || []);
const bigrams = (t) => { const s = new Set(); for (const sent of t.split(/[.!?:;,\n|()]+/)) { const w = words(sent); for (let i = 0; i < w.length - 1; i++) if (!(STOP.has(w[i]) && STOP.has(w[i + 1]))) s.add(w[i] + ' ' + w[i + 1]); } return s; };
const DATE_PATTERNS = [
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i,
  /\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i,
  /\b(19|20)\d{2}\b/, /\b\d{1,4}[/-]\d{1,2}[/-]\d{1,4}\b/, /\b\d{1,2}:\d{2}(:\d{2})?\b/,
  /\bas of\b/i, /\bchecked\b/i, /\bupdated\b/i, /\blast sync/i, /\b\d+\s*(s|m|h|d|min|sec|hours?|days?|minutes?)\s+ago\b/i, /\b(today|yesterday|tomorrow)\b/i,
];
const dateHits = (t) => DATE_PATTERNS.filter((re) => re.test(t)).map(String);

function visibleText(html) {
  const dom = new JSDOM(html);
  const d = dom.window.document;
  d.querySelectorAll('script, style, noscript').forEach((n) => n.remove());
  const attrs = [];
  d.querySelectorAll('[title],[aria-label],[alt],[placeholder]').forEach((n) => ['title', 'aria-label', 'alt', 'placeholder'].forEach((a) => n.hasAttribute(a) && attrs.push(n.getAttribute(a))));
  d.querySelectorAll('meta[content]').forEach((m) => { if (/description|title/.test((m.getAttribute('name') || '') + (m.getAttribute('property') || ''))) attrs.push(m.getAttribute('content')); });
  const out = d.body.textContent + '\n' + attrs.join('\n') + '\n' + d.title;
  dom.window.close();
  return out;
}
function jsLiterals(src) {
  src = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
  const out = []; const re = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g; let m;
  const prose = /^[A-Za-z][A-Za-z0-9 ,.'’\-—:;!?]*$/;
  while ((m = re.exec(src))) { const s = m[2].replace(/<[^>]+>/g, ' ').replace(/\$\{[^}]*\}/g, ' '); if (/\s/.test(s.trim()) && prose.test(s.trim())) out.push(s); }
  return out.join('\n');
}

/* ============================================================ A. repo and hygiene */
section('repo hygiene');
{
  const all = walk(root, (p, e) => e.isDirectory() && ['node_modules', 'dist', '.git'].includes(e.name));
  check('no CLAUDE.md in project', !all.some((f) => /claude\.md$/i.test(f)));
  check('no .claude directory', !fs.existsSync(path.join(root, '.claude')));
  const bad = new RegExp('\\b(' + ['cla' + 'ude', 'anth' + 'ropic', 'chat' + 'gpt', 'open' + 'ai', 'copi' + 'lot'].join('|') + ')\\b|co-authored-by|generated (by|with) (an? )?(ai|llm)', 'i');
  const hits = all.filter((f) => /\.(md|json|mjs|js|css|html|svg|txt)$/i.test(f) && !/(gates\.mjs|package-lock\.json|reference-copy\.txt)$/.test(f) && bad.test(read(f)));
  check('no AI attribution in any project text file', hits.length === 0, hits.join(', '));
  check('README.md at root', fs.existsSync(path.join(root, 'README.md')));
  check('docs/whitepaper.md at root', fs.existsSync(path.join(root, 'docs', 'whitepaper.md')));
  const lic = fs.existsSync(path.join(root, 'LICENSE')) ? read(path.join(root, 'LICENSE')) : '';
  check('LICENSE is MIT, GLIDE, 2026', /MIT License/.test(lic) && /Copyright \(c\) 2026 GLIDE/.test(lic));
  const rd = fs.existsSync(path.join(root, 'README.md')) ? read(path.join(root, 'README.md')) : '';
  check('README has badge, Solana, CA placeholder and sections', /shields\.io|img\.shields/.test(rd) && /Solana/.test(rd) && /(CA|Contract)/i.test(rd) && /## Overview/.test(rd) && /## Features/.test(rd) && /## Links/.test(rd));
  const wp = fs.existsSync(path.join(root, 'docs', 'whitepaper.md')) ? read(path.join(root, 'docs', 'whitepaper.md')) : '';
  check('whitepaper has vision, tokenomics placeholders, roadmap, team', /Vision/i.test(wp) && /Tokenomics/i.test(wp) && /Roadmap/i.test(wp) && /Team/i.test(wp) && (wp.match(/^### Phase|^## Phase/gm) || []).length >= 3);
  const names = fs.existsSync(DIST) ? walk(DIST).map((f) => path.relative(DIST, f).replace(/\\/g, '/')) : [];
  check('dist exists with index.html', names.includes('index.html'));
  check('repo files not inside dist', !names.some((n) => /^(README|LICENSE|CLAUDE|register\.json|package)/i.test(n) || /^(docs|research|tools|node_modules)\//.test(n)));
}

/* ============================================================ B. palette */
section('palette');
const TOK = read(path.join(root, 'src', 'css', 'tokens.css'));
const tokenHex = new Set([...TOK.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toLowerCase()));
{
  const srcFiles = walk(path.join(root, 'src')).filter((f) => /\.(css|js|html)$/.test(f) && !f.endsWith('tokens.css'));
  const lit = srcFiles.filter((f) => /#[0-9a-fA-F]{3,8}\b/.test(read(f).replace(/&#\d+;/g, '').replace(/href="#[a-z-]+"/g, '')));
  check('colour literals live in tokens.css only (src)', lit.length === 0, lit.join(', '));
  const distText = walk(DIST).filter((f) => /\.(css|js|html|svg|json)$/.test(f));
  const strays = [];
  for (const f of distText) for (const m of read(f).matchAll(/#[0-9a-fA-F]{6}\b/g)) if (!tokenHex.has(m[0].toLowerCase())) strays.push(path.basename(f) + ':' + m[0]);
  check('every hex in dist is a palette token', strays.length === 0, strays.join(', '));
  check('palette has provenance on every token', [...TOK.matchAll(/--color-[a-z0-9-]+:\s*#[0-9a-fA-F]{6};\s*\/\*([^*]*)\*\//g)].length === tokenHex.size && tokenHex.size >= 10);
  // each snapped token is a real pixel in the named image
  const resolveImg = (name) => { const dir = name.split('/')[0]; const base = name.split('/')[1]; const f = fs.readdirSync(path.join(root, dir)).find((x) => x.startsWith(base)); return path.join(root, dir, f); };
  let px = 0, bad = [];
  for (const m of TOK.matchAll(/(#[0-9a-fA-F]{6});\s*\/\*\s*(kmeans|bucket),\s*([^,]+),\s*(\d+),(\d+)/g)) {
    const exact = (name) => name;
    const imgPath = (() => { const n = m[3].trim(); const cands = ['brand/LOGO GLIDE PNG...png', 'brand/LOGO GLIDE PNG.png', 'reference/GLIDE 1.jpg.jpeg', 'reference/SAMPUL GLIDE JPG.jpg.jpeg']; const hit = cands.find((c) => c.toLowerCase().startsWith(n.toLowerCase())) || cands.find((c) => c.toLowerCase().includes(n.toLowerCase().replace(/\.png$/, ''))); return path.join(root, hit || n); })();
    const { data, info } = await sharp(imgPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const x = +m[4], y = +m[5], o = (y * info.width + x) * 4;
    const hex = '#' + [0, 1, 2].map((i) => data[o + i].toString(16).padStart(2, '0')).join('');
    px++; if (hex !== m[1].toLowerCase()) bad.push(`${m[1]}@${x},${y} is ${hex} in ${path.basename(imgPath)}`);
  }
  check('palette tokens equal the real pixel at their recorded coordinate', px >= 10 && bad.length === 0, bad.join('; '));
}

/* ============================================================ C. assets and favicon */
section('assets and favicon');
{
  const rep = JSON.parse(read(path.join(root, 'research', 'assets-report.json')));
  check('every brand and reference file was read (report covers all)', rep.length === fs.readdirSync(path.join(root, 'brand')).length + fs.readdirSync(path.join(root, 'reference')).length);
  const rgba = rep.find((r) => r.header.colourType === 6);
  check('IHDR colour types recorded for PNG sources', rep.filter((r) => r.header.fmt === 'png').every((r) => [2, 6].includes(r.header.colourType)));
  check('pure black transparent area found in the RGBA source', !!rgba && rgba.pureBlackTransparent > 1000000);
  const meta = async (f) => sharp(path.join(DIST, f)).metadata();
  const m192 = await meta('assets/logo-192.png');
  check('logo-192 is 192x192 RGBA', m192.width === 192 && m192.height === 192 && m192.channels === 4 && m192.hasAlpha);
  const m512 = await meta('assets/logo-512.png'); check('logo-512 is 512x512', m512.width === 512 && m512.height === 512);
  const mb = await meta('brand/glide-logo.png'); check('brand/glide-logo.png exists with alpha', mb.hasAlpha && mb.width >= 192);
  const ma = await meta('assets/apple-touch-icon.png'); check('apple touch icon 180x180', ma.width === 180 && ma.height === 180);
  const mo = await meta('assets/og.png'); check('social card 1200x630', mo.width === 1200 && mo.height === 630);
  // premultiplied resize: no dark halo on partial alpha pixels
  const { data } = await sharp(path.join(DIST, 'assets/logo-512.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const acc = [0x6a, 0xce, 0xf1]; let edge = 0, dark = 0;
  for (let i = 0; i < data.length; i += 4) { const a = data[i + 3]; if (a > 20 && a < 235) { edge++; if (Math.abs(data[i] - acc[0]) + Math.abs(data[i + 1] - acc[1]) + Math.abs(data[i + 2] - acc[2]) > 120) dark++; } }
  check('resized edges carry no dark fringe (premultiplied)', edge > 200 && dark / edge < 0.02, `edge ${edge} dark ${dark}`);

  const svg = read(path.join(DIST, 'favicon.svg'));
  check('favicon is 32x32 svg', /width="32"/.test(svg) && /height="32"/.test(svg) && /viewBox="0 0 32 32"/.test(svg));
  check('favicon has no comments or double hyphens', !/<!--/.test(svg) && !/--/.test(svg));
  const fdom = new JSDOM(svg, { contentType: 'image/svg+xml' });
  const pathEl = fdom.window.document.querySelector('path');
  const d = pathEl ? pathEl.getAttribute('d') : '';
  check('favicon parses as xml with a traced path', !!pathEl && (d.match(/[ML]/g) || []).length >= 12);
  check('favicon colours are palette tokens', [...svg.matchAll(/#[0-9a-f]{6}/g)].every((m) => tokenHex.has(m[0])));
  // trace fidelity: rasterise the glyph and compare with the logo mask under the same transform
  const R = 256, S = 8;
  const gl = await sharp(Buffer.from(svg.replace(/<rect[^>]*\/>/, '')), { density: 72 * S }).resize(R, R).ensureAlpha().raw().toBuffer();
  const srcLogo = path.join(root, 'brand', 'LOGO GLIDE PNG...png');
  const { data: sd, info } = await sharp(srcLogo).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = 0, y1 = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (sd[(y * info.width + x) * 4 + 3] >= 128) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const gw = x1 - x0 + 1, gh = y1 - y0 + 1, sc = (22 / Math.max(gw, gh)) * S, offx = (32 * S - gw * sc) / 2, offy = (32 * S - gh * sc) / 2;
  let inter = 0, uni = 0;
  for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
    const sx = Math.round((x - offx) / sc) + x0, sy = Math.round((y - offy) / sc) + y0;
    const inLogo = sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1 && sd[(sy * info.width + sx) * 4 + 3] >= 128;
    const inFav = gl[(y * R + x) * 4 + 3] >= 128;
    if (inLogo && inFav) inter++; if (inLogo || inFav) uni++;
  }
  check('favicon trace overlaps the logo pixel grid (IoU >= 0.93)', inter / uni >= 0.93, (inter / uni).toFixed(3));
}

/* ============================================================ D. register */
section('register');
{
  let ok = true; try { validate(JSON.parse(JSON.stringify(REG))); } catch (e) { ok = false; check('register validates', false, e.message); }
  check('register validates', ok);
  const need = ['chain', 'ca', 'x', 'github', 'market-source', 'own-token-source'];
  check('register holds every external fact as one record', need.every((id) => REG.records.filter((r) => r.id === id).length === 1));
  check('chain record is Solana with the stated rpc', (() => { const c = REG.records.find((r) => r.id === 'chain'); return c.state === 'stated' && c.value === 'Solana' && c.endpoints.rpc === 'https://solana-rpc.publicnode.com' && c.source === 'client statement' && c.scope === 'batch-level'; })());
  check('inert records carry no value or url', REG.records.filter((r) => r.state !== 'stated').every((r) => !('value' in r) && !('url' in r) && !('endpoints' in r)));
  check('stated records carry source and scope', REG.records.every((r) => r.source && r.scope));
  check('dates exist in register.json as data', REG.records.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.checkedAt || '')));
  const distAll = walk(DIST).filter((f) => /\.(html|js|css|json|svg|txt)$/.test(f)).map(read).join('\n');
  check('no register date reaches dist', !/checkedAt/.test(distAll) && !/\b\d{4}-\d{2}-\d{2}\b/.test(distAll));
  // negative: validator refuses a value on an inert record, and a state outside the three
  let t1 = false, t2 = false;
  try { validate({ records: [{ id: 'ca', state: 'absent', value: 'x' }] }); } catch (e) { t1 = true; }
  try { validate({ records: [{ id: 'ca', state: 'maybe' }] }); } catch (e) { t2 = true; }
  check('validator rejects inert record with value', t1);
  check('validator rejects unknown state', t2);
}

/* ============================================================ E. static css and js rules */
section('css and js rules');
const CSS = read(path.join(root, 'src', 'css', 'site.css'));
{
  const all = CSS + walk(path.join(root, 'src')).filter((f) => /\.(js|html)$/.test(f)).map(read).join('\n');
  check('no ch units anywhere', !/\d(\.\d+)?ch\b/.test(all));
  const rules = [...CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
  check('social icons are never hidden at any breakpoint', !rules.some((r) => /icon-link|top-r|data-social/.test(r.sel) && /display:\s*none|visibility:\s*hidden/.test(r.body)));
  const h44 = (re) => rules.some((r) => re.test(r.sel) && /(min-)?height:\s*44px/.test(r.body));
  check('tap targets are at least 44 tall: icons, buttons, tabs, copy, nav', h44(/^\.icon-link$/) && h44(/^\.btn$/) && h44(/^\.cats button$/) && h44(/^\.copy$/) && h44(/^\.links a$/) && h44(/^\.foot nav a$/) && h44(/^\.brand$/));
  check('icon and copy buttons are 44 wide', rules.some((r) => /^\.icon-link$/.test(r.sel) && /width:\s*44px/.test(r.body)) && rules.some((r) => /^\.copy$/.test(r.sel) && /width:\s*44px/.test(r.body)));
  const own = rules.find((r) => /^\.board \.r\.own$/.test(r.sel));
  check('own row border and pulse follow the spec', !!own && /border-left:\s*2px solid var\(--color-mint\)/.test(own.body) && /animation:\s*ownPulse 2s ease-in-out infinite/.test(own.body));
  check('ownPulse keyframes exist and stay low opacity', /@keyframes ownPulse/.test(CSS) && /ownPulse\s*\{[^@]*color-mix\(in srgb, var\(--color-mint\) (3|10)%/.test(CSS));
  const red = CSS.slice(CSS.indexOf('@media (prefers-reduced-motion: reduce)'));
  check('reduced motion block kills animation and transition globally', /animation:\s*none\s*!important/.test(red) && /transition:\s*none\s*!important/.test(red));
  check('reduced motion block stops own row pulse', /\.board \.r\.own\s*\{\s*animation:\s*none/.test(red));
  check('spotlight rule exists', /\.spot::before/.test(CSS) && /var\(--mx/.test(CSS));
  check('mobile board collapses without hiding data', /grid-template-areas/.test(CSS) && !/\.board \.r \.(vol|liq|price|chg)[^{]*\{[^}]*display:\s*none/.test(CSS));
  const js = (f) => read(path.join(root, 'src', 'js', f));
  check('no Date use in any script', !walk(path.join(root, 'src', 'js')).some((f) => /\bDate\b/.test(read(f))));
  check('market.js reads market-source and never the ca record or own state', /rec\('market-source'\)/.test(js('market.js')) && !/rec\(['"]ca['"]\)|GL\.own|\.stated\(['"]ca/.test(js('market.js')));
  check('own.js reads ca at runtime', /GL\.rec\('ca'\)/.test(js('own.js')) && /own-token-source/.test(js('own.js')));
  check('own.js pairs by baseToken.address and sorts volume.h24', /baseToken\.address === ca/.test(js('own.js')) && /volume\.h24/.test(js('own.js')));
  check('own.js logs the two console lines', /\[glide\] own token raw response/.test(js('own.js')) && /\[glide\] own liquidity candidates/.test(js('own.js')));
  check('own.js runs the two requests in parallel', /Promise\.all/.test(js('own.js')));
  check('no unreliable dexscreener logo host anywhere', !walk(path.join(root, 'src')).some((f) => /dd\.dexscreener\.com/.test(read(f))) && !/dd\.dexscreener\.com/.test(distAllText()));
  check('core exposes spring, reveal, spotlight, progress', ['GL.spring', 'GL.reveal', 'GL.spotlight', 'GL.progress'].every((k) => js('core.js').includes(k)));
  check('poll interval is 60s with doubling backoff and visibility handling', /POLL_MS = 60000/.test(js('market.js')) && /Math\.pow\(2/.test(js('market.js')) && /visibilitychange/.test(js('market.js')) && /document\.hidden/.test(js('market.js')));
  check('letter tile uses two letters', /slice\(0, 2\)/.test(js('core.js')));
}
function distAllText() { return walk(DIST).filter((f) => /\.(html|js|css|json|svg)$/.test(f)).map(read).join('\n'); }

/* ============================================================ F. address scanner self-test */
section('address scanner');
{
  const sol = crypto.randomBytes(32); const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const b58 = (buf) => { let n = BigInt('0x' + buf.toString('hex')), s = ''; while (n > 0n) { s = A[Number(n % 58n)] + s; n /= 58n; } return s.padStart(32, '1'); };
  const addr = b58(sol), hex = '0x' + crypto.randomBytes(20).toString('hex'), other = b58(crypto.randomBytes(32));
  check('scanner passes a stated solana address', scanAddresses(`x ${addr} y`, [addr]).length === 0);
  check('scanner passes a stated 0x address (not blanket rejected)', scanAddresses(`x ${hex} y`, [hex]).length === 0);
  check('scanner flags an unstated solana address', scanAddresses(other, [addr]).length === 1);
  check('scanner flags an unstated 0x address', scanAddresses(hex, [addr]).length === 1);
  check('scanner ignores ordinary long words', scanAddresses('internationalization-and-localization pseudo', []).length === 0);
  check('current dist has no address-shaped string beyond stated values', (() => { const stated = REG.records.filter((r) => r.state === 'stated' && r.value).map((r) => r.value); return scanAddresses(distAllText(), stated).length === 0; })(), scanAddresses(distAllText(), []).join(','));
}

/* ============================================================ G. variants */
const b58rand = () => { const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'; let s = ''; for (const b of crypto.randomBytes(44)) s += A[b % 58]; return s; };
const flipReg = (reg, ca) => {
  const r = JSON.parse(JSON.stringify(reg));
  for (const rec of r.records) {
    if (!['ca', 'x', 'github'].includes(rec.id)) continue;
    if (rec.state === 'stated') { rec.state = 'absent'; delete rec.value; delete rec.url; }
    else { rec.state = 'stated'; if (rec.id === 'ca') rec.value = ca; if (rec.id === 'x') rec.url = 'https://x.com/glide_gate_probe'; if (rec.id === 'github') rec.url = 'https://github.com/glide-gate/probe'; }
  }
  return r;
};
const forceStated = (reg, ca) => { const r = JSON.parse(JSON.stringify(reg)); for (const rec of r.records) { if (rec.id === 'ca') { rec.state = 'stated'; rec.value = ca; } } return r; };
const forceAbsent = (reg) => { const r = JSON.parse(JSON.stringify(reg)); for (const rec of r.records) if (['ca', 'x', 'github'].includes(rec.id)) { rec.state = 'absent'; delete rec.value; delete rec.url; } return r; };
const tmp = fs.mkdtempSync(path.join(root, '.gates-tmp-'));
const CA_T = b58rand(), CA_HEX = '0x' + crypto.randomBytes(20).toString('hex');
const variants = [
  { id: 'current', reg: REG },
  { id: 'flipped', reg: flipReg(REG, CA_T) },
  { id: 'ca-stated', reg: forceStated(REG, CA_T) },
  { id: 'all-absent', reg: forceAbsent(REG) },
  { id: 'ca-0x', reg: forceStated(REG, CA_HEX) },
];
for (const v of variants) { v.dir = path.join(tmp, v.id); await build({ registerObj: v.reg, out: v.dir, assets: false }); }

/* ---- runtime harness */
const TOKS = (n) => Array.from({ length: n }, (_, i) => 'Tok' + String(i).padStart(2, '0') + 'x'.repeat(30));
function makeFeed({ ca, includeCA = false, priceBump = 0 }) {
  const sol = TOKS(12); if (includeCA && ca) sol[2] = ca;
  const boosts = [...sol.map((a) => ({ chainId: 'solana', tokenAddress: a })), { chainId: 'ethereum', tokenAddress: '0x' + '1'.repeat(40) }, { chainId: 'base', tokenAddress: '0x' + '2'.repeat(40) }, { chainId: 'solana', tokenAddress: sol[0] }];
  const missing = new Set([1, 3, 4]);
  const pairs = [];
  sol.forEach((a, i) => {
    const info = missing.has(i) ? undefined : { imageUrl: `https://cdn.example.test/img/${i}.png` };
    pairs.push({ chainId: 'solana', baseToken: { address: a, symbol: 'T' + i, name: 'Token ' + i }, priceUsd: String(0.5 + i + (i === 5 ? priceBump : 0)), priceChange: { h24: i % 2 ? -1.5 * i : 2.5 * i }, volume: { h24: 1e6 * (20 - i) }, liquidity: { usd: 1000 * (i + 1) }, info });
    if (i === 6) pairs.push({ chainId: 'solana', baseToken: { address: a, symbol: 'T6', name: 'Token 6' }, priceUsd: '99', volume: { h24: 5 }, liquidity: { usd: 1 } });
  });
  return { boosts, pairs, sol };
}
function makeFetch(opts) {
  const calls = [];
  const state = { failBoosts: !!opts.failBoosts, failOwn: !!opts.failOwn, failPump: !!opts.failPump, bump: 0, liqUsd: opts.liqUsd == null ? 0 : opts.liqUsd };
  const impl = (w) => async (url) => {
    url = String(url); calls.push(url);
    const reply = (data) => ({ ok: true, status: 200, json: async () => data });
    const feed = makeFeed({ ca: opts.ca, includeCA: opts.includeCA, priceBump: state.bump });
    if (url.includes('token-boosts')) { if (state.failBoosts) throw new Error('boosts down'); return reply(feed.boosts); }
    if (url.includes('/tokens/v1/solana/')) { if (state.failBoosts) throw new Error('pairs down'); const ask = decodeURIComponent(url.split('/solana/')[1]).split(','); const out = feed.pairs.filter((p) => ask.includes(p.baseToken.address)); if (opts.includeCA && opts.ca && ask.includes(opts.ca)) out.push({ chainId: 'solana', baseToken: { address: opts.ca, symbol: 'DUP', name: 'Dup' }, priceUsd: '1', volume: { h24: 1e6 * 17 }, liquidity: { usd: 5 } }); return reply(out); }
    if (url.includes('/latest/dex/tokens/')) {
      if (state.failOwn) throw new Error('own down');
      return reply({ pairs: [
        { chainId: 'solana', pairAddress: 'p1', baseToken: { address: opts.ca, symbol: 'GLD', name: 'Glide' }, priceUsd: '0.0123', priceChange: { h24: 4.5 }, volume: { h24: 1000 }, liquidity: { usd: 0 }, marketCap: 555000 },
        { chainId: 'solana', pairAddress: 'p2', baseToken: { address: opts.ca, symbol: 'GLD', name: 'Glide' }, priceUsd: '0.02', priceChange: { h24: -2 }, volume: { h24: 5000 }, liquidity: { usd: state.liqUsd }, marketCap: 777000 },
        { chainId: 'solana', pairAddress: 'p3', baseToken: { address: 'SomethingElse'.padEnd(40, 'x'), symbol: 'ZZZ', name: 'Z' }, priceUsd: '5', volume: { h24: 99999999 }, liquidity: { usd: 5 }, marketCap: 1 },
      ] });
    }
    if (url.includes('pump.fun')) { if (state.failPump) throw new Error('cors'); return reply({ image_uri: 'https://pump.example.test/logo.png' }); }
    throw new Error('unexpected ' + url);
  };
  return { impl, calls, state };
}
async function runPage(dir, { fetcher, reduced = false, hidden = false, settle = true } = {}) {
  const logs = []; const vc = new VirtualConsole();
  vc.on('log', (...a) => logs.push(a)); vc.on('jsdomError', () => {});
  const dom = await JSDOM.fromFile(path.join(dir, 'index.html'), {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.fetch = fetcher.impl(w);
      w.matchMedia = (q) => ({ matches: reduced && /reduce/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (t) => { w.__copied = t; } }, configurable: true });
      w.HTMLCanvasElement.prototype.getContext = () => null;
      w.Element.prototype.scrollIntoView = () => {};
      if (hidden) Object.defineProperty(w.document, 'hidden', { get: () => true, configurable: true });
    },
  });
  const w = dom.window;
  await new Promise((r) => { if (w.document.readyState === 'complete') r(); else w.addEventListener('load', r); });
  if (settle) { await w.GL.market.first; await w.GL.own.first; await new Promise((r) => setTimeout(r, 40)); }
  return { dom, w, d: w.document, GL: w.GL, logs, close: () => w.close() };
}
const rowsOf = (d) => Array.from(d.querySelectorAll('#board-body .r'));

for (const v of variants) {
  section('variant ' + v.id);
  const rec = (id) => v.reg.records.find((r) => r.id === id);        // state is read per variant, never assumed
  const html = read(path.join(v.dir, 'index.html'));
  const sd = new JSDOM(html); const sdoc = sd.window.document;
  const caStated = rec('ca').state === 'stated';
  // CA slot
  const slot = sdoc.getElementById('ca');
  check(`[${v.id}] CA slot is first in the page header`, !!slot && !!sdoc.querySelector('header.top #ca'));
  if (caStated) {
    check(`[${v.id}] stated CA shows the full address in a copy button`, slot.tagName === 'BUTTON' && slot.querySelector('.ca-v').textContent === rec('ca').value && slot.dataset.state === 'stated');
  } else {
    check(`[${v.id}] absent CA slot is inert: label and pending only`, slot.tagName !== 'BUTTON' && slot.getAttribute('aria-disabled') === 'true' && slot.querySelector('.ca-v').textContent === 'pending' && !slot.querySelector('a,button'));
  }
  // social
  for (const [id, kind] of [['x', 'x'], ['github', 'github']]) {
    const node = sdoc.querySelector(`.top-r [data-social="${kind}"]`);
    check(`[${v.id}] ${id} icon present in the top-right group`, !!node && !!node.querySelector('svg'));
    if (rec(id).state === 'stated') {
      check(`[${v.id}] ${id} icon links to the stored url with derived handle`, node.tagName === 'A' && node.getAttribute('href') === rec(id).url && node.getAttribute('aria-label').includes(handleOf(rec(id).url, kind)) && /noopener/.test(node.rel));
    } else {
      check(`[${v.id}] ${id} icon is inert: no href, no url`, node.tagName !== 'A' && !node.hasAttribute('href') && node.getAttribute('aria-disabled') === 'true' && !/https?:/.test(node.outerHTML));
    }
  }
  const icons = sdoc.querySelectorAll('.top-r .icon-link').length;
  check(`[${v.id}] exactly two social icons in markup`, icons === 2);
  check(`[${v.id}] official X and Octicon paths`, html.includes('M18.244 2.25h3.308l-7.227 8.26') && html.includes('M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59'));
  // embedded public register mirrors the variant
  const pub = JSON.parse(sdoc.getElementById('glide-register').textContent);
  check(`[${v.id}] embedded register keeps states and withholds values of inert records`, v.reg.records.every((r) => { const p = pub.records.find((q) => q.id === r.id); return p && p.state === r.state && (r.state === 'stated' || (!('value' in p) && !('url' in p) && !('endpoints' in p))); }));
  // address scanner against this variant's stated registry
  const stated = v.reg.records.filter((r) => r.state === 'stated' && r.value).map((r) => r.value);
  const vtxt = walk(v.dir).filter((f) => /\.(html|js|css|json|svg)$/.test(f)).map(read).join('\n');
  check(`[${v.id}] every address-shaped string in dist matches a stated record`, scanAddresses(vtxt, stated).length === 0, scanAddresses(vtxt, stated).join(','));
  if (!caStated) check(`[${v.id}] no address-shaped string at all while CA is absent`, scanAddresses(vtxt, []).length === 0);
  // no dates in static copy
  const vt = visibleText(html);
  check(`[${v.id}] static page text carries no dates, times or as-of words`, dateHits(vt).length === 0, dateHits(vt).join(' | '));
  check(`[${v.id}] scripts carry no date-like literals`, dateHits(walk(path.join(v.dir, 'js')).map((f) => jsLiterals(read(f))).join('\n')).length === 0);

  /* ---- runtime */
  const feedCA = caStated ? rec('ca').value : null;
  const f = makeFetch({ ca: feedCA, includeCA: caStated });
  const P = await runPage(v.dir, { fetcher: f });
  const rows = rowsOf(P.d);
  const first = rows[0];
  check(`[${v.id}] board has ten rows`, rows.length === 10);
  check(`[${v.id}] row one is the own row, pinned above the rest`, first && first.classList.contains('own') && rows.slice(1).every((r) => !r.classList.contains('own')));
  check(`[${v.id}] runtime reads the same state as the variant`, P.GL.own.stated === caStated);
  const rest = rows.slice(1);
  const addrs = rest.map((r) => r.dataset.key.replace('t:', ''));
  const volumes = rest.map((r) => Number(r.querySelector('.vol').dataset.v));
  check(`[${v.id}] rows 2-10 come from the trending feed, volume descending`, rest.length === 9 && volumes.every((x, i) => i === 0 || volumes[i - 1] >= x) && addrs.every((a) => a.startsWith('Tok') || a === 'DUP'.padEnd(0)), addrs.join(','));
  check(`[${v.id}] solana only (other chains filtered)`, !rest.some((r) => /^0x/.test(r.dataset.key.replace('t:', ''))));
  check(`[${v.id}] best pair per token is chosen by 24h volume`, (() => { const r = rest.find((x) => x.dataset.key === 't:' + TOKS(12)[6]); return !r || r.querySelector('.price').dataset.v === '6.5'; })());
  const tiles = rest.filter((r) => r.querySelector('.tile-letter')).length;
  check(`[${v.id}] letter tiles appear for missing logos (>= 2)`, tiles >= 2 && tiles === 3, 'tiles ' + tiles);
  check(`[${v.id}] real logos use the feed imageUrl and never the dd cdn`, Array.from(rest).every((r) => { const im = r.querySelector('img.logo'); return !im || (/cdn\.example\.test/.test(im.src) && !/dd\.dexscreener/.test(im.src)); }));
  const mCalls = f.calls.filter((u) => /token-boosts|tokens\/v1\/solana/.test(u));
  check(`[${v.id}] market endpoints come from the market-source record`, mCalls.length === 2 && mCalls[0] === rec('market-source').endpoints.boosts && mCalls[1].startsWith(rec('market-source').endpoints.pairs.split('{')[0]));
  const track = Array.from(P.d.querySelectorAll('#track .t-item'));
  const tAddrs = new Set(track.map((t) => t.dataset.addr));
  check(`[${v.id}] ticker uses the same live rows`, track.length === 20 && tAddrs.size === 10 && [...tAddrs].every((a) => P.GL.market.rows.some((r) => r.addr === a)));
  check(`[${v.id}] rendered page text carries no dates after data arrives`, dateHits(P.d.body.textContent).length === 0, dateHits(P.d.body.textContent).join(' | '));
  check(`[${v.id}] status pill reads live`, P.d.getElementById('pill').dataset.kind === 'live');
  v.runtime = { addrs, calls: f.calls.slice() };

  if (!caStated) {
    const img = first.querySelector('img.logo');
    check(`[${v.id}] absent CA: row one wears the brand logo, not a tile`, !!img && /brand\/glide-logo\.png$/.test(img.getAttribute('src')) && !first.querySelector('.tile-letter'));
    check(`[${v.id}] absent CA: placeholder data and non-clickable`, first.classList.contains('placeholder') && first.querySelector('.price').textContent === '$0.00' && ['.chg', '.vol', '.liq'].every((s) => first.querySelector(s).textContent === '· · · · ·') && !first.querySelector('button, a') && first.getAttribute('aria-disabled') === 'true');
    check(`[${v.id}] absent CA: no own-token request is made`, !f.calls.some((u) => /latest\/dex|pump\.fun/.test(u)));
    check(`[${v.id}] absent CA: nine trending rows follow`, rest.length === 9);
  } else {
    const ca = rec('ca').value;
    const img = first.querySelector('img.logo');
    check(`[${v.id}] stated CA: logo comes from pump image_uri`, !!img && img.getAttribute('src') === 'https://pump.example.test/logo.png');
    check(`[${v.id}] stated CA: top volume pair with matching base token is used`, first.querySelector('.price').dataset.v === '0.02' && first.querySelector('.chg').dataset.v === '-2' && first.querySelector('.vol').dataset.v === '5000');
    check(`[${v.id}] stated CA: liquidity zero falls back to market cap with Mkt Cap title`, first.querySelector('.liq').dataset.v === '777000' && first.querySelector('.liq').getAttribute('title') === 'Mkt Cap');
    check(`[${v.id}] stated CA: copy button carries the address`, (() => { const b = first.querySelector('button.copy'); return b && b.dataset.addr === ca; })());
    first.querySelector('button.copy').click(); await new Promise((r) => setTimeout(r, 30));
    check(`[${v.id}] stated CA: copy click writes the address and shows feedback`, P.w.__copied === ca && first.querySelector('button.copy').classList.contains('ok') && P.d.getElementById('toast').classList.contains('show'));
    check(`[${v.id}] stated CA: own token removed from trending rows (dedup)`, P.d.querySelectorAll(`#board-body [data-key="t:${ca}"]`).length === 0 && P.d.querySelectorAll('#board-body .r').length === 10 && rest.length === 9);
    check(`[${v.id}] stated CA: console lines emitted`, P.logs.some((a) => a[0] === '[glide] own token raw response') && P.logs.some((a) => a[0] === '[glide] own liquidity candidates'));
    check(`[${v.id}] stated CA: both requests fired`, f.calls.some((u) => u.includes('/latest/dex/tokens/' + ca)) && f.calls.some((u) => u.includes('pump.fun/coins/' + ca)));
    check(`[${v.id}] stated CA: row keeps the pulse class`, first.classList.contains('own'));
    // CA band click-to-copy
    const band = P.d.getElementById('ca'); band.click(); await new Promise((r) => setTimeout(r, 30));
    check(`[${v.id}] CA band click copies the full address with feedback`, P.w.__copied === ca && band.classList.contains('ok') && band.querySelector('.ca-act').textContent === 'Copied');
    // stated: liquidity present
    const f2 = makeFetch({ ca, includeCA: false, liqUsd: 4242 }); const P2 = await runPage(v.dir, { fetcher: f2 });
    const l2 = rowsOf(P2.d)[0].querySelector('.liq');
    check(`[${v.id}] stated CA: liquidity above zero wins over market cap`, l2.dataset.v === '4242' && !l2.hasAttribute('title')); P2.close();
    // pump fails -> fallback logo, still renders
    const f3 = makeFetch({ ca, includeCA: false, failPump: true }); const P3 = await runPage(v.dir, { fetcher: f3 });
    const i3 = rowsOf(P3.d)[0].querySelector('img.logo');
    check(`[${v.id}] stated CA: pump failure falls back to logo-192`, !!i3 && /assets\/logo-192\.png$/.test(i3.getAttribute('src'))); P3.close();
    // own request fails -> market still intact, dashes on row one
    const f4 = makeFetch({ ca, includeCA: false, failOwn: true }); const P4 = await runPage(v.dir, { fetcher: f4 });
    check(`[${v.id}] own fetch failure leaves the market untouched`, rowsOf(P4.d).length === 10 && rowsOf(P4.d)[0].querySelectorAll('.num.dash').length >= 4 && P4.GL.market.status === 'live'); P4.close();
  }
  P.close();
}

/* ---- both branches differ in every toggled record yet market is identical */
section('cross-variant');
{
  const cu = variants.find((v) => v.id === 'current'), fl = variants.find((v) => v.id === 'flipped');
  const differing = ['ca', 'x', 'github'].every((id) => cu.reg.records.find((r) => r.id === id).state !== fl.reg.records.find((r) => r.id === id).state);
  check('current and flipped variants differ in ca, x and github (both branches exercised)', differing);
  const stated = variants.find((v) => v.id === 'ca-stated'), absent = variants.find((v) => v.id === 'all-absent');
  const fa = makeFetch({ ca: rec0(stated), includeCA: false }), fb = makeFetch({ ca: null, includeCA: false });
  const A = await runPage(stated.dir, { fetcher: fa }), B = await runPage(absent.dir, { fetcher: fb });
  const mk = (f) => f.calls.filter((u) => /token-boosts|tokens\/v1\/solana/.test(u)).join('|');
  check('market requests are identical with CA stated and absent', mk(fa) === mk(fb) && mk(fa).length > 20);
  const keys = (P) => rowsOf(P.d).slice(1).map((r) => r.dataset.key).join();
  check('rows 2-10 are identical with CA stated and absent', keys(A) === keys(B) && keys(A).length > 50);
  A.close(); B.close();
}
function rec0(v) { return v.reg.records.find((r) => r.id === 'ca').value; }

/* ---- failure, backoff, visibility, reduced motion, count-up */
section('behaviour');
{
  const dir = variants.find((v) => v.id === 'all-absent').dir;
  // source down from the start
  const f = makeFetch({ failBoosts: true }); const P = await runPage(dir, { fetcher: f });
  const r = rowsOf(P.d);
  check('source down: status reads error with a visible message', P.d.getElementById('pill').dataset.kind === 'err' && /unreachable/i.test(P.d.getElementById('pilltxt').textContent) && P.d.getElementById('board-note').textContent.length > 10);
  check('source down: dash cells on rows 2-10', r.slice(1).every((x) => x.querySelectorAll('.num.dash').length === 4 && x.querySelector('.price').textContent === '—'));
  check('source down: stat tiles show dashes', ['st-vol', 'st-top', 'st-n'].every((id) => P.d.getElementById(id).textContent === '—'));
  const pl = P.GL.market.poller;
  check('backoff doubles from 2s and caps at the 60s poll', [1, 2, 3, 4, 5, 6, 12].map((n) => pl.delay(n)).join() === '2000,4000,8000,16000,32000,60000,60000' && pl.POLL_MS === 60000);
  check('failure counter advances after a failed tick', pl.failures === 1, pl.failures);
  f.state.failBoosts = false; await P.GL.market.refresh(); await new Promise((x) => setTimeout(x, 30));
  check('recovery fills the board and clears the error', rowsOf(P.d)[1].querySelector('.price').dataset.v !== undefined && P.d.getElementById('pill').dataset.kind === 'live' && P.d.getElementById('board-note').textContent === '');
  // flash on change
  f.state.bump = 3; await P.GL.market.refresh(); await new Promise((x) => setTimeout(x, 30));
  check('changed value flashes in place', P.d.querySelectorAll('#board-body .num.flash').length >= 1);
  // last good kept
  const before = rowsOf(P.d).slice(1).map((x) => x.querySelector('.price').dataset.v).join();
  f.state.failBoosts = true; await P.GL.market.refresh().catch(() => {}); await new Promise((x) => setTimeout(x, 30));
  const after = rowsOf(P.d).slice(1).map((x) => x.querySelector('.price').dataset.v).join();
  check('refresh failure keeps the last good rows', before === after && before.length > 5);
  check('refresh failure is stated on the pill', /last good/i.test(P.d.getElementById('pilltxt').textContent));
  P.close();

  // hidden tab
  const fh = makeFetch({}); const H = await runPage(dir, { fetcher: fh, hidden: true, settle: false });
  const res = await H.GL.market.first; await new Promise((x) => setTimeout(x, 30));
  check('hidden tab: no request is made and polling is paused', res === 'skipped' && fh.calls.length === 0 && H.GL.market.poller.paused === true);
  Object.defineProperty(H.d, 'hidden', { get: () => false, configurable: true });
  H.d.dispatchEvent(new H.w.Event('visibilitychange')); await new Promise((x) => setTimeout(x, 60));
  check('becoming visible fetches immediately', fh.calls.filter((u) => /token-boosts/.test(u)).length === 1 && rowsOf(H.d)[1].querySelector('.price').dataset.v !== undefined);
  H.close();

  // reduced motion
  const fr = makeFetch({}); const RM = await runPage(dir, { fetcher: fr, reduced: true });
  check('reduced motion: every reveal block shows at once', Array.from(RM.d.querySelectorAll('[data-reveal]')).every((n) => n.classList.contains('on') && !n.style.transform));
  check('reduced motion: numbers land instantly, no entry fades', rowsOf(RM.d).slice(1).every((x) => x.querySelector('.price').textContent === RM.GL.fmt.usd(x.querySelector('.price').dataset.v)) && !RM.d.querySelector('#board-body .enter'));
  check('reduced motion: flow dots removed', RM.d.querySelectorAll('#flow animateMotion').length === 0);
  check('reduced motion: tab cards are not faded in', Array.from(RM.d.querySelectorAll('#cards .tile')).every((n) => n.style.opacity === ''));
  RM.close();

  // motion on, spotlight and number format
  const fm = makeFetch({}); const MO = await runPage(dir, { fetcher: fm });
  const spot = MO.d.querySelector('.pick'); spot.dispatchEvent(new MO.w.MouseEvent('pointermove', { bubbles: true, clientX: 10, clientY: 10 }));
  check('spotlight writes pointer position', spot.style.getPropertyValue('--mx') !== '');
  check('number formats', MO.GL.fmt.usd(1234.5) === '$1,234.50' && MO.GL.fmt.usd(0.0042) === '$0.00420' && MO.GL.fmt.usd(0) === '$0.00' && MO.GL.fmt.big(2380000) === '$2.38M' && MO.GL.fmt.pct(-3.14) === '▼ 3.1%' && MO.GL.fmt.usd(null) !== undefined);
  check('letters helper gives two characters', MO.GL.letters('a') === 'A·' && MO.GL.letters('abc') === 'AB');
  MO.close();
}
{
  // skeleton state before data arrives
  const dir = variants.find((v) => v.id === 'all-absent').dir;
  const slow = { impl: () => () => new Promise(() => {}), calls: [], state: {} };
  const S = await runPage(dir, { fetcher: slow, settle: false });
  const rs = rowsOf(S.d);
  check('skeleton rows show while the first batch is pending', rs.length === 10 && rs.slice(1).every((r) => r.classList.contains('skel')) && S.d.querySelectorAll('#track .t-skel').length >= 8);
  check('own placeholder is real, not skeleton, while pending', rs[0].classList.contains('placeholder') && !rs[0].classList.contains('skel'));
  S.close();
}

/* ============================================================ H. copy against the reference */
section('copy');
{
  const corpus = read(path.join(root, 'research', 'reference-copy.txt'));
  const refBi = bigrams(corpus), refW = new Set(words(corpus).filter((w) => !STOP.has(w) && w.length > 3));
  const cur = variants.find((v) => v.id === 'current');
  const ours = visibleText(read(path.join(cur.dir, 'index.html'))) + '\n' + walk(path.join(cur.dir, 'js')).map((f) => jsLiterals(read(f))).join('\n');
  const ourBi = bigrams(ours);
  const shared = [...ourBi].filter((b) => refBi.has(b));
  check('zero shared content bigrams with the reference copy', shared.length === 0, shared.join(' | '));
  const banned = ['float', 'floatfuse', 'fuse', 'xstock', 'xstocks', 'raydium', 'launchlab', 'prestock', 'tessera', 'sunrise', 'stonkz', 'blend'];
  const ow = new Set(words(ours));
  check('no reference brand or product words', banned.every((w) => !ow.has(w)), banned.filter((w) => ow.has(w)).join(','));
  const sharedWords = [...ow].filter((w) => refW.has(w) && !STOP.has(w) && w.length > 3);
  console.log('   info: distinctive single words shared with the reference corpus:', sharedWords.join(', ') || 'none');
  check('no reference-only numbers (fee tiers, splits, counts)', !/\b(2\.5|1500|3500|397|24 )\b/.test(ours));
}

/* ============================================================ done */
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\ngates: ${total} checks, ${failed.length} failed`);
if (failed.length) { console.log('failed:\n - ' + failed.join('\n - ')); process.exit(1); }
process.exit(0);
