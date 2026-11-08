// Produces every raster and the favicon from brand/ into <out>. Premultiplied resize, since the RGBA source
// holds pure black (0,0,0,0) in its transparent area.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const SRC = path.join(root, 'brand', 'LOGO GLIDE PNG...png');

export function tokens() {
  const css = fs.readFileSync(path.join(root, 'src', 'css', 'tokens.css'), 'utf8');
  const t = {};
  for (const m of css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) t[m[1]] = m[2].toLowerCase();
  return t;
}
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

async function glyph() {
  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const gw = x1 - x0 + 1, gh = y1 - y0 + 1, side = Math.round(Math.max(gw, gh) * 1.12);
  const ox = Math.round((side - gw) / 2), oy = Math.round((side - gh) / 2);
  const sq = Buffer.alloc(side * side * 4); // zero = transparent
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const s = ((y0 + y) * W + x0 + x) * 4, d = ((oy + y) * side + ox + x) * 4;
    const a = data[s + 3];
    // premultiply: colour scaled by alpha so the resampler never mixes in the black of the empty area
    sq[d] = Math.round(data[s] * a / 255); sq[d + 1] = Math.round(data[s + 1] * a / 255); sq[d + 2] = Math.round(data[s + 2] * a / 255); sq[d + 3] = a;
  }
  return { sq, side, bbox: { x0, y0, gw, gh } };
}

const premulPipe = (g) => sharp(g.sq, { raw: { width: g.side, height: g.side, channels: 4, premultiplied: true } });

// ---- trace: outer contour of each connected shape, simplified, on the 32 x 32 grid
function components(mask, W, H) {
  const lab = new Int32Array(W * H); let n = 0; const stack = [];
  for (let i = 0; i < W * H; i++) {
    if (!mask[i] || lab[i]) continue;
    n++; lab[i] = n; stack.push(i);
    while (stack.length) {
      const p = stack.pop(), px = p % W, py = (p / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx; if (mask[q] && !lab[q]) { lab[q] = n; stack.push(q); }
      }
    }
  }
  return { lab, n };
}
function boundary(lab, id, W, H) {
  // Moore neighbour tracing over the pixel grid of one component
  const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H && lab[y * W + x] === id);
  let sx = -1, sy = -1;
  outer: for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y)) { sx = x; sy = y; break outer; }
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const pts = []; let x = sx, y = sy, back = 4; let guard = 0;
  do {
    pts.push([x, y]);
    let found = false;
    for (let k = 1; k <= 8; k++) {
      const nd = (back + k) % 8; const nx = x + dirs[nd][0], ny = y + dirs[nd][1];
      if (at(nx, ny)) {
        const pd = (nd + 7) % 8; // the empty cell examined just before
        const vx = x + dirs[pd][0] - nx, vy = y + dirs[pd][1] - ny;
        back = dirs.findIndex(([dx, dy]) => dx === vx && dy === vy);
        x = nx; y = ny; found = true; break;
      }
    }
    if (!found) break;
  } while ((x !== sx || y !== sy) && ++guard < 4000000);
  return pts;
}
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
  let md = 0, mi = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len; if (d > md) { md = d; mi = i; } }
  if (md <= eps) return [pts[0], pts[pts.length - 1]];
  return rdp(pts.slice(0, mi + 1), eps).slice(0, -1).concat(rdp(pts.slice(mi), eps));
}

export async function traceFavicon(tk) {
  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const mask = new Uint8Array(W * H);
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] >= 128) { mask[y * W + x] = 1; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const { lab, n } = components(mask, W, H);
  const gw = x1 - x0 + 1, gh = y1 - y0 + 1, pad = 5, box = 32 - pad * 2, sc = box / Math.max(gw, gh);
  const offx = (32 - gw * sc) / 2, offy = (32 - gh * sc) / 2;
  let d = '';
  for (let id = 1; id <= n; id++) {
    const b = boundary(lab, id, W, H);
    if (b.length < 40) continue; // specks
    let fi = 0, fd = 0; b.forEach(([x, y], i) => { const dd = Math.hypot(x - b[0][0], y - b[0][1]); if (dd > fd) { fd = dd; fi = i; } });
    const eps = 0.14 / sc;
    const simp = rdp(b.slice(0, fi + 1), eps).slice(0, -1).concat(rdp(b.slice(fi).concat([b[0]]), eps).slice(0, -1));
    d += 'M' + simp.map(([x, y]) => `${((x - x0) * sc + offx).toFixed(1)} ${((y - y0) * sc + offy).toFixed(1)}`).join('L') + 'Z';
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${tk['color-bg']}"/><path d="${d}" fill="${tk['color-accent']}"/></svg>\n`;
}

export async function makeAssets(out) {
  const tk = tokens();
  const g = await glyph();
  fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(out, 'brand'), { recursive: true });
  const png = (n) => premulPipe(g).resize(n, n, { kernel: 'lanczos3' }).png({ compressionLevel: 9 });
  await png(512).toFile(path.join(out, 'brand', 'glide-logo.png'));
  await png(192).toFile(path.join(out, 'assets', 'logo-192.png'));
  await png(512).toFile(path.join(out, 'assets', 'logo-512.png'));
  const bg = rgb(tk['color-bg']);
  // apple touch icon: glyph over the logo's own ground
  const ap = await premulPipe(g).resize(130, 130, { kernel: 'lanczos3' }).png().toBuffer();
  await sharp({ create: { width: 180, height: 180, channels: 3, background: { r: bg[0], g: bg[1], b: bg[2] } } }).composite([{ input: ap, gravity: 'centre' }]).png().toFile(path.join(out, 'assets', 'apple-touch-icon.png'));
  // social card
  const og = await premulPipe(g).resize(420, 420, { kernel: 'lanczos3' }).png().toBuffer();
  await sharp({ create: { width: 1200, height: 630, channels: 3, background: { r: bg[0], g: bg[1], b: bg[2] } } }).composite([{ input: og, gravity: 'centre' }]).png({ compressionLevel: 9 }).toFile(path.join(out, 'assets', 'og.png'));
  fs.writeFileSync(path.join(out, 'favicon.svg'), await traceFavicon(tk));
  return { bbox: g.bbox, side: g.side };
}

if (process.argv[1] && process.argv[1].endsWith('assets.mjs')) {
  const out = path.resolve(process.argv[2] || path.join(root, 'dist'));
  console.log(await makeAssets(out));
}
