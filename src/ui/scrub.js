/**
 * scrub.js — the DOM half of the scroll choreography.
 *
 * The rail reports where you are in the page (information, so it always updates), the
 * type strip translates with scroll position — scrubbed, never a looping marquee — and
 * the fixed furniture is told which tone it is sitting on, because a fixed bar cannot
 * inherit a chapter's palette the way a section can.
 */
const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);

export function initScrub({ rig, motionOK }) {
  const root = document.documentElement;
  const topbar = document.querySelector('[data-topbar]');
  const railFill = document.querySelector('[data-rail-fill]');
  const railItems = Array.from(document.querySelectorAll('[data-rail]'));
  /* The site is dark end to end, so this list is empty and every sample returns
     'dark' — the fixed furniture is always paper-on-ink. It stays wired up (and
     data-driven rather than class-driven) so a light band is one class away:
     give a section `.chapter--light` and the topbar, rail and menu button flip
     themselves back for as long as it is behind them. */
  const bands = Array.from(document.querySelectorAll('.chapter--light'), (element) => ({
    element,
    top: 0,
    height: 0,
  }));
  let topBand = 34;
  const tickers = Array.from(document.querySelectorAll('[data-ticker]'), (element) => ({
    element,
    top: 0,
    height: 1,
    span: 1,
  }));

  function measure() {
    topBand = (topbar ? topbar.getBoundingClientRect().height : 68) * 0.5;
    for (const band of bands) {
      const rect = band.element.getBoundingClientRect();
      band.top = rect.top + window.scrollY;
      band.height = rect.height;
    }
    for (const ticker of tickers) {
      const rect = ticker.element.getBoundingClientRect();
      ticker.top = rect.top + window.scrollY;
      ticker.height = Math.max(1, rect.height);
      ticker.span = Math.min((ticker.element.scrollWidth || 1) * 0.16, 240);
    }
  }

  function toneAt(y) {
    for (const band of bands) {
      if (y >= band.top && y < band.top + band.height) return 'light';
    }
    return 'dark';
  }

  /* Sampled where the furniture actually sits: the topbar's centre line and the
     rail's centre line, one chapter each. */
  function publishTone() {
    const y = window.scrollY;
    const railTone = toneAt(y + window.innerHeight * 0.5);
    const pageTopTone = toneAt(y + topBand);
    if (root.dataset.railTone !== railTone) root.dataset.railTone = railTone;
    if (root.dataset.topTone !== pageTopTone) root.dataset.topTone = pageTopTone;
  }

  function update() {
    if (railFill) railFill.style.height = `${(clamp01(rig.state.p) * 100).toFixed(2)}%`;
    publishTone();
    if (!motionOK) return;

    const viewport = window.innerHeight;
    const y = window.scrollY;

    for (const ticker of tickers) {
      const local = clamp01((y + viewport - ticker.top) / (ticker.height + viewport));
      const shift = (0.5 - local) * 2 * ticker.span;
      ticker.element.style.setProperty('--ticker-shift', `${shift.toFixed(1)}px`);
    }
  }

  const unsubscribe = rig.onSection((index) => {
    for (const item of railItems) {
      item.classList.toggle('is-active', Number(item.dataset.rail) === index);
    }
  });

  return {
    measure,
    update,
    destroy: unsubscribe,
  };
}
