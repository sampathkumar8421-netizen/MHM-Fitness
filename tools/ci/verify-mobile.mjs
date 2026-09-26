#!/usr/bin/env node
/**
 * verify-mobile.mjs — turns the phone harness into a pass/fail gate.
 *
 * `mhm-mobile.mjs` reports rather than fails (it exits 0 even when it finds a 20px tap
 * target), which is right for an exploratory tool but useless in CI. This runs it over
 * three phone configurations, parses the JSON it prints, and exits non-zero if any
 * documented pass condition is broken.
 *
 * Requires: `npm run preview` already serving the built site, and Chrome installed (the
 * harness is Windows-only — see README "Known limitations").
 *
 * usage: npm run verify:mobile -- [url] [--only=<substring>]
 *   npm run verify:mobile
 *   npm run verify:mobile -- http://127.0.0.1:4173/ --only=320
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const harness = join(root, 'tools', 'harness', 'mhm-mobile.mjs');

const argv = process.argv.slice(2);
const url = argv.find((arg) => arg.startsWith('http')) ?? 'http://127.0.0.1:4173/';
const only = (argv.find((arg) => arg.startsWith('--only=')) ?? '').slice(7);

/** Phone shapes worth gating: the smallest common phone, a normal one, and a rotation. */
const CONFIGS = [
  { name: 'phone 390x844', w: 390, h: 844, dpr: 3, scrolls: '0,0.5,1' },
  { name: 'small phone 320x568', w: 320, h: 568, dpr: 2, scrolls: '0,1' },
  { name: 'rotate to landscape 844x390', w: 390, h: 844, dpr: 3, scrolls: '0', resize: '844x390' },
].filter((config) => config.name.includes(only));

/** Run the harness and return its stdout. */
function runHarness(config) {
  return new Promise((resolve, reject) => {
    const args = [harness, url, String(config.w), String(config.h), 'true', config.scrolls, String(config.dpr)];
    if (config.resize) args.push(config.resize);
    const child = spawn(process.execPath, args, { cwd: root });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`harness timed out after 180s for ${config.name}`));
    }, 180000);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (stdout.includes('--- baseline ---')) resolve(stdout);
      else reject(new Error(
        `harness failed for ${config.name} (exit ${code}).\n` +
        `Is something serving ${url} and is Chrome installed?\n${stderr || stdout}`.trim(),
      ));
    });
  });
}

/**
 * Pull the first complete JSON object that follows `marker`, without assuming the output
 * after it is JSON as well (the harness prints several objects in a row).
 */
function jsonAfter(text, marker) {
  const at = text.indexOf(marker);
  if (at < 0) return null;
  const start = text.indexOf('{', at + marker.length);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}


/**
 * The documented pass conditions, evaluated against one harness run.
 * Every one of these was a real shipped defect before the 2026-09-26 mobile pass.
 */
function evaluate(config, output) {
  const base = jsonAfter(output, '--- baseline ---');
  const open = jsonAfter(output, 'MENU OPEN');
  const before = jsonAfter(output, 'MENU BEFORE');
  const closed = jsonAfter(output, 'MENU CLOSED');
  const resize = config.resize ? jsonAfter(output, 'RESIZE ') : null;

  const checks = [];
  const check = (label, ok, detail = '') => checks.push({ label, ok: Boolean(ok), detail });

  if (!base || !open || !before || !closed) {
    check('harness produced a complete report', false, 'baseline / menu sections missing');
    return checks;
  }

  const counts = base.tapTargets?.counts ?? {};
  const smallText = base.smallText ?? [];
  const pairOverlap = base.pairOverlap ?? [];

  check('touch emulation is active (coarse pointer)', base.viewport?.coarse === true, `coarse=${base.viewport?.coarse}`);
  check('safe-area insets are supported', base.support?.safeArea === true);
  check('tap targets ≥ 44px', counts.under44 === 0, `${counts.under44} of ${counts.total} under 44px`);
  check('tap targets ≥ 24px', counts.under24 === 0, `${counts.under24} under 24px`);
  check('no text below 12px', smallText.length === 0, smallText.slice(0, 3).map((row) => `${row.size ?? ''}px ${row.text ?? ''}`.trim()).join(' | '));
  check('no sibling element pair overlaps', pairOverlap.length === 0, pairOverlap.slice(0, 2).map((row) => `${row.root} ${row.area}px²`).join(' | '));
  check('chapter tag is clear of the hero facts', base.hero?.tagFactsOverlap === 0, `${base.hero?.tagFactsOverlap}px²`);
  check('hero cue is clear of the hero facts', base.hero?.cueFactsOverlap === 0, `${base.hero?.cueFactsOverlap}px²`);
  check('no sideways overflow', base.sideways?.count === 0, `${base.sideways?.count} element(s)`);
  check(
    'canvas covers the layout width',
    base.canvas ? base.canvas.w >= base.viewport.layoutW - 1 : false,
    `canvas ${base.canvas?.w} vs layout ${base.viewport.layoutW}`,
  );
  /* The canvas is `position: fixed; inset: 0; width: 100%`, so it sizes against the
     initial containing block (innerWidth), not clientWidth. In headless Chrome those
     differ by the scrollbar even with --hide-scrollbars (411 vs 390); on a real phone
     they are equal. Compare against the right one. */
  check(
    'canvas fills its fixed-position containing block',
    base.canvas ? Math.abs(base.canvas.w - base.viewport.innerW) <= 1 : false,
    `canvas ${base.canvas?.w} vs innerWidth ${base.viewport.innerW}`,
  );

  check(
    'menu scroll-locks the page while open',
    open.scrollLocked === true && open.scrollAfterAttempt === open.scrollBefore,
    `attempted 600px scroll: ${open.scrollBefore} -> ${open.scrollAfterAttempt}`,
  );
  check('page behind the menu is inert', open.mainInert === true && open.footInert === true, `main=${open.mainInert} foot=${open.footInert}`);
  check('nothing focusable behind the menu', open.outsideFocusables === 0, `${open.outsideFocusables} reachable`);
  check('background controls are inert, not merely hidden', open.outsideInert > 0, `inert=${open.outsideInert}`);
  check('scroll position is restored on close', closed.scrollY === 0, `scrollY=${closed.scrollY}`);
  check(
    'aria-expanded tracks the panel',
    base.menuStateBefore?.expanded === 'false' && open.expanded === 'true' && closed.expanded === 'false',
    `${base.menuStateBefore?.expanded} -> ${open.expanded} -> ${closed.expanded}`,
  );
  check('page starts at the top before the menu opens', before.scrollY === 0, `scrollY=${before.scrollY}`);
  /* Precondition: if nothing were focusable behind the panel, the containment check below
     would pass vacuously. */
  check(
    'background controls exist before opening (so containment is meaningful)',
    (base.menuStateBefore?.outsideFocusables ?? 0) > 0,
    `${base.menuStateBefore?.outsideFocusables} focusable before opening`,
  );
  check('menu CTA is at least 44px tall', (open.ctaBox?.h ?? 0) >= 44, `${open.ctaBox?.h}px`);
  check('menu toggle is at least 44px tall', (open.toggleBox?.h ?? 0) >= 44, `${open.toggleBox?.h}px`);
  check('brand link is at least 44px tall', (open.brandBox?.h ?? 0) >= 44, `${open.brandBox?.h}px`);
  check('first menu link is inside the panel scroll area', (open.firstLinkBox?.y ?? -1) >= 0, `y=${open.firstLinkBox?.y}`);

  if (config.resize) {
    const [targetW] = config.resize.split('x').map(Number);
    check('resize re-derived the layout width', resize?.layoutW === targetW, `layoutW=${resize?.layoutW} expected ${targetW}`);
    check('quality stepped down after resize', (resize?.bufferRatioW ?? 99) <= 1.6, `canvas buffer ratio ${resize?.bufferRatioW}`);
    check('rail stays hidden at phone width', resize?.rail === 'none', `rail display=${resize?.rail}`);
    check(
      'canvas still covers the resized layout',
      resize ? resize.canvasCssW >= resize.layoutW - 1 : false,
      `canvas ${resize?.canvasCssW} vs layout ${resize?.layoutW}`,
    );
    check(
      'canvas still fills its containing block after resize',
      resize ? Math.abs(resize.canvasCssW - resize.innerW) <= 1 : false,
      `canvas ${resize?.canvasCssW} vs innerWidth ${resize?.innerW}`,
    );
  }

  return checks;
}

if (CONFIGS.length === 0) {
  console.error(`\n✗ --only="${only}" matched no configuration.\n`);
  process.exit(2);
}

console.log(`\nverify-mobile — ${url}`);
const results = [];
for (const config of CONFIGS) {
  process.stdout.write(`  ▸ ${config.name} … `);
  let checks;
  try {
    checks = evaluate(config, await runHarness(config));
  } catch (error) {
    console.log('failed to run');
    console.error(`\n✗ ${error.message}\n`);
    process.exit(1);
  }
  const broken = checks.filter((row) => !row.ok);
  results.push({ config, checks, broken });
  console.log(broken.length === 0 ? `ok (${checks.length} checks)` : `${broken.length} broken`);
}

const line = '─'.repeat(64);
console.log(`\n${line}`);
let total = 0;
let broken = 0;
for (const { config, checks, broken: bad } of results) {
  console.log(`  ${config.name} — ${checks.length - bad.length}/${checks.length}`);
  for (const row of checks) {
    total += 1;
    if (row.ok) continue;
    broken += 1;
    console.error(`    ✗ ${row.label}${row.detail ? ` — ${row.detail}` : ''}`);
  }
}
console.log(line);
if (broken > 0) {
  console.error(`✗ ${broken} of ${total} mobile checks broken.\n`);
  process.exit(1);
}
console.log(`✓ all ${total} mobile checks pass.\n`);

