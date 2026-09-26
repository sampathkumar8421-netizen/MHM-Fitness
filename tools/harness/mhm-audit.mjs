/**
 * Geometry + colour audit over CDP. Reports the exact rects/colours of the rail,
 * topbar, captions and tone attributes at a list of scroll positions, so layout
 * collisions can be fixed with numbers instead of eyeballed pixels.
 */
import { spawn } from 'node:child_process';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
/* unique port + profile per process: a shared port makes two harnesses attach to one
   browser, and the later Emulation.setDeviceMetricsOverride then silently rewrites the
   other run's viewport mid-audit (observed: "390" audit rows reporting vw:1100) */
const PORT = 9334 + (process.pid % 300);
const BASE = process.argv[2] ?? 'http://127.0.0.1:4173/';
const WIDTH = Number(process.argv[3] ?? 1600);
const HEIGHT = Number(process.argv[4] ?? 1000);

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
    `--user-data-dir=${process.env.TEMP}\\mhm-chrome-audit-${process.pid}`,
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
  console.error('AUDIT: no debugger target');
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

await send('Runtime.enable');
await send('Page.enable');
const MOBILE = (process.argv[6] ?? 'false') === 'true';

await send('Emulation.setDeviceMetricsOverride', {
  width: WIDTH,
  height: HEIGHT,
  deviceScaleFactor: 1,
  mobile: MOBILE,
});
await send('Page.navigate', { url: BASE });
await sleep(4500);

const PROBE = `(() => {
  const rect = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right) };
  };
  const colour = (el, prop = 'color') => (el ? getComputedStyle(el)[prop] : null);
  const root = document.documentElement;
  const railEl = document.querySelector('.rail');
  const railDisplay = railEl ? getComputedStyle(railEl).display : null;
  const railVisible = railDisplay !== 'none';
  const nums = [...document.querySelectorAll('.rail__num')];
  const activeLabel = document.querySelector('.rail__list li.is-active .rail__label');
  const labelRect = rect(activeLabel);
  const trackBox = rect(document.querySelector('.rail__track'));
  const captions = [...document.querySelectorAll('.stage-caption')]
    .filter((el) => el.getBoundingClientRect().height > 0)
    .map((el) => ({ text: el.textContent.trim().slice(0, 18), box: rect(el) }));
  const topbar = document.querySelector('.topbar');
  const bandEl = document.elementFromPoint(innerWidth - 40, 34);
  const railBandEl = document.elementFromPoint(innerWidth - 60, Math.round(innerHeight / 2));
  return {
    scrollY: Math.round(window.scrollY),
    vw: innerWidth,
    rail: rect(railEl),
    railDisplay,
    track: rect(document.querySelector('.rail__track')),
    firstNum: rect(nums[0]),
    lastNum: rect(nums[nums.length - 1]),
    activeLabel: labelRect ? { ...labelRect, text: activeLabel.textContent } : null,
    labelOverflowX: railVisible && labelRect ? Math.round(labelRect.right - innerWidth) : null,
    labelGapToNumber: railVisible && labelRect && nums[0] ? Math.round(rect(document.querySelector('.rail__list li.is-active .rail__num')).right - labelRect.x) : null,
    railNumColour: colour(document.querySelector('.rail__num')),
    railTrackBg: colour(document.querySelector('.rail__track'), 'backgroundColor'),
    topbarBg: colour(topbar, 'backgroundColor'),
    topbarColour: colour(topbar),
    navLinkColour: colour(document.querySelector('.nav__list a')),
    ctaBg: colour(document.querySelector('.topbar__cta'), 'backgroundColor'),
    ctaColour: colour(document.querySelector('.topbar__cta')),
    captions,
    /* positive = the caption's right edge reaches N px past the rail's hairline.
       On phones the rail is display:none, so there is no hairline to clear and
       the number would be a lie; null means "not applicable at this width". */
    captionVsRail: captions.map((c) => ({
      text: c.text,
      into: railVisible && trackBox ? Math.round(c.box.right - trackBox.x) : null,
    })),
    railLabelOverflow: railVisible && labelRect ? Math.round(labelRect.right - innerWidth) : null,
    bandTop: bandEl ? (bandEl.className || bandEl.tagName).toString().slice(0, 40) : null,
    bandRail: railBandEl ? (railBandEl.className || railBandEl.tagName).toString().slice(0, 40) : null,
    topTone: root.dataset.topTone ?? null,
    railTone: root.dataset.railTone ?? null,
  };
})()`;

const positions = process.argv[5]
  ? process.argv[5].split(',').map(Number)
  : [0, 0.07, 0.15, 0.23, 0.32, 0.42, 0.53, 0.64, 0.72, 0.8, 0.88, 0.97, 1];

for (const position of positions) {
  await evaluate(
    `window.scrollTo({ top: (document.documentElement.scrollHeight - window.innerHeight) * ${position}, behavior: 'instant' }); true`,
  );
  await sleep(700);
  const data = await evaluate(PROBE);
  console.log(`--- ${position} ---`);
  console.log(JSON.stringify(data));
}

chrome.kill();
process.exit(0);
