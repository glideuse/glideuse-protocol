/* Hero: canvas orbit of live tokens, plus pointer and scroll parallax on the background layers. */
(function () {
  'use strict';
  const GL = window.GL;
  const host = document.getElementById('ring'), cv = document.getElementById('rc');
  const hero = document.getElementById('flight');
  if (!host || !cv || !hero) return;

  /* ---- parallax */
  const layers = Array.from(hero.querySelectorAll('.layer'));
  let tx = 0, ty = 0, cx = 0, cy = 0, sy = 0, par = 0;
  const parallax = () => {
    par = 0;
    cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08;
    layers.forEach((l) => {
      const d = parseFloat(l.dataset.depth || '0');
      l.style.transform = `translate3d(${(cx * d * 18).toFixed(2)}px, ${(cy * d * 12 + sy * d * 0.12).toFixed(2)}px, 0)`;
    });
    if (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001) par = requestAnimationFrame(parallax);
  };
  const kick = () => { if (!par && !GL.reduced()) par = requestAnimationFrame(parallax); };
  hero.addEventListener('pointermove', (e) => { const b = hero.getBoundingClientRect(); tx = ((e.clientX - b.left) / b.width - 0.5) * 2; ty = ((e.clientY - b.top) / b.height - 0.5) * 2; kick(); }, { passive: true });
  hero.addEventListener('pointerleave', () => { tx = 0; ty = 0; kick(); });
  window.addEventListener('scroll', () => { sy = Math.min(window.scrollY, 900); kick(); }, { passive: true });

  /* ---- orbit canvas */
  let ctx = null;
  try { ctx = cv.getContext('2d'); } catch (e) { ctx = null; }
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const css = getComputedStyle(document.documentElement);
  const tok = (n, f) => (css.getPropertyValue(n).trim() || f);
  const C = { acc: tok('--color-accent', 'currentColor'), hi: tok('--color-accent-hi', 'currentColor'), ink: tok('--color-ink', 'currentColor'), dim: tok('--color-dim', 'currentColor'), tile: tok('--color-surface-2', 'currentColor'), deep: tok('--color-bg', 'currentColor'), mute: tok('--color-mute', 'currentColor') };
  let W = 0, H = 0, hover = null, raf = 0, visible = true, t0 = performance.now();
  const imgs = {}, nodes = [];

  function size() {
    W = host.clientWidth; H = host.clientHeight;
    cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (GL.reduced()) draw(0);
  }
  window.addEventListener('resize', size);

  function sync() {
    const rows = GL.market.rows.slice(0, 10);
    rows.forEach((d, i) => {
      let n = nodes.find((x) => x.d.addr === d.addr);
      if (!n) { n = { d, x: 0, y: 0, sc: 1, first: true }; nodes.push(n); }
      n.d = d; n.i = i;
      if (d.img && !imgs[d.addr]) { const im = new Image(); im.referrerPolicy = 'no-referrer'; im.onerror = () => { im.dataset.bad = '1'; }; im.src = d.img; imgs[d.addr] = im; }
    });
    for (let i = nodes.length - 1; i >= 0; i--) if (!rows.find((r) => r.addr === nodes[i].d.addr)) nodes.splice(i, 1);
    if (GL.reduced()) draw(0);
  }
  window.addEventListener('glide:market', sync);

  function geometry() {
    const wide = W > 900;
    const R = wide ? Math.min(W * 0.3, H * 0.4) : Math.min(W * 0.4, H * 0.36);
    return { cx: wide ? W * 0.58 : W / 2, cy: wide ? H * 0.5 : H * 0.46, R, r: R * 0.55, cr: R * 0.2, dr: Math.max(16, Math.min(26, R * 0.085)) };
  }

  function draw(t) {
    const g = geometry(), n = nodes.length;
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1;
    ctx.strokeStyle = C.acc; ctx.globalAlpha = 0.1;
    ctx.beginPath(); ctx.arc(g.cx, g.cy, g.R, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = n ? 0.2 : 0.08; ctx.setLineDash(n ? [] : [3, 7]);
    ctx.beginPath(); ctx.arc(g.cx, g.cy, g.r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;

    // ten slots on the inner ring; lit ones are tied to the centre by a line the signal dots run along
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2 - t * 0.08;
      const sx = g.cx + Math.cos(a) * g.r, sy2 = g.cy + Math.sin(a) * g.r, lit = i < n;
      if (lit) {
        const grad = ctx.createLinearGradient(sx, sy2, g.cx, g.cy);
        grad.addColorStop(0, C.hi); grad.addColorStop(1, C.acc);
        ctx.strokeStyle = grad; ctx.globalAlpha = 0.35; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(sx, sy2); ctx.lineTo(g.cx, g.cy); ctx.stroke();
        for (let k = 0; k < 2; k++) {
          const p = (t * 0.35 + i * 0.13 + k * 0.5) % 1;
          ctx.globalAlpha = (1 - p) * 0.9; ctx.fillStyle = C.ink;
          ctx.beginPath(); ctx.arc(sx + (g.cx - sx) * p, sy2 + (g.cy - sy2) * p, 2.4, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = lit ? 1 : 0.5; ctx.lineWidth = 1.5;
      ctx.strokeStyle = lit ? C.hi : C.mute; ctx.fillStyle = lit ? C.hi : 'transparent';
      ctx.beginPath(); ctx.arc(sx, sy2, lit ? 5 : 4, 0, Math.PI * 2); lit ? ctx.fill() : ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // centre: a quiet pulse, no emblem
    const pulse = 1 + Math.sin(t * 1.6) * 0.012, cr = g.cr * pulse;
    ctx.save();
    ctx.shadowColor = C.acc; ctx.shadowBlur = 40;
    ctx.fillStyle = C.deep; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(g.cx, g.cy, cr, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = C.hi; ctx.globalAlpha = 0.45; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(g.cx, g.cy, cr, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.14; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(g.cx, g.cy, cr * 0.82, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = C.ink; ctx.textAlign = 'center';
    ctx.font = '700 13px "Geist Mono", monospace';
    ctx.fillText(n ? n + ' LIVE' : 'STANDBY', g.cx, g.cy + 5);

    // token discs on the outer orbit
    nodes.forEach((nd, i) => {
      const a = (i / Math.max(1, n)) * Math.PI * 2 + t * 0.05;
      nd.tx = g.cx + Math.cos(a) * g.R; nd.ty = g.cy + Math.sin(a) * g.R;
      if (nd.first || GL.reduced()) { nd.x = nd.tx; nd.y = nd.ty; nd.first = false; }
      nd.x += (nd.tx - nd.x) * 0.08; nd.y += (nd.ty - nd.y) * 0.08;
      nd.sc += (((hover === nd) ? 1.12 : 1) - nd.sc) * 0.15;
      const r = g.dr * nd.sc, im = imgs[nd.d.addr];
      ctx.save(); ctx.globalAlpha = 0.85; ctx.shadowColor = C.deep; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
      ctx.fillStyle = C.tile; ctx.beginPath(); ctx.arc(nd.x, nd.y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.arc(nd.x, nd.y, r, 0, Math.PI * 2); ctx.clip();
      if (im && im.complete && im.naturalWidth && !im.dataset.bad) { ctx.globalAlpha = 0.9; ctx.drawImage(im, nd.x - r, nd.y - r, r * 2, r * 2); }
      else { ctx.globalAlpha = 1; ctx.fillStyle = C.hi; ctx.font = '700 ' + Math.round(r * 0.7) + 'px "Geist Mono", monospace'; ctx.fillText(GL.letters(nd.d.symbol), nd.x, nd.y + r * 0.25); }
      ctx.restore();
      ctx.globalAlpha = hover === nd ? 0.8 : 0.3; ctx.strokeStyle = C.hi; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(nd.x, nd.y, r + 1, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      if (hover === nd) { ctx.fillStyle = C.ink; ctx.font = '600 10.5px "Geist Mono", monospace'; ctx.fillText(nd.d.symbol, nd.x, nd.y + r + 15); }
      nd.rr = r;
    });
  }

  function frame(now) {
    raf = 0;
    if (!visible || document.hidden || GL.reduced()) return;
    draw((now - t0) / 1000);
    raf = requestAnimationFrame(frame);
  }
  const wake = () => { if (!raf && visible && !document.hidden && !GL.reduced()) raf = requestAnimationFrame(frame); };
  if (typeof IntersectionObserver !== 'undefined') new IntersectionObserver((es) => { visible = es[0].isIntersecting; wake(); }).observe(host);
  document.addEventListener('visibilitychange', wake);

  const at = (e) => {
    const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top; let best = null;
    nodes.forEach((nd) => { const d = Math.hypot(nd.x - x, nd.y - y); if (d <= (nd.rr || 20) + 4 && (!best || d < best.d)) best = { nd, d }; });
    return best ? best.nd : null;
  };
  cv.addEventListener('pointermove', (e) => { hover = at(e); host.classList.toggle('hit', !!hover); });
  cv.addEventListener('pointerleave', () => { hover = null; host.classList.remove('hit'); });
  cv.addEventListener('click', (e) => { if (at(e)) { const m = document.getElementById('market'); if (m) m.scrollIntoView({ behavior: GL.reduced() ? 'auto' : 'smooth' }); } });

  size(); sync(); wake();
})();
