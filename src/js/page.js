/* Page wiring: idea tabs, flow chart, board, ticker, stats, status pill. */
(function () {
  'use strict';
  const GL = window.GL;
  const $ = GL.$;
  const M = GL.market, O = GL.own;

  /* ------------------------------------------------------------ idea tabs */
  const IDEA = [
    ['concept', 'Concept', [
      ['01', 'One token', 'A single coin is the way in.'],
      ['02', 'A curated slate', 'Equities are chosen by hand, not by vote.'],
      ['03', 'A firm cap', 'The slate stays small on purpose.'],
    ]],
    ['holders', 'Holders', [
      ['01', 'Hold to reach', 'Exposure tracks the GLIDE you keep.'],
      ['02', 'One wallet', 'Everything starts from a Solana wallet.'],
      ['03', 'Plain terms', 'Details are posted here once they are confirmed.'],
    ]],
    ['ecosystem', 'Ecosystem', [
      ['01', 'Crypto native', 'Built on Solana rails from day one.'],
      ['02', 'Unified', 'One coin ties the pieces together.'],
      ['03', 'In the open', 'Links go live here the moment they are stated.'],
    ]],
  ];
  let tab = 'concept';
  function drawIdea() {
    const tabs = $('#tabs'), cards = $('#cards');
    tabs.innerHTML = '';
    IDEA.forEach(([id, label, items]) => {
      const b = GL.el(`<button type="button" role="tab" id="tab-${id}" aria-selected="${id === tab}" aria-controls="cards">${GL.esc(label)}<span class="n">${items.length}</span></button>`);
      b.addEventListener('click', () => { tab = id; drawIdea(); });
      tabs.append(b);
    });
    const cur = IDEA.find((x) => x[0] === tab);
    cards.setAttribute('aria-labelledby', 'tab-' + tab);
    cards.innerHTML = '';
    cur[2].forEach(([n, t, s], i) => {
      const c = GL.el(`<div class="tile spot"><span class="ic">${n}</span><span><b>${GL.esc(t)}</b><small>${GL.esc(s)}</small></span></div>`);
      cards.append(c);
      if (!GL.reduced()) { c.style.opacity = '0'; setTimeout(() => { c.style.transition = 'opacity .3s, border-color .15s'; c.style.opacity = '1'; }, 30 + i * 60); }
    });
  }

  /* ------------------------------------------------------------ flow chart */
  function drawFlow() {
    const svg = $('#flow'); if (!svg) return;
    const W = 1000, H = 420, cx = 110, cy = H / 2, n = 10, gap = Math.min(40, (H - 40) / n), y0 = cy - ((n - 1) * gap) / 2;
    let out = '';
    for (let i = 0; i < n; i++) {
      const y = y0 + i * gap, x1 = cx + 60, x2 = 560, x3 = 890;
      const d = `M${x1} ${cy} C ${x1 + 120} ${cy}, ${x2 - 160} ${y}, ${x2} ${y} L ${x3 - 40} ${y}`;
      out += `<path class="cv" d="${d}"/>`;
      out += `<circle class="fd" r="3.5"><animateMotion dur="${(3 + (i % 4) * 0.7).toFixed(1)}s" repeatCount="indefinite" calcMode="linear" path="${d}"/></circle>`;
      out += `<circle class="slot" cx="${x3}" cy="${y}" r="15"/><text x="${x3 + 24}" y="${y + 4}" font-size="11">${String(i + 1).padStart(2, '0')}</text>`;
    }
    out += `<circle class="node1" cx="${cx}" cy="${cy}" r="56"/><circle class="node2" cx="${cx}" cy="${cy}" r="46"/>`;
    out += `<text class="strong" x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="15" letter-spacing="3">HOLD</text>`;
    out += `<text x="${cx}" y="${cy + 84}" text-anchor="middle" font-size="12" letter-spacing="2">ONE WALLET</text>`;
    out += `<text x="560" y="${H - 14}" text-anchor="middle" font-size="11.5" letter-spacing="1.5">A CURATED SLATE, TEN AT MOST</text>`;
    svg.innerHTML = out;
    if (GL.reduced()) svg.querySelectorAll('animateMotion').forEach((a) => a.parentNode.remove());
  }

  /* ------------------------------------------------------------ board */
  const body = $('#board-body');
  const rows = new Map();
  const COPY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/></svg>';
  const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  function makeRow(key) {
    const el = GL.el(`<div class="r spot" data-key="${GL.esc(key)}">
      <div class="cn"><span class="lg"></span><div><b class="nm"></b><small class="sm"></small></div></div>
      <span class="num price" data-label="Price"></span><span class="num chg" data-label="24h"></span>
      <span class="num vol" data-label="Vol"></span><span class="num liq" data-label="Liq"></span>
      <span class="slotc"></span></div>`);
    return { key, el, lg: el.querySelector('.lg'), nm: el.querySelector('.nm'), sm: el.querySelector('.sm'), price: el.querySelector('.price'), chg: el.querySelector('.chg'), vol: el.querySelector('.vol'), liq: el.querySelector('.liq'), slot: el.querySelector('.slotc'), sig: '' };
  }
  const getRow = (key) => { let r = rows.get(key); if (!r) { r = makeRow(key); r.fresh = true; rows.set(key, r); } return r; };
  const setLogo = (r, src, sym, plain) => {
    const sig = src + '|' + sym + '|' + (plain ? 'p' : '');
    if (r.sig === sig) return;
    r.sig = sig; r.lg.innerHTML = '';
    if (plain) { const im = document.createElement('img'); im.className = 'logo'; im.alt = ''; im.src = src; r.lg.append(im); } else r.lg.append(GL.logo(src, sym));
  };
  const setCopy = (r, addr) => {
    if (!addr) { r.slot.className = 'copy-slot'; r.slot.innerHTML = ''; return; }
    if (r.slot.dataset.addr === addr && r.slot.tagName === 'BUTTON') return;
    const b = GL.el(`<button class="copy" type="button" aria-label="Copy address" data-addr="${GL.esc(addr)}">${COPY_SVG}</button>`);
    r.slot.replaceWith(b); r.slot = b; b.dataset.addr = addr;
  };
  const clearCls = (r) => { r.el.classList.remove('skel', 'dashrow', 'placeholder'); };

  function fillData(r, d, own) {
    clearCls(r);
    r.nm.textContent = d.symbol; r.sm.textContent = d.name || '';
    setLogo(r, d.img, d.symbol, false);
    GL.setNum(r.price, d.price, GL.fmt.usd);
    GL.setNum(r.chg, d.chg, GL.fmt.pct);
    r.chg.classList.toggle('up', d.chg != null && d.chg >= 0); r.chg.classList.toggle('down', d.chg != null && d.chg < 0);
    GL.setNum(r.vol, d.vol, GL.fmt.big);
    GL.setNum(r.liq, d.liq, GL.fmt.big);
    const lbl = own && d.liqLabel === 'Mkt Cap' ? 'Mkt cap' : 'Liq';
    r.liq.dataset.label = lbl;
    if (own && d.liqLabel === 'Mkt Cap') r.liq.setAttribute('title', 'Mkt Cap'); else r.liq.removeAttribute('title');
    setCopy(r, d.addr);
  }
  function fillDash(r, name) {
    clearCls(r); r.el.classList.add('dashrow');
    r.nm.textContent = name; r.sm.textContent = 'no data';
    setLogo(r, '', '—', false);
    [r.price, r.chg, r.vol, r.liq].forEach((n) => { n.textContent = '—'; n.className = n.className.replace(/\b(up|down)\b/g, '').trim() + ' dash'; delete n.dataset.v; n._v = undefined; });
    setCopy(r, '');
  }
  function fillSkel(r, own) {
    clearCls(r); r.el.classList.add('skel');
    r.nm.textContent = ''; r.sm.textContent = '';
    r.lg.innerHTML = '<span class="sk round"></span>'; r.sig = '';
    r.nm.innerHTML = '<span class="sk w1"></span>'; r.sm.innerHTML = '<span class="sk w3"></span>';
    [r.price, r.chg, r.vol, r.liq].forEach((n) => { n.innerHTML = '<span class="sk w2"></span>'; n.classList.remove('dash'); n._v = undefined; });
    setCopy(r, '');
  }

  function ownPlaceholder(r) {
    clearCls(r); r.el.classList.add('own', 'placeholder');
    r.el.setAttribute('aria-disabled', 'true');
    r.nm.textContent = 'GLIDE'; r.sm.textContent = 'pending';
    setLogo(r, 'brand/glide-logo.png', 'GLIDE', true);
    r.price.textContent = '$0.00'; r.price.classList.remove('dash');
    [r.chg, r.vol, r.liq].forEach((n) => { n.textContent = '· · · · ·'; n.classList.add('dash'); });
    r.chg.classList.remove('up', 'down');
    setCopy(r, '');
  }

  let trending = [];
  function renderBoard() {
    const keep = [];
    // row one
    const ro = getRow('own'); ro.el.classList.add('own'); keep.push(ro);
    if (!O.stated) ownPlaceholder(ro);
    else if (O.data) { ro.el.classList.remove('placeholder'); ro.el.removeAttribute('aria-disabled'); fillData(ro, Object.assign({}, O.data, { addr: O.ca }), true); }
    else if (O.status === 'error') { fillDash(ro, 'GLIDE'); setLogo(ro, O.FALLBACK_LOGO, 'GLIDE', true); }
    else { fillSkel(ro, true); }
    // rows two to ten: trending, own token removed from here when it shows up
    trending = M.rows.filter((x) => !(O.stated && x.addr === O.ca)).slice(0, 9);
    if (M.hasData) trending.forEach((d, i) => { const r = getRow('t:' + d.addr); fillData(r, d, false); keep.push(r); });
    else for (let i = 0; i < 9; i++) { const r = getRow('s:' + i); if (M.status === 'error') fillDash(r, 'Unavailable'); else fillSkel(r, false); keep.push(r); }

    // sync the DOM
    const want = new Set(keep.map((r) => r.key));
    Array.from(rows.keys()).forEach((k) => { if (!want.has(k)) { const r = rows.get(k); r.el.remove(); rows.delete(k); } });
    let delay = 0;
    keep.forEach((r, i) => {
      if (body.children[i] !== r.el) body.insertBefore(r.el, body.children[i] || null);
      if (r.fresh) {
        r.fresh = false;
        if (!GL.reduced() && !r.el.classList.contains('skel')) {
          r.el.classList.add('enter');
          setTimeout(() => r.el.classList.add('in'), 30 + (delay++) * 45);
        }
      } else if (r.el.classList.contains('enter')) { /* still entering */ }
    });
    // skeleton to data: rows that were skeletons fade in with a stagger
    keep.forEach((r, i) => { if (r._wasSkel && !r.el.classList.contains('skel') && !GL.reduced()) { r.el.classList.remove('in'); r.el.classList.add('enter'); setTimeout(() => r.el.classList.add('in'), 30 + i * 45); } r._wasSkel = r.el.classList.contains('skel'); });
  }

  /* ------------------------------------------------------------ ticker */
  const track = $('#track');
  let tickSig = '';
  function renderTicker() {
    if (!M.hasData) {
      if (tickSig !== 'skel' && tickSig !== 'err') {
        track.innerHTML = Array.from({ length: 16 }, () => '<span class="t-skel sk"></span>').join('');
      }
      if (M.status === 'error') { tickSig = 'err'; track.innerHTML = '<span class="t-item"><b>Market</b><span class="px">—</span></span>'.repeat(4); track.style.animation = 'none'; }
      else tickSig = 'skel';
      return;
    }
    const sig = M.rows.map((r) => r.addr).join(',');
    const item = (d) => `<span class="t-item" data-addr="${GL.esc(d.addr)}"><span class="lg"></span><b>${GL.esc(d.symbol)}</b><span class="px">${GL.esc(GL.fmt.usd(d.price))}</span><span class="num chg ${d.chg != null && d.chg >= 0 ? 'up' : 'down'}">${GL.esc(GL.fmt.pct(d.chg))}</span></span>`;
    if (sig !== tickSig) {
      tickSig = sig; track.style.animation = '';
      const html = M.rows.map(item).join('');
      track.innerHTML = html + html;
      track.querySelectorAll('.t-item').forEach((el) => {
        const d = M.rows.find((x) => x.addr === el.dataset.addr);
        el.querySelector('.lg').replaceWith(GL.logo(d.img, d.symbol));
      });
    } else {
      track.querySelectorAll('.t-item').forEach((el) => {
        const d = M.rows.find((x) => x.addr === el.dataset.addr); if (!d) return;
        el.querySelector('.px').textContent = GL.fmt.usd(d.price);
        const c = el.querySelector('.chg'); c.textContent = GL.fmt.pct(d.chg); c.className = 'num chg ' + (d.chg != null && d.chg >= 0 ? 'up' : 'down');
      });
    }
  }

  /* ------------------------------------------------------------ stats, bar, sentence, pill */
  function renderSide() {
    const t = trending;
    const vol = t.reduce((s, x) => s + (x.vol || 0), 0);
    if (M.hasData) {
      GL.setNum($('#st-vol'), vol, GL.fmt.big);
      GL.setNum($('#st-n'), t.length, GL.fmt.int);
      const top = t.filter((x) => x.chg != null).sort((a, b) => b.chg - a.chg)[0];
      $('#st-top').textContent = top ? top.symbol + ' ' + GL.fmt.pct(top.chg) : '—';
    } else {
      ['#st-vol', '#st-top', '#st-n'].forEach((s) => { $(s).textContent = '—'; });
    }
    const so = $('#st-own');
    if (!O.stated) so.textContent = 'pending';
    else if (O.data && O.data.price != null) GL.setNum(so, O.data.price, GL.fmt.usd);
    else so.textContent = '—';

    const bar = $('#bar'); bar.innerHTML = '';
    const slot0 = document.createElement('span');
    if (!O.stated) { const im = document.createElement('img'); im.className = 'logo'; im.alt = ''; im.src = 'brand/glide-logo.png'; slot0.append(im); }
    else slot0.append(GL.logo(O.data ? O.data.img : O.FALLBACK_LOGO, 'GLIDE'));
    bar.append(slot0);
    for (let i = 0; i < 9; i++) {
      const s = document.createElement('span');
      if (t[i]) s.append(GL.logo(t[i].img, t[i].symbol)); else s.className = 'ghost';
      bar.append(s);
    }
    const sent = $('#sentence');
    if (M.hasData && t.length) sent.innerHTML = `Watching <em>${t.length} tokens</em> besides GLIDE. Busiest over the last day: <em>${GL.esc(t[0].symbol)}</em>.`;
    else if (M.status === 'error') sent.textContent = 'The market source is not answering. Trying again with a growing pause.';
    else sent.textContent = 'Waiting for an opening batch.';
  }

  function renderStatus() {
    const pill = $('#pill'), txt = $('#pilltxt'), note = $('#board-note');
    let kind = 'sync', msg = 'Syncing the board', n = '';
    if (M.status === 'live') { kind = 'live'; msg = 'Live market'; }
    else if (M.status === 'error') { kind = 'err'; msg = M.hasData ? 'Refresh failed, showing last good' : 'Source unreachable, retrying'; n = M.hasData ? 'The last refresh failed. Rows below are the last good batch.' : 'Market source unreachable. Retrying with a growing pause.'; }
    else if (M.status === 'inert') { kind = 'err'; msg = 'Market source pending'; n = 'Market source pending.'; }
    pill.dataset.kind = kind; txt.textContent = msg; note.textContent = n;
  }

  function renderAll() { renderBoard(); renderTicker(); renderSide(); renderStatus(); window.dispatchEvent(new CustomEvent('glide:render')); }
  window.addEventListener('glide:market', renderAll);
  window.addEventListener('glide:own', renderAll);

  /* ------------------------------------------------------------ copy buttons on the board */
  body.addEventListener('click', async (e) => {
    const b = e.target.closest && e.target.closest('.copy'); if (!b || !b.dataset.addr) return;
    const ok = await GL.copy(b.dataset.addr);
    GL.toast(ok ? 'Saved to clipboard' : 'Copy failed');
    if (!ok) return;
    b.classList.add('ok'); b.innerHTML = CHECK_SVG;
    clearTimeout(b._t); b._t = setTimeout(() => { b.classList.remove('ok'); b.innerHTML = COPY_SVG; }, 1200);
  });

  /* ------------------------------------------------------------ start */
  drawIdea(); drawFlow(); renderAll();
  GL.reveal(); GL.spotlight(); GL.progress();
  M.start(); O.start();
  GL.board = { render: renderAll, rows };
})();
