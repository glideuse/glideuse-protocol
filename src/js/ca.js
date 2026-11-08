/* Contract address slot: inert until the register says stated, then click-to-copy with feedback. */
(function () {
  'use strict';
  const GL = window.GL;
  const slot = document.getElementById('ca');
  if (!slot || !GL.stated('ca')) return;           // state is read from the register at runtime
  const value = GL.rec('ca').value;
  if (!value) return;
  const act = slot.querySelector('.ca-act');
  slot.addEventListener('click', async () => {
    const ok = await GL.copy(value);
    GL.toast(ok ? 'Saved to clipboard' : 'Copy failed, select it by hand');
    if (!ok) return;
    slot.classList.add('ok');
    if (act) act.textContent = 'Copied';
    clearTimeout(slot._t);
    slot._t = setTimeout(() => { slot.classList.remove('ok'); if (act) act.textContent = 'Copy'; }, 1400);
  });
})();
