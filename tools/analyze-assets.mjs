// Reads every byte-level fact of the brand and reference images.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const CT = { 0: 'grayscale', 2: 'truecolor RGB', 3: 'indexed', 4: 'grayscale+alpha', 6: 'truecolor RGBA' };

function ihdr(buf) {
  if (buf.slice(0, 8).toString('hex') === '89504e470d0a1a0a') {
    return { fmt: 'png', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), bitDepth: buf[24], colourType: buf[25], colourName: CT[buf[25]], interlace: buf[28] };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { fmt: 'jpeg', h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7), components: buf[i + 9] };
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return { fmt: 'unknown' };
}

function kmeans(px, k, iters = 12) {
  // px: array of [r,g,b]; seeded deterministically on a stride
  const cent = []; for (let i = 0; i < k; i++) cent.push(px[Math.floor((i + 0.5) * px.length / k)].slice());
  let asg = new Uint8Array(px.length);
  for (let it = 0; it < iters; it++) {
    const sum = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (let i = 0; i < px.length; i++) {
      let b = 0, bd = 1e12;
      for (let c = 0; c < k; c++) { const d = (px[i][0] - cent[c][0]) ** 2 + (px[i][1] - cent[c][1]) ** 2 + (px[i][2] - cent[c][2]) ** 2; if (d < bd) { bd = d; b = c; } }
      asg[i] = b; const s = sum[b]; s[0] += px[i][0]; s[1] += px[i][1]; s[2] += px[i][2]; s[3]++;
    }
    for (let c = 0; c < k; c++) if (sum[c][3]) cent[c] = [sum[c][0] / sum[c][3], sum[c][1] / sum[c][3], sum[c][2] / sum[c][3]];
  }
  const cnt = new Array(k).fill(0); for (const a of asg) cnt[a]++;
  return cent.map((c, i) => ({ c, n: cnt[i] }));
}

export async function analyze(file, { sample = 160 } = {}) {
  const buf = fs.readFileSync(file);
  const head = ihdr(buf);
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const hist = new Array(8).fill(0); let pureBlackTransparent = 0, transparent = 0;
  const px = [], coords = [];
  const step = Math.max(1, Math.floor(Math.sqrt((W * H) / 60000)));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4; const a = data[o + 3];
    hist[Math.min(7, a >> 5)]++;
    if (a < 255) { transparent++; if (data[o] === 0 && data[o + 1] === 0 && data[o + 2] === 0 && a === 0) pureBlackTransparent++; }
    if (y % step === 0 && x % step === 0 && a > 200) { px.push([data[o], data[o + 1], data[o + 2]]); coords.push([x, y]); }
  }
  const km = kmeans(px, 5).sort((a, b) => b.n - a.n).map(({ c, n }) => {
    // snap to the real pixel nearest the centroid
    let bi = 0, bd = 1e12;
    for (let i = 0; i < px.length; i++) { const d = (px[i][0] - c[0]) ** 2 + (px[i][1] - c[1]) ** 2 + (px[i][2] - c[2]) ** 2; if (d < bd) { bd = d; bi = i; } }
    const [r, g, b] = px[bi];
    return { share: +(n / px.length).toFixed(4), hex: '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join(''), x: coords[bi][0], y: coords[bi][1] };
  });
  return { file: path.relative(root, file), bytes: buf.length, header: head, alphaHistogram8Bins: hist, transparentPixels: transparent, pureBlackTransparent, kmeansSnapped: km };
}

if (process.argv[1] && process.argv[1].endsWith('analyze-assets.mjs')) {
  const out = [];
  for (const dir of ['brand', 'reference']) for (const f of fs.readdirSync(path.join(root, dir)).sort()) out.push(await analyze(path.join(root, dir, f)));
  fs.writeFileSync(path.join(root, 'research', 'assets-report.json'), JSON.stringify(out, null, 2));
  for (const r of out) console.log(r.file, JSON.stringify(r.header), 'alpha', r.alphaHistogram8Bins.join(','), 'pureBlackTransp', r.pureBlackTransparent, '\n   ', r.kmeansSnapped.map((k) => `${k.hex}@${k.x},${k.y}(${k.share})`).join(' '));
}
