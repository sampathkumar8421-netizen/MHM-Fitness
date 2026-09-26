/**
 * scrollRig — turns document scroll into damped, frame-rate independent progress.
 *
 * Two clocks are published:
 *   · p            global page progress 0 → 1 (drives the rail and the camera spline)
 *   · acts[name]   per-chapter progress 0 → 1, where 0 means the chapter's top edge is
 *                  level with the bottom of the viewport and 1 means its bottom edge has
 *                  just left the top. Chapter-local progress is what the 3D choreography
 *                  reads, so a short hero and a tall stage chapter feel equally paced.
 *
 * Nothing here touches layout except `measure()`, which is called on resize only.
 */

const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);

/* visualViewport is the height the user can actually see: it shrinks while the
   mobile URL bar is on screen. Falling back to innerHeight keeps desktop and
   older browsers identical. */
const viewportHeight = () => Math.round(window.visualViewport?.height ?? window.innerHeight);

export function createScrollRig({ tau = 0.09 } = {}) {
  const state = {
    p: 0,
    raw: 0,
    velocity: 0,
    acts: Object.create(null),
    activeSection: -1,
  };

  let actMetrics = [];
  let sectionMetrics = [];
  let scrollable = 1;
  let viewport = 1;
  const sectionListeners = new Set();

  function measure() {
    viewport = viewportHeight();
    scrollable = Math.max(1, document.documentElement.scrollHeight - viewport);

    actMetrics = Array.from(document.querySelectorAll('[data-act]'), (el) => {
      const rect = el.getBoundingClientRect();
      return {
        name: el.dataset.act,
        top: rect.top + window.scrollY,
        height: Math.max(1, rect.height),
      };
    });

    sectionMetrics = Array.from(document.querySelectorAll('[data-section]'), (el) => {
      const rect = el.getBoundingClientRect();
      return { index: Number(el.dataset.section), top: rect.top + window.scrollY };
    });
  }

  function update(dt) {
    const y = window.scrollY;
    const vh = viewportHeight();
    viewport = vh;
    const step = Math.max(dt, 1 / 240);
    // exponential damping: same feel at 60 Hz and 144 Hz
    const k = 1 - Math.exp(-step / tau);
    const previous = state.p;

    if (y <= 1) {
      // nothing to damp at the very top — snap so the hero never lags on load
      state.p = 0;
    } else {
      state.raw = clamp01(y / scrollable);
      state.p += (state.raw - state.p) * k;
    }

    state.velocity = (state.p - previous) / step;

    for (const act of actMetrics) {
      const target = clamp01((y + vh - act.top) / (act.height + vh));
      const current = state.acts[act.name];
      state.acts[act.name] = current === undefined ? target : current + (target - current) * k;
    }

    const line = y + vh * 0.42;
    let index = 0;
    for (const section of sectionMetrics) {
      if (section.top <= line) index = section.index;
    }

    if (index !== state.activeSection) {
      state.activeSection = index;
      for (const listener of sectionListeners) listener(index, state);
    }
  }

  function onSection(listener) {
    sectionListeners.add(listener);
    return () => sectionListeners.delete(listener);
  }

  return {
    state,
    measure,
    update,
    onSection,
    act: (name) => state.acts[name] ?? 0,
  };
}
