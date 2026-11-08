/* Live Solana market. Reads only the market-source register record. Contract address state has no path into this file. */
(function () {
  'use strict';
  const GL = window.GL;
  const POLL_MS = 60000;

  /* poller: backoff on failure, pauses while the tab is hidden, fetches at once when it comes back */
  GL.makePoller = (task) => {
    let timer = 0, started = false;
    const P = {
      POLL_MS, failures: 0, paused: false, first: null,
      delay: (n) => Math.min(POLL_MS, 2000 * Math.pow(2, Math.max(0, n - 1))),
    };
    P.tick = async () => {
      clearTimeout(timer);
      if (document.hidden) { P.paused = true; return 'skipped'; }
      P.paused = false;
      try { await task(); P.failures = 0; } catch (e) { P.failures++; }
      timer = setTimeout(P.tick, P.failures ? P.delay(P.failures) : POLL_MS);
      return 'ran';
    };
    P.start = () => {
      started = true;
      P.first = P.tick();
      document.addEventListener('visibilitychange', () => { if (!document.hidden && started) P.tick(); });
      return P.first;
    };
    return P;
  };

  GL.getJSON = async (url, ms) => {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), ms || 12000) : 0;
    try {
      const r = await fetch(url, { cache: 'no-store', signal: ctl ? ctl.signal : undefined });
      if (!r.ok) throw new Error('http ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  };

  const M = (GL.market = { rows: [], status: 'idle', hasData: false, error: '' });
  const emit = () => window.dispatchEvent(new CustomEvent('glide:market', { detail: { status: M.status } }));

  const num = (v) => { const n = Number(v); return isFinite(n) ? n : null; };

  M.shape = (boosts, pairs) => {
    const addrs = new Set((Array.isArray(boosts) ? boosts : []).filter((b) => b && b.chainId === 'solana' && b.tokenAddress).map((b) => b.tokenAddress));
    const best = new Map();
    (Array.isArray(pairs) ? pairs : (pairs && pairs.pairs) || []).forEach((p) => {
      if (!p || p.chainId !== 'solana' || !p.baseToken || !addrs.has(p.baseToken.address)) return;
      const cur = best.get(p.baseToken.address);
      const v = num(p.volume && p.volume.h24) || 0;
      if (!cur || v > (num(cur.volume && cur.volume.h24) || 0)) best.set(p.baseToken.address, p);
    });
    return Array.from(best.values()).map((p) => ({
      addr: p.baseToken.address,
      symbol: p.baseToken.symbol || '?',
      name: p.baseToken.name || '',
      price: num(p.priceUsd),
      chg: num(p.priceChange && p.priceChange.h24),
      vol: num(p.volume && p.volume.h24),
      liq: num(p.liquidity && p.liquidity.usd),
      img: (p.info && p.info.imageUrl) || '',
    })).sort((a, b) => (b.vol || 0) - (a.vol || 0)).slice(0, 10);
  };

  const rec = GL.rec('market-source');
  M.refresh = async () => {
    if (rec.state !== 'stated' || !rec.endpoints) { M.status = 'inert'; emit(); return; }
    try {
      const boosts = await GL.getJSON(rec.endpoints.boosts);
      const addrs = Array.from(new Set((Array.isArray(boosts) ? boosts : []).filter((b) => b && b.chainId === 'solana' && b.tokenAddress).map((b) => b.tokenAddress))).slice(0, 30);
      if (!addrs.length) throw new Error('no solana entries');
      const pairs = await GL.getJSON(rec.endpoints.pairs.replace('{addresses}', addrs.join(',')));
      const rows = M.shape(boosts, pairs);
      if (!rows.length) throw new Error('no pairs');
      M.rows = rows; M.hasData = true; M.status = 'live'; M.error = '';
      emit();
    } catch (e) {
      // the last good rows stay; the status says why this refresh failed
      M.status = 'error'; M.error = (e && e.message) || 'request failed';
      emit();
      throw e;
    }
  };

  M.poller = GL.makePoller(M.refresh);
  M.start = () => (M.first = M.poller.start());
  M.POLL_MS = POLL_MS;
})();
