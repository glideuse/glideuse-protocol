/* Shared helpers: register access, formatting, number tween, spring reveal, spotlight, progress, toast, copy. */
(function () {
  'use strict';
  const GL = (window.GL = window.GL || {});

  const mq = () => (window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false });
  GL.reduced = () => !!mq().matches;

  // register: every external fact is one record with a state
  let reg = { records: [] };
  try { reg = JSON.parse(document.getElementById('glide-register').textContent); } catch (e) { /* inert page */ }
  GL.register = reg;
  GL.rec = (id) => reg.records.find((r) => r.id === id) || { id, state: 'absent' };
  GL.stated = (id) => GL.rec(id).state === 'stated';

  const $ = (s, root) => (root || document).querySelector(s);
  GL.$ = $;
  GL.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  GL.el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  GL.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---- formatting */
  const compact = (typeof Intl !== 'undefined') ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }) : null;
  GL.fmt = {
    usd(n) {
      n = Number(n);
      if (!isFinite(n)) return '—';
      if (n === 0) return '$0.00';
      if (n >= 1) return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const dec = Math.min(10, -Math.floor(Math.log10(n)) + 2);
      return '$' + n.toFixed(dec);
    },
    big(n) {
      n = Number(n);
      if (!isFinite(n)) return '—';
      if (n < 1000) return '$' + n.toFixed(n < 10 ? 2 : 0);
      return '$' + (compact ? compact.format(n) : Math.round(n).toString());
    },
    pct(n) {
      n = Number(n);
      if (!isFinite(n)) return '—';
      return (n >= 0 ? '▲ ' : '▼ ') + Math.abs(n).toFixed(1) + '%';
    },
    int(n) { return String(Math.round(Number(n))); },
  };
  GL.letters = (sym) => String(sym || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase().padEnd(2, '·');

  /* a logo, or a two-letter tile when the image is missing or fails */
  GL.logo = (src, sym) => {
    const tile = () => GL.el(`<span class="tile-letter" aria-hidden="true">${GL.esc(GL.letters(sym))}</span>`);
    if (!src) return tile();
    const img = document.createElement('img');
    img.className = 'logo';
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => { if (img.parentNode) img.replaceWith(tile()); }, { once: true });
    img.src = src;
    return img;
  };

  /* ---- toast and copy */
  GL.toast = (msg) => {
    const t = $('#toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(GL.toast.timer);
    GL.toast.timer = setTimeout(() => t.classList.remove('show'), 1400);
  };
  GL.copy = async (text) => {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall through */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand && document.execCommand('copy');
      ta.remove(); return !!ok;
    } catch (e) { return false; }
  };

  /* ---- number tween with flash on change */
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  GL.setNum = (node, value, fmt, opts) => {
    opts = opts || {};
    if (!node) return;
    if (value == null || !isFinite(Number(value))) { node.textContent = '—'; node.classList.add('dash'); delete node.dataset.v; node._v = undefined; return; }
    value = Number(value);
    node.classList.remove('dash');
    const prev = node._v;
    node.dataset.v = String(value);
    node._v = value;
    if (node._raf) cancelAnimationFrame(node._raf);
    if (GL.reduced() || (prev === value && node.textContent !== '—')) { node.textContent = fmt(value); return; }
    const from = prev === undefined ? 0 : prev;
    if (prev !== undefined && !opts.noFlash) {
      node.classList.remove('flash'); void node.offsetWidth; node.classList.add('flash');
      clearTimeout(node._ft); node._ft = setTimeout(() => node.classList.remove('flash'), 950);
    }
    const dur = prev === undefined ? 800 : 500, t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      node.textContent = fmt(from + (value - from) * ease(p));
      if (p < 1) node._raf = requestAnimationFrame(step); else node.textContent = fmt(value);
    };
    node._raf = requestAnimationFrame(step);
  };

  /* ---- damped spring (semi-implicit Euler on a fixed step) */
  GL.spring = ({ k = 170, c = 17, m = 1, from = 1, to = 0, onUpdate, onDone }) => {
    let x = from, v = 0, last = performance.now(), acc = 0, raf = 0;
    const dt = 1 / 120;
    const tick = (now) => {
      acc += Math.min(0.05, (now - last) / 1000); last = now;
      while (acc >= dt) { const a = (-k * (x - to) - c * v) / m; v += a * dt; x += v * dt; acc -= dt; }
      if (Math.abs(x - to) < 0.0015 && Math.abs(v) < 0.0015) { onUpdate(to); onDone && onDone(); return; }
      onUpdate(x); raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  };

  /* ---- scroll reveal with stagger */
  GL.reveal = () => {
    const nodes = Array.from(document.querySelectorAll('[data-reveal]'));
    const show = (n) => { n.classList.add('on'); n.style.transform = ''; n.style.opacity = ''; };
    if (GL.reduced() || typeof IntersectionObserver === 'undefined') { nodes.forEach(show); return; }
    let batch = 0, flushT = 0;
    const queue = [];
    const flush = () => {
      flushT = 0;
      queue.splice(0).forEach((n, i) => {
        setTimeout(() => {
          n.classList.add('on');
          GL.spring({
            from: 1, to: 0,
            onUpdate: (x) => { n.style.transform = `translate3d(0, ${(x * 26).toFixed(2)}px, 0)`; n.style.opacity = String(Math.max(0, Math.min(1, 1 - x))); },
            onDone: () => { n.style.transform = ''; n.style.opacity = ''; },
          });
        }, i * 80);
      });
    };
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); queue.push(e.target); } });
      if (queue.length && !flushT) flushT = setTimeout(flush, 16);
    }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
    nodes.forEach((n) => io.observe(n));
  };

  /* ---- spotlight follows the pointer on cards, rows and tiles */
  GL.spotlight = () => {
    document.addEventListener('pointermove', (e) => {
      const t = e.target && e.target.closest && e.target.closest('.spot, .board .r');
      if (!t) return;
      const b = t.getBoundingClientRect();
      t.style.setProperty('--mx', (e.clientX - b.left) + 'px');
      t.style.setProperty('--my', (e.clientY - b.top) + 'px');
    }, { passive: true });
  };

  /* ---- scroll progress */
  GL.progress = () => {
    const bar = $('#progress'); if (!bar) return;
    let pending = false;
    const upd = () => {
      pending = false;
      const h = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = `scaleX(${h > 0 ? Math.min(1, window.scrollY / h) : 0})`;
    };
    const on = () => { if (!pending) { pending = true; requestAnimationFrame(upd); } };
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    upd();
  };
})();
