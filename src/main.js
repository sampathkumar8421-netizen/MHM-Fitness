/* ==========================================================================
   main.js — the only place that owns time.
   Import order matters twice over: the layer declaration lands before any rule,
   and the fonts land before the first paint of display type.
   ========================================================================== */

import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource-variable/instrument-sans/index.css';
import '@fontsource-variable/jetbrains-mono/index.css';

import './styles/layers.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/sections.css';

import { createScrollRig } from './scroll/scrollRig.js';
import { createStage } from './three/stage.js';
import { createActs } from './three/acts.js';
import { initNav } from './ui/nav.js';
import { initReveal } from './ui/reveal.js';
import { initCounters } from './ui/counters.js';
import { initMagnetic } from './ui/magnetic.js';
import { initScrub } from './ui/scrub.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const motionOK = !reduceMotion;

// τ → 0 under reduced motion: the rig still reports position, it just never eases.
const rig = createScrollRig({ tau: reduceMotion ? 0.0001 : 0.09 });
const scrub = initScrub({ rig, motionOK });

initNav({ rig });
initReveal({ motionOK });
initCounters({ motionOK });
initMagnetic({ motionOK });

const canvas = document.getElementById('stage');
const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

let stage = null;
let acts = null;

try {
  stage = createStage(canvas);
  acts = createActs({ scene: stage.scene, materials: stage.materials, quality: stage.quality });
  acts.layout(stage.quality.narrow);
  stage.resize();
} catch (error) {
  console.warn('[mhm-fitness] WebGL unavailable — serving the poster instead.', error);
  document.documentElement.classList.add('no-webgl');
}

canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  document.documentElement.classList.add('no-webgl');
});

/**
 * Reduced motion still gets the sculpture — one still frame per chapter, cut in when
 * the chapter changes. Information, not animation.
 */
const STILLS = {
  0: { hero: 0.34 },
  2: { progression: 0.62 },
  3: { pull: 0.68 },
  9: { visit: 0.8 },
};

function drawStill(sectionIndex) {
  if (!acts) return;
  acts.update(STILLS[sectionIndex] ?? STILLS[0], 1, stage.camera, { x: 0, y: 0 });
  stage.render();
}

let stillDirty = true;
rig.onSection((index) => {
  if (reduceMotion) drawStill(index);
});

function measureAll() {
  rig.measure();
  scrub.measure();
  stillDirty = true;
}

measureAll();
if (reduceMotion) drawStill(0);

window.addEventListener(
  'pointermove',
  (event) => {
    if (reduceMotion || event.pointerType !== 'mouse') return;
    pointer.tx = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (event.clientY / window.innerHeight) * 2 - 1;
  },
  { passive: true },
);

let resizeTimer = 0;
/**
 * One debounced sync for every way a mobile viewport changes: a real resize, a
 * rotation, and the URL bar collapsing/expanding (visualViewport). Without the
 * visualViewport listener the canvas/acts measured the old height while the
 * browser chrome animated, which on phones shows up as a stale scroll progress
 * and a sculpture framed for the wrong height.
 */
function scheduleViewportSync() {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    measureAll();
    if (!stage) return;
    stage.resize();
    acts.layout(stage.quality.narrow);
    if (reduceMotion) drawStill(rig.state.activeSection);
  }, 140);
}

window.addEventListener('resize', scheduleViewportSync);
window.addEventListener('orientationchange', scheduleViewportSync);
window.visualViewport?.addEventListener('resize', scheduleViewportSync, { passive: true });

// webfonts change line lengths, which changes every cached offset
if (document.fonts?.ready) document.fonts.ready.then(measureAll).catch(() => {});
window.addEventListener('load', measureAll, { once: true });

let last = performance.now();

function frame(now) {
  const dt = Math.min((now - last) / 1000, 1 / 20);
  last = now;

  rig.update(dt);
  scrub.update();

  if (acts) {
    if (reduceMotion) {
      if (stillDirty) {
        drawStill(rig.state.activeSection);
        stillDirty = false;
      }
    } else {
      const k = 1 - Math.exp(-dt / 0.4);
      pointer.x += (pointer.tx - pointer.x) * k;
      pointer.y += (pointer.ty - pointer.y) * k;

      acts.update(rig.state.acts, dt, stage.camera, pointer);
      stage.render();
    }
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
