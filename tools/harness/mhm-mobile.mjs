/**
 * Mobile audit over CDP. Answers the questions a phone actually asks:
 * does anything overlap, is every tap target big enough, is any text too small,
 * does the menu trap/lock/restore properly, and does the canvas render at the
 * device pixel ratio the handset reports?
 *
 * usage: node mhm-mobile.mjs <url> <width> <height> [mobile:true] [scrolls csv] [dpr:3]
 */
import { spawn } from 'node:child_process';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
/* unique port + profile per process: a shared port makes two harnesses attach to one
   browser and the later Emulation.setDeviceMetricsOverride silently rewrites the
   other run's viewport mid-audit */
const PORT = 9600 + (process.pid % 300);
const BASE = process.argv[2] ?? 'http://127.0.0.1:4173/';
const WIDTH = Number(process.argv[3] ?? 390);
const HEIGHT = Number(process.argv[4] ?? 844);
const MOBILE = (process.argv[5] ?? 'true') === 'true';
const SCROLLS = (process.argv[6] ?? '0').split(',').map(Number);
const DPR = Number(process.argv[7] ?? 3);
/* optional 8th arg `WxH` re-emulates the viewport mid-session, which is the only
   way to prove the resize path (quality.narrow/dpr, act framing, measurements)
   actually re-runs instead of freezing at boot */
const RESIZE = process.argv[8] ?? null;

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    `--user-data-dir=${process.env.TEMP}\\mhm-chrome-mobile-${process.pid}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let target = null;
for (let i = 0; i < 80; i += 1) {
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const list = await response.json();
    target = list.find((item) => item.type === 'page');
    if (target) break;
  } catch {
    /* not up yet */
  }
  await sleep(250);
}

if (!target) {
  console.error('MOBILE: no debugger target');
  chrome.kill();
  process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let counter = 0;

ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
});

await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));

function send(method, params = {}) {
  const id = ++counter;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.result?.exceptionDetails) return { error: response.result.exceptionDetails.text };
  return response.result?.result?.value;
}

const PROBE = `(() => {
  const box = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right), bottom: Math.round(b.bottom) };
  };
  const styleOf = (el) => (el ? getComputedStyle(el) : null);
  const visible = (el) => {
    if (!el) return false;
    const s = styleOf(el);
    const b = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0 && b.width > 0 && b.height > 0;
  };
  const label = (el) => {
    if (!el) return null;
    const id = el.id ? '#' + el.id : '';
    const cls = (el.className || '').toString().trim().split(/\\s+/).filter(Boolean).slice(0, 3).join('.');
    return el.tagName.toLowerCase() + id + (cls ? '.' + cls : '');
  };
  const text = (el) => (el && el.textContent ? el.textContent.replace(/\\s+/g, ' ').trim().slice(0, 40) : '');
  const overlaps = (a, b) => {
    const x = Math.min(a.right, b.right) - Math.max(a.x, b.x);
    const y = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
    return x > 1 && y > 1 ? Math.round(x * y) : 0;
  };
  const inkRight = (el) => {
    if (!el) return null;
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = range.getClientRects();
    let right = 0;
    for (const r of rects) right = Math.max(right, r.right);
    return rects.length ? Math.round(right) : null;
  };
  const focusables = [...document.querySelectorAll('a[href], button:not([disabled]), input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])')].filter(visible);

  const tapTargets = focusables.map((el) => {
    const b = el.getBoundingClientRect();
    return { el: label(el), text: text(el), w: Math.round(b.width), h: Math.round(b.height), min: Math.round(Math.min(b.width, b.height)) };
  }).sort((a, b) => a.min - b.min);

  const smallText = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!own) continue;
    const size = parseFloat(styleOf(el).fontSize);
    if (size < 12) smallText.push({ el: label(el), size: Number(size.toFixed(2)), text: text(el) });
  }

  const headingOverflow = [...document.querySelectorAll('h1, h2, h3, .display, .ticker__track')].filter(visible).map((el) => {
    const b = el.getBoundingClientRect();
    return { el: label(el), text: text(el), w: Math.round(b.width), scrollW: el.scrollWidth, inkRight: inkRight(el), overflowsBox: el.scrollWidth > el.clientWidth + 1 };
  }).filter((row) => row.overflowsBox || row.inkRight > Math.ceil(window.innerWidth));

  const facts = [...document.querySelectorAll('.facts__item')].map((item) => {
    const dt = item.querySelector('dt');
    const dd = item.querySelector('dd');
    const dtBox = box(dt);
    const ddBox = box(dd);
    return { dt: text(dt), dd: text(dd), dtBox, ddBox, dtDdOverlap: dtBox && ddBox ? overlaps(dtBox, ddBox) : 0, itemBox: box(item) };
  });

  const pairOverlap = [];
  const pairRoots = ['.facts', '.stats', '.visit__details', '.program__meta', '.timetable', '.foot__fine', '.nav__list', '.visit__actions'];
  for (const rootSel of pairRoots) {
    const root = document.querySelector(rootSel);
    if (!root || !visible(root)) continue;
    const kids = [...root.children].filter(visible);
    for (let i = 0; i < kids.length; i += 1) {
      for (let j = i + 1; j < kids.length; j += 1) {
        const area = overlaps(kids[i].getBoundingClientRect(), kids[j].getBoundingClientRect());
        if (area > 4) pairOverlap.push({ root: rootSel, a: text(kids[i]), b: text(kids[j]), area });
      }
    }
  }

  const tag = document.querySelector('.chapter__tag');
  const tagBox = box(tag);
  const factsBox = box(document.querySelector('.facts'));
  const tagFactsOverlap = tagBox && factsBox ? overlaps(tagBox, factsBox) : 0;
  const tagItemOverlaps = [...document.querySelectorAll('.facts__item')].map((item) => ({ dt: text(item.querySelector('dt')), area: tagBox ? overlaps(tagBox, item.getBoundingClientRect()) : 0 })).filter((row) => row.area > 0);

  const cue = document.querySelector('.cue');
  const cueBox = box(cue);
  const cueFootBox = box(document.querySelector('.hero__foot'));
  const cueFactsOverlap = cueBox && factsBox ? overlaps(cueBox, factsBox) : 0;
  const cueFootOverlap = cueBox && cueFootBox ? overlaps(cueBox, cueFootBox) : 0;

  const canvas = document.getElementById('stage');
  const canvasRect = box(canvas);
  const hero = document.querySelector('.chapter--hero');
  const firstChapter = document.querySelector('.chapter--stage');

  return {
    viewport: {
      layoutW: document.documentElement.clientWidth,
      layoutH: document.documentElement.clientHeight,
      innerW: window.innerWidth,
      innerH: window.innerHeight,
      visualW: window.visualViewport ? Math.round(window.visualViewport.width) : null,
      visualH: window.visualViewport ? Math.round(window.visualViewport.height) : null,
      dpr: window.devicePixelRatio,
      screenW: screen.width,
      screenH: screen.height,
      orientation: screen.orientation ? screen.orientation.type : null,
      hardwareConcurrency: navigator.hardwareConcurrency || null,
      maxTouchPoints: navigator.maxTouchPoints,
      hover: matchMedia('(hover: hover)').matches,
      coarse: matchMedia('(pointer: coarse)').matches,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      reducedTransparency: matchMedia('(prefers-reduced-transparency: reduce)').matches,
    },
    support: {
      dvh: CSS.supports('height: 100dvh'),
      svh: CSS.supports('height: 100svh'),
      safeArea: CSS.supports('padding-top: env(safe-area-inset-top)'),
    },
    canvas: canvasRect ? { ...canvasRect, bufferW: canvas.width, bufferH: canvas.height, bufferRatioW: Number((canvas.width / Math.max(1, canvasRect.w)).toFixed(2)) } : null,
    hero: { box: box(hero), minHeight: styleOf(hero)?.minHeight, firstStageMinHeight: styleOf(firstChapter)?.minHeight, tagBox, factsBox, tagFactsOverlap, tagItemOverlaps, cueBox, cueDisplay: styleOf(cue)?.display, cueFactsOverlap, cueFootOverlap },
    layout: {
      rail: styleOf(document.querySelector('.rail'))?.display,
      topbarCta: styleOf(document.querySelector('.topbar__cta'))?.display,
      navCta: styleOf(document.querySelector('.nav__cta'))?.display,
      topbar: box(document.querySelector('.topbar')),
    },
    sideways: (() => {
      const limit = document.documentElement.clientWidth;
      const insideClip = (el) => {
        for (let p = el.parentElement; p; p = p.parentElement) {
          const s = getComputedStyle(p);
          if (s.overflowX !== 'visible' || s.overflowY !== 'visible') return true;
        }
        return false;
      };
      const out = [];
      for (const el of document.querySelectorAll('body *')) {
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        if (b.right <= limit + 1) continue;
        const s = getComputedStyle(el);
        if (s.position === 'fixed' || insideClip(el)) continue;
        out.push({ el: label(el), right: Math.round(b.right) });
      }
      return { count: out.length, sample: out.slice(0, 6) };
    })(),
    tapTargets: {
      under44: tapTargets.filter((t) => t.min < 44).slice(0, 14),
      under24: tapTargets.filter((t) => t.min < 24),
      counts: { total: tapTargets.length, under44: tapTargets.filter((t) => t.min < 44).length, under24: tapTargets.filter((t) => t.min < 24).length },
    },
    smallText: smallText.slice(0, 14),
    headingOverflow,
    facts,
    pairOverlap,
    menuStateBefore: {
      expanded: document.querySelector('[data-menu]')?.getAttribute('aria-expanded'),
      navAriaModal: document.getElementById('nav')?.getAttribute('aria-modal'),
      navInertSupported: 'inert' in HTMLElement.prototype,
      outsideFocusables: focusables.filter((el) => !document.getElementById('nav').contains(el) && !document.querySelector('[data-menu]').closest('header').contains(el)).length,
      bodyOverflow: styleOf(document.body)?.overflow,
    },
  };
})()`;

await send('Runtime.enable');
await send('Page.enable');
if (MOBILE) {
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
}
await send('Emulation.setDeviceMetricsOverride', {
  width: WIDTH,
  height: HEIGHT,
  deviceScaleFactor: DPR,
  mobile: MOBILE,
  screenOrientation: { type: WIDTH > HEIGHT ? 'landscapePrimary' : 'portraitPrimary', angle: WIDTH > HEIGHT ? 90 : 0 },
});
await send('Page.navigate', { url: BASE });
await sleep(4500);

const baseline = await evaluate(PROBE);
console.log('--- baseline ---');
console.log(JSON.stringify(baseline, null, 2));

if (RESIZE) {
  const [rw, rh] = RESIZE.split('x').map(Number);
  if (rw && rh) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: rw,
      height: rh,
      deviceScaleFactor: DPR,
      mobile: MOBILE,
      screenOrientation: { type: rw > rh ? 'landscapePrimary' : 'portraitPrimary', angle: rw > rh ? 90 : 0 },
    });
    await sleep(1200);
    const resized = await evaluate(`(() => ({
      from: '${WIDTH}x${HEIGHT}',
      to: '${rw}x${rh}',
      layoutW: document.documentElement.clientWidth,
      innerW: window.innerWidth,
      canvasCssW: Math.round(document.getElementById('stage').getBoundingClientRect().width),
      canvasBufferW: document.getElementById('stage').width,
      bufferRatioW: Number((document.getElementById('stage').width / Math.max(1, document.getElementById('stage').getBoundingClientRect().width)).toFixed(2)),
      heroMinHeight: getComputedStyle(document.querySelector('.chapter--hero')).minHeight,
      rail: getComputedStyle(document.querySelector('.rail')).display,
      topbarCta: getComputedStyle(document.querySelector('.topbar__cta')).display,
      navCta: getComputedStyle(document.querySelector('.nav__cta')).display,
    }))()`);
    console.log('RESIZE ' + JSON.stringify(resized));
  }
}

for (const position of SCROLLS) {
  await evaluate(
    'window.scrollTo({ top: (document.documentElement.scrollHeight - window.innerHeight) * ' + position + ', behavior: "instant" }); true',
  );
  await sleep(700);
  const row = await evaluate(`(() => ({
    position: ${position},
    scrollY: Math.round(window.scrollY),
    visualH: window.visualViewport ? Math.round(window.visualViewport.height) : null,
    innerH: window.innerHeight,
    canvasBufferW: document.getElementById('stage').width,
    canvasCssW: Math.round(document.getElementById('stage').getBoundingClientRect().width),
    rail: getComputedStyle(document.querySelector('.rail')).display,
    topTone: document.documentElement.dataset.topTone ?? null,
    railTone: document.documentElement.dataset.railTone ?? null,
    menuOpen: document.documentElement.classList.contains('menu-open'),
  }))()`);
  console.log('SCROLL ' + JSON.stringify(row));
}

await evaluate('window.scrollTo({ top: 0, behavior: "instant" }); true');
await sleep(400);
const before = await evaluate('({ scrollY: Math.round(window.scrollY), bodyOverflow: getComputedStyle(document.body).overflow })');
await evaluate('document.querySelector("[data-menu]").click(); true');
await sleep(900);
const openState = await evaluate(`(() => {
  const nav = document.getElementById('nav');
  const toggle = document.querySelector('[data-menu]');
  const body = document.body;
  const main = document.getElementById('main');
  const foot = document.querySelector('.foot');
  const focusables = [...document.querySelectorAll('a[href], button:not([disabled]), input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => {
    const s = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0 && b.width > 0 && b.height > 0;
  });
  const outside = focusables.filter((el) => !nav.contains(el) && !toggle.closest('header').contains(el) && !el.closest('[inert]'));
  const outsideInert = focusables.filter((el) => !nav.contains(el) && !toggle.closest('header').contains(el) && Boolean(el.closest('[inert]')));
  const beforeScroll = window.scrollY;
  window.scrollTo({ top: 600, behavior: 'instant' });
  const afterScroll = window.scrollY;
  const box = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.x), y: Math.round(b.y) };
  };
  return {
    expanded: toggle.getAttribute('aria-expanded'),
    navVisibility: getComputedStyle(nav).visibility,
    navOpacity: getComputedStyle(nav).opacity,
    navRole: nav.getAttribute('role'),
    navAriaModal: nav.getAttribute('aria-modal'),
    navAriaHidden: nav.getAttribute('aria-hidden'),
    bodyOverflow: getComputedStyle(body).overflow,
    bodyInlineOverflow: body.style.overflow,
    mainInert: main.inert,
    footInert: foot.inert,
    outsideFocusables: outside.length,
    outsideInert: outsideInert.length,
    outsideSample: outside.slice(0, 5).map((el) => el.tagName + '.' + (el.className || '').toString().slice(0, 30)),
    scrollBefore: Math.round(beforeScroll),
    scrollAfterAttempt: Math.round(afterScroll),
    scrollLocked: afterScroll === beforeScroll,
    panelScrollH: nav.scrollHeight,
    panelClientH: nav.clientHeight,
    ctaBox: box(document.querySelector('.nav__cta')),
    toggleBox: box(toggle),
    brandBox: box(document.querySelector('.brand')),
    firstLinkBox: box(nav.querySelector('.nav__list a')),
  };
})()`);
console.log('MENU BEFORE ' + JSON.stringify(before));
console.log('MENU OPEN ' + JSON.stringify(openState, null, 2));
await evaluate('document.querySelector("[data-menu]").click(); true');
await sleep(500);
const closed = await evaluate('({ expanded: document.querySelector("[data-menu]").getAttribute("aria-expanded"), scrollY: Math.round(window.scrollY), bodyOverflow: getComputedStyle(document.body).overflow })');
console.log('MENU CLOSED ' + JSON.stringify(closed));

chrome.kill();
process.exit(0);

