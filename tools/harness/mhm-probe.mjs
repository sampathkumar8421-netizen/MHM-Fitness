/**
 * Geometry probe over CDP. Prints layout boxes (shell, chapter, rail, coach grid,
 * captions) plus the true text ink edge of any element, so "does this copy cross
 * the fixed rail's hairline" is answered with numbers, not eyeballed pixels.
 *
 * usage: node mhm-probe.mjs <url> <width> <height> [mobile:false]
 */
import { spawn } from 'node:child_process';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
/* unique port + profile per process, or two harnesses share one browser and race */
const PORT = 9500 + (process.pid % 400);
const BASE = process.argv[2] ?? 'http://127.0.0.1:4173/';
const WIDTH = Number(process.argv[3] ?? 1600);
const HEIGHT = Number(process.argv[4] ?? 1000);
const MOBILE = (process.argv[5] ?? 'false') === 'true';

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
    `--user-data-dir=${process.env.TEMP}\\mhm-chrome-probe-${process.pid}`,
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
  console.error('PROBE: no debugger target');
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
await send('Emulation.setDeviceMetricsOverride', {
  width: WIDTH,
  height: HEIGHT,
  deviceScaleFactor: 1,
  mobile: MOBILE,
});
await send('Page.navigate', { url: BASE });
await sleep(4500);

const PROBE = `(() => {
  const r = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: Math.round(b.x), right: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height) };
  };
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const varOf = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  /* true right edge of the rendered text, not the box */
  const inkRight = (el) => {
    if (!el) return null;
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = [...range.getClientRects()];
    if (!rects.length) return null;
    return Math.round(Math.max(...rects.map((b) => b.right)));
  };
  const chapter = document.querySelector('.chapter--editorial');
  const coach = document.querySelector('.coach');
  const bio = document.querySelector('.coach__bio');
  const caption = document.querySelector('.method__layout .stage-caption') ?? document.querySelector('.stage-caption');
  const chapterCs = cs(chapter);
  return {
    layoutWidth: document.documentElement.clientWidth,
    innerWidth,
    vars: { gutter: varOf('--gutter'), railSafe: varOf('--rail-safe'), railSpan: varOf('--rail-span'), shell: varOf('--shell') },
    shell: r(document.querySelector('.shell, .chapter__inner, .wrap')),
    chapterEditorial: r(chapter),
    chapterPad: chapterCs ? { x: chapterCs.paddingLeft, r: chapterCs.paddingRight } : null,
    /* every band's computed surface, so "no light surface left on the page" is a
       measurement rather than an eyeball call */
    surfaces: [...document.querySelectorAll('main > section, .foot')].map((el) => ({
      name: el.id || (el.className || '').toString().replace('chapter ', '').slice(0, 32) || el.tagName,
      bg: getComputedStyle(el).backgroundColor,
    })),
    rail: r(document.querySelector('.rail')),
    railDisplay: cs(document.querySelector('.rail'))?.display,
    track: r(document.querySelector('.rail__track')),
    numsInkLeft: inkRight(document.querySelector('.rail__num')) !== null ? Math.round(document.querySelector('.rail__num').getBoundingClientRect().left) : null,
    coachList: r(document.querySelector('.coach-list')),
    coachGrid: cs(coach)?.gridTemplateColumns,
    coachNote: cs(coach)?.paddingRight,
    bio: r(bio),
    bioMaxWidth: cs(bio)?.maxWidth,
    bioInkRight: inkRight(bio),
    lastCoachRule: r(document.querySelector('.coach:last-of-type')),
    caption: r(caption),
    captionInkRight: inkRight(caption),
    /* the narrow role label vs the bio column: does any wrapped role line's ink cross
       into the bio's x? (the role track is a flexible 1fr, so it should widen instead) */
    credentials: [...document.querySelectorAll('.coach')].slice(0, 3).map((li) => {
      const role = li.querySelector('.coach__role');
      const bio = li.querySelector('.coach__bio');
      const rb = role?.getBoundingClientRect();
      const bb = bio?.getBoundingClientRect();
      return {
        role: rb ? { x: Math.round(rb.left), right: Math.round(rb.right), inkRight: inkRight(role), color: getComputedStyle(role).color, clientW: role.clientWidth, scrollW: role.scrollWidth } : null,
        bioX: bb ? Math.round(bb.left) : null,
      };
    }),
    methodRules: r(document.querySelector('.rules')),
    methodRulesInkRight: (() => {
      const rule = document.querySelector('.rules li p, .rules li');
      return rule ? inkRight(rule) : null;
    })(),
    membershipTable: r(document.querySelector('.plan, .membership__table, .plan-list')),
    programsGrid: r(document.querySelector('.programs__grid')),
    visitDetails: r(document.querySelector('.visit__details')),
    visitInkRight: inkRight(document.querySelector('.visit__details')),
    /* sideways overflow that is actually visible: fixed elements stretch to the
       document's overflow, and clipped descendants report their unclipped boxes,
       so both are excluded before naming culprits */
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
        out.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 40), left: Math.round(b.left), right: Math.round(b.right) });
      }
      out.sort((a, b) => b.right - a.right);
      return { limit, scrollWidth: document.documentElement.scrollWidth, count: out.length, culprits: out.slice(0, 8) };
    })(),
  };
})()`;

const data = await evaluate(PROBE);
console.log(JSON.stringify(data, null, 2));

chrome.kill();
process.exit(0);
