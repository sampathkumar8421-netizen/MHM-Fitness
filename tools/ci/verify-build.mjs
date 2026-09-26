#!/usr/bin/env node
/**
 * verify-build.mjs — post-build contract check on `dist/`.
 *
 * `npm run build` succeeding only means Vite produced files. This asserts the files
 * still carry the invariants the site depends on, so a refactor cannot silently drop
 * them:
 *
 *   · the mobile viewport contract (viewport-fit=cover, dark color-scheme)
 *   · relative asset paths, i.e. `base: './'` still holds and `dist/` is portable
 *   · the three.js chunk is still split out (first paint must not wait for WebGL)
 *   · fonts are self-hosted (no CDN request at runtime)
 *   · no sourcemaps and no dev-server URLs leaked into `dist/`
 *   · the mobile tokens survive CSS minification (tap targets, safe areas, hover guard)
 *
 * CSS is compared with all whitespace stripped, because esbuild's minifier removes the
 * space after colons and inside media queries.
 *
 * usage: npm run build && npm run verify:build
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dist = join(root, 'dist');
const assets = join(dist, 'assets');

const failures = [];
const pass = [];
const info = [];

/** Record a boolean assertion. */
function check(ok, label, detail = '') {
  if (ok) pass.push(label);
  else failures.push(detail ? `${label} — ${detail}` : label);
}

async function tryRead(path) {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else out.push(path);
  }
  return out;
}

const html = await tryRead(join(dist, 'index.html'));
if (html === null) {
  console.error(`\n✗ No build found at ${relative(root, dist)}\\index.html`);
  console.error('  Run `npm run build` first.\n');
  process.exit(1);
}

// --- viewport / theming contract -------------------------------------------
check(/viewport-fit=cover/.test(html), 'viewport meta declares viewport-fit=cover');
check(/name="viewport"[^>]*width=device-width/.test(html), 'viewport meta declares width=device-width');
check(/name="color-scheme"\s+content="dark"/.test(html), 'dark color-scheme meta is present');
check(/<html lang="en"/.test(html), '<html> still declares lang="en"');
check(/class="skip"/.test(html), 'skip-to-content link is still in the markup');

// --- portability -----------------------------------------------------------
const localRefs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((ref) => !/^(#|mailto:|tel:|https?:)/.test(ref));
check(
  localRefs.length > 0 && localRefs.every((ref) => ref.startsWith('./')),
  'every local asset reference is relative (base: "./")',
  localRefs.filter((ref) => !ref.startsWith('./')).join(', '),
);
check(!/src="\/src\//.test(html), 'no dev entrypoint (/src/...) leaked into the build');
check(!/127\.0\.0\.1|localhost/.test(html), 'no dev-server URL leaked into the build');

// --- chunking / fonts / sourcemaps -----------------------------------------
const files = await walk(dist);
const names = files.map((file) => file.split(/[\\/]/).pop());
const jsAssets = names.filter((name) => name.endsWith('.js'));
const cssAssets = names.filter((name) => name.endsWith('.css'));
const fonts = names.filter((name) => name.endsWith('.woff2'));

check(names.some((name) => /^three-.*\.js$/.test(name)), 'three.js is split into its own chunk');
check(jsAssets.length >= 2, 'at least an app chunk and a three chunk exist', `found ${jsAssets.length}`);
check(cssAssets.length >= 1, 'a stylesheet is emitted');
check(fonts.length >= 4, 'fonts are self-hosted as woff2', `found ${fonts.length}`);
check(!names.some((name) => name.endsWith('.map')), 'no sourcemaps emitted (sourcemap: false)');
check(
  !html.includes('fonts.googleapis.com') && !html.includes('fonts.gstatic.com'),
  'no Google Fonts CDN reference',
);

// --- the mobile contract, as it survives minification ----------------------
const css = (await Promise.all(cssAssets.map((name) => tryRead(join(assets, name))))).join('\n');
const flat = css.replace(/\s+/g, '');
check(flat.includes('--tap-min:44px'), 'tap-target token survives minification (--tap-min)');
check(flat.includes('env(safe-area-inset-top'), 'top safe-area inset is applied');
check(flat.includes('env(safe-area-inset-bottom'), 'bottom safe-area inset is applied');
check(flat.includes('(hover:hover)'), 'hover styles are behind @media (hover: hover)');
check(flat.includes('(pointer:coarse)'), 'coarse-pointer query survives');
check(flat.includes('overscroll-behavior:contain'), 'menu panel keeps overscroll contained');
check(flat.includes('touch-action:manipulation'), 'touch-action: manipulation survives');
check(flat.includes('align-content:safe'), 'menu panel uses safe centring for short viewports');
check(flat.includes('.chapter__tag{display:none'), 'decorative chapter tag is still hidden on narrow screens');

// --- weight report (informational, never a gate) ---------------------------
let total = 0;
for (const file of files) {
  const { size } = await stat(file);
  total += size;
  if (file.endsWith('.js')) {
    const gz = gzipSync(await readFile(file)).length;
    info.push(`${relative(dist, file)}  ${(size / 1024).toFixed(2)} kB (gzip ${(gz / 1024).toFixed(2)} kB)`);
  }
}
info.push(`shipped total ${(total / 1024 / 1024).toFixed(2)} MB across ${files.length} files`);

// --- report ----------------------------------------------------------------
const line = '─'.repeat(64);
console.log(`\n${line}\n  verify-build — ${relative(root, dist)}/\n${line}`);
for (const label of pass) console.log(`  ✓ ${label}`);
for (const entry of info) console.log(`  · ${entry}`);
if (failures.length > 0) {
  console.log('');
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error(`\n✗ ${failures.length} build contract(s) broken.\n`);
  process.exit(1);
}
console.log(`\n✓ all ${pass.length} build contracts hold.\n`);

