/* Own token (row one of the board). The branch is chosen from the ca record at runtime. */
(function () {
  'use strict';
  const GL = window.GL;
  const caRec = GL.rec('ca');
  const src = GL.rec('own-token-source');
  const O = (GL.own = {
    stated: caRec.state === 'stated' && !!caRec.value && src.state === 'stated',
    ca: caRec.state === 'stated' ? caRec.value : '',
    data: null, status: 'idle',
  });
  const emit = () => window.dispatchEvent(new CustomEvent('glide:own', { detail: { status: O.status } }));
  const FALLBACK_LOGO = 'assets/logo-192.png';

  O.pick = (dex, ca) => {
    const pairs = ((dex && dex.pairs) || []).filter((p) => p && p.baseToken && p.baseToken.address === ca)
      .sort((a, b) => ((b.volume && b.volume.h24) || 0) - ((a.volume && a.volume.h24) || 0));
    return { pairs, top: pairs[0] || null };
  };

  O.refresh = async () => {
    if (!O.stated) return;
    const ca = O.ca;
    try {
      const [dex, pump] = await Promise.all([
        GL.getJSON(src.endpoints.pairs.replace('{CA}', ca)),
        GL.getJSON(src.endpoints.logo.replace('{CA}', ca)).catch(() => null),
      ]);
      console.log('[glide] own token raw response', { dex, pump });
      const { pairs, top } = O.pick(dex, ca);
      console.log('[glide] own liquidity candidates', pairs.map((p) => ({ pair: p.pairAddress, liquidity: p.liquidity && p.liquidity.usd, marketCap: p.marketCap })));
      const logo = (pump && pump.image_uri) || FALLBACK_LOGO;
      if (!top) {
        O.data = { symbol: 'GLIDE', name: 'GLIDE', price: null, chg: null, vol: null, liq: null, liqLabel: 'Liquidity', img: logo };
      } else {
        const liq = top.liquidity && Number(top.liquidity.usd) > 0 ? { v: Number(top.liquidity.usd), label: 'Liquidity' } : { v: top.marketCap == null ? null : Number(top.marketCap), label: 'Mkt Cap' };
        O.data = {
          symbol: top.baseToken.symbol || 'GLIDE', name: top.baseToken.name || 'GLIDE',
          price: top.priceUsd == null ? null : Number(top.priceUsd),
          chg: top.priceChange && top.priceChange.h24 != null ? Number(top.priceChange.h24) : null,
          vol: top.volume && top.volume.h24 != null ? Number(top.volume.h24) : null,
          liq: liq.v, liqLabel: liq.label, img: logo,
        };
      }
      O.status = 'live'; emit();
    } catch (e) {
      O.status = 'error'; emit(); throw e;
    }
  };

  O.FALLBACK_LOGO = FALLBACK_LOGO;
  O.poller = GL.makePoller(O.refresh);
  O.start = () => (O.first = O.stated ? O.poller.start() : Promise.resolve('inert'));
})();
