/**
 * Viewport screenshots over CDP, with optional menu-panel opening, so narrow-viewport
 * states (mobile topbar, mobile nav panel, tablet rail collision) can be inspected.
 *
 * usage: node mhm-shot.mjs <url> <width> <height> <scrolls csv> [menu:false] [prefix:shot]
 */
import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
/* unique port + profile per process: two harnesses sharing either would silently
   attach to the same browser and race on the emulated viewport */
const PORT = 9400 + (process.pid % 500);
/* screenshots land beside the harness so a run is self-contained and reviewable */
const OUT = process.env.MHM_SHOTS ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'screens');
const BASE = process.argv[2] ?? 'http://127.0.0.1:4173/';
const WIDTH = Number(process.argv[3] ?? 390);
const HEIGHT = Number(process.argv[4] ?? 844);
const SCROLLS = (process.argv[5] ?? '0').split(',').map(Number);
const MENU = (process.argv[6] ?? 'false') === 'true';
const PREFIX = process.argv[7] ?? `shot-${WIDTH}x${HEIGHT}`;

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
    `--user-data-dir=${process.env.TEMP}\\mhm-chrome-shot-${process.pid}`,
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
  console.error('SHOT: no debugger target');
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

async function shoot(name) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await mkdir(OUT, { recursive: true });
  await writeFile(`${OUT}\\${name}.png`, Buffer.from(shot.result.data, 'base64'));
  console.log(`wrote ${OUT}\\${name}.png`);
}

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: WIDTH,
  height: HEIGHT,
  deviceScaleFactor: 1,
  mobile: WIDTH < 700,
});
await send('Page.navigate', { url: BASE });
await sleep(4500);

/* does anything stick out sideways? the classic narrow-viewport defect.
   fixed-position furniture is reported separately: it stretches to whatever the
   document overflow is, so it is a symptom, never the cause. */
const overflow = await evaluate(`(() => {
  const limit = document.documentElement.clientWidth;
  const bad = [];
  const fixed = [];
  /* fixed elements stretch to the document's overflow, and a clipped descendant
     reports its unclipped box; neither is a pannable cause. */
  const insideClip = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible') return true;
    }
    return false;
  };
  for (const el of document.querySelectorAll('body *')) {
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) continue;
    if (b.right <= limit + 1) continue;
    const entry = { tag: el.tagName, cls: (el.className || '').toString().slice(0, 44), left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width) };
    if (getComputedStyle(el).position === 'fixed') fixed.push(entry);
    else if (!insideClip(el)) bad.push(entry);
  }
  bad.sort((a, b) => b.right - a.right);
  fixed.sort((a, b) => b.right - a.right);
  return { clientWidth: limit, scrollWidth: document.documentElement.scrollWidth, causes: bad.slice(0, 10), causeCount: bad.length, fixedWidened: fixed.slice(0, 6) };
})()`);
console.log('OVERFLOW', JSON.stringify(overflow));

/* Which top-level block forces the sideways scroll? Only meaningful when there is
   real (non-fixed) overflow to bisect; otherwise every hidden block "passes" and
   the list is noise. */
const bisect =
  overflow && overflow.scrollWidth > overflow.clientWidth + 1 && overflow.causeCount > 0
    ? await evaluate(`(() => {
  const limit = document.documentElement.clientWidth;
  const hits = [];
  for (const block of document.querySelectorAll('main > section, header, aside, footer')) {
    const previous = block.style.display;
    block.style.display = 'none';
    const width = document.documentElement.scrollWidth;
    block.style.display = previous;
    if (width <= limit + 1) hits.push(block.id || block.className.toString().slice(0, 40));
  }
  return hits;
})()`)
    : null;
console.log('OVERFLOW BLOCK', JSON.stringify(bisect));

for (const position of SCROLLS) {
  await evaluate(
    `window.scrollTo({ top: (document.documentElement.scrollHeight - window.innerHeight) * ${position}, behavior: 'instant' }); true`,
  );
  await sleep(800);
  const tag = MENU ? `${PREFIX}-menu-${String(position).replace('.', '_')}` : `${PREFIX}-${String(position).replace('.', '_')}`;
  const tones = await evaluate(`JSON.stringify({ top: document.documentElement.dataset.topTone ?? null, rail: document.documentElement.dataset.railTone ?? null, railDisplay: getComputedStyle(document.querySelector('.rail')).display, ctaDisplay: getComputedStyle(document.querySelector('.nav__cta') ?? document.body).display })`);
  console.log(`${tag} tones=${tones}`);
  await shoot(tag);
}

if (MENU) {
  await evaluate(`window.scrollTo({ top: 0, behavior: 'instant' }); true`);
  await sleep(400);
  await evaluate(`document.querySelector('[data-menu]').click(); true`);
  await sleep(900);
  const state = await evaluate(`JSON.stringify({
    menuOpen: document.documentElement.classList.contains('menu-open'),
    panelVisible: getComputedStyle(document.getElementById('nav')).visibility,
    panelOpacity: getComputedStyle(document.getElementById('nav')).opacity,
    bodyOverflow: document.body.style.overflow,
    ctaVisible: (() => { const el = document.querySelector('.nav__cta'); if (!el) return 'missing'; const b = el.getBoundingClientRect(); const s = getComputedStyle(el); return { display: s.display, w: Math.round(b.width), h: Math.round(b.height), bg: s.backgroundColor, fg: s.color, y: Math.round(b.y) }; })(),
    menuBtnColour: getComputedStyle(document.querySelector('.menu-btn')).color,
  })`);
  console.log('MENU', state);
  await shoot(`${PREFIX}-menu-open`);
}

chrome.kill();
process.exit(0);
