# MHM Fitness — “Strength, measured.”

A single-page site for a strength studio: an editorial DOM shell with a scroll-driven
WebGL film behind it. The document scrolls; the camera and the equipment answer it.

No framework, no UI library, no runtime dependency beyond Three.js.

[![CI](https://github.com/sampathkumar8421-netizen/MHM-Fitness/actions/workflows/ci.yml/badge.svg)](https://github.com/sampathkumar8421-netizen/MHM-Fitness/actions/workflows/ci.yml)

---

## Quick start

```bash
git clone https://github.com/sampathkumar8421-netizen/MHM-Fitness.git
cd MHM-Fitness
npm ci
npm run dev          # http://127.0.0.1:5173
```

Production check:

```bash
npm run build        # -> dist/
npm run verify:build # asserts the shipped bundle still honours the contracts below
npm run preview      # serves dist/ on http://127.0.0.1:4173
```

Node **≥ 20.19** (Vite 8 requires `^20.19.0 || >=22.12.0`). `.nvmrc` pins 24, which is
what the repository is developed and built on.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server, port 5173 |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serves `dist/` on port 4173 (what the measurement tools expect) |
| `npm run verify:build` | Post-build assertions on `dist/` — viewport meta, relative asset base, three chunk, the mobile tokens |
| `npm run verify:mobile` | Runs `harness:mobile` over 390×844, 320×568 and a rotation, and **fails** if any pass condition breaks (needs `preview` running) |
| `npm run harness:probe` | Geometry: boxes, true text-ink edges, rail clearance, unclipped sideways overflow |
| `npm run harness:shot` | Screenshots at chosen scroll positions + overflow bisect |
| `npm run harness:audit` | Rail stability and topbar tone switching across scroll fractions |
| `npm run harness:mobile` | Phone audit: tap targets, sub-12px text, hero collisions, canvas DPR, menu modality |
| `npm run graph` / `graph:report` / `graph:update` | Knowledge-graph extraction (graphify) into `graphify-out/` |

The measurement tools are plain Node ESM speaking the Chrome DevTools Protocol to a
local Chrome — nothing is added to the shipped bundle. Read
[`tools/harness/README.md`](tools/harness/README.md) before trusting a number from them;
it documents the false positives each one can produce.

## Layout of the repository

```
index.html                 the whole document: 10 chapters, semantic, no template layer
src/
  main.js                  the only place that owns time: boots rig, stage, acts, UI
  scroll/scrollRig.js      scroll -> damped global + per-chapter progress (two clocks)
  three/
    stage.js               renderer, camera, lights, floor, quality derivation
    acts.js                the four chapters of the 3D film, blended by act weight
    geometry.js            object vocabulary: plate, bar, collar, stack, ring, cable
    materials.js           one material family: steel, graphite, one signal accent
  ui/
    nav.js                 topbar state, modal mobile menu, current-chapter marker
    reveal.js              [data-reveal] via CSS scroll-driven animations, IO fallback
    counters.js            the three Standard numbers, counted once
    scrub.js               rail fill, type strip, tone switching for fixed furniture
    magnetic.js            a few px of pointer pull on primary buttons (fine pointers only)
  styles/
    layers.css             the cascade order, declared once: reset, tokens, base,
                           layout, components, sections, utilities
    tokens.css             colour, type scale, spacing, motion, safe-area insets
    base.css               reset, page bed, focus, skip link, reduced motion
    layout.css             shell, topbar, rail, chapter rhythm
    components.css         buttons, pills, cards, menu panel, grain
    sections.css           per-chapter composition
public/favicon.svg
tools/harness/             the four CDP measurement tools + their README
tools/ci/verify-build.mjs  the post-build contract check used by CI
docs/                      engineering notes (mobile compatibility pass, etc.)
```

The document runs hero → standard → progression → method → programs → coaches →
membership → reviews → timings → visit, each marked `data-section="n"`; three of them
(`hero`, `progression`, `method`, `visit`) also carry `data-act` naming the 3D chapter
they drive.

## How the page works

**One owning clock.** `src/main.js` creates the scroll rig, then the stage, then the
acts, then the UI. The rig publishes a damped global progress `p` (τ = 0.09) and a
per-chapter progress per act. Chapter-local progress is what the 3D reads, so a short
hero and a tall stage chapter feel equally paced. Under `prefers-reduced-motion` τ
collapses to ~0 and the stage shows one still frame per chapter — information, not
animation.

**Quality is derived, not fixed.** `stage.js` computes `narrow`, `dpr` and segment
counts from **`document.documentElement.clientWidth`** — not `innerWidth`, which
includes the classic scrollbar and would move the 860 px breakpoint — and re-derives
them on every resize, including `orientationchange` and `visualViewport.resize`.
Shadows drop to 512² and the object set re-lays-out in the narrow camera poses below
that breakpoint.

**The shell owns its own layering.** CSS `@layer` order (declared in `layers.css`)
beats specificity *and* media queries, so a `display: none` written in a lower layer
never applies however narrow the viewport is. Narrow-viewport overrides therefore live
beside the declarations they override — see the comment in `components.css`.

**Nothing decorative is load-bearing.** Without JS, chapters get a flat ink bed. If
WebGL is unavailable (or the context is lost) the root switches to `.no-webgl` and the
poster plate is served instead; the copy, the navigation and the booking action are
always DOM.

## Mobile and accessibility contract

These are the invariants the build check and the harness enforce. Break one and the
phone experience regresses silently — every item below exists because it was once broken.

- `viewport-fit=cover` plus `--safe-top/right/bottom/left` insets, so the topbar, skip
  link and menu panel clear notches and home indicators.
- Every interactive control is ≥ 44 px on `(pointer: coarse)`; the smallest type is 12 px.
- The mobile menu is modal in *behaviour*: the page behind it is scroll-locked
  (`position: fixed` + scroll restore, because iOS ignores `overflow: hidden`), `inert`
  for assistive tech, Tab-trapped, Escape-closable, and focus returns to the toggle.
- `:hover` rules live behind `@media (hover: hover)` so nothing stays stuck after a tap.
- `overscroll-behavior-x: none`, `touch-action: manipulation`, no tap-highlight flash.
- Full-viewport grain is skipped on coarse pointers; shadows and geometry step down on
  narrow screens.
- Reduced motion still gets every chapter, as a still frame.

## Deploying

`dist/` is a plain static bundle and `vite.config.js` sets `base: './'`, so it can be
served from a domain root or any sub-path. There are no environment variables and no
runtime secrets.

`.github/workflows/pages.yml` publishes `dist/` to GitHub Pages. It is **gated**: the
deploy job runs only if Pages is already enabled for the repository (Settings → Pages →
Source: **GitHub Actions**). Until you enable it, every push stays green and the deploy
job is simply skipped — no red X on a repo that has not been configured yet.

## Known limitations

Stated rather than discovered later:

- **The measurement harness is Windows-only.** Each tool hardcodes
  `C:\Program Files\Google\Chrome\Application\chrome.exe` and uses `%TEMP%` for its
  throwaway profile. It runs locally and on the `mobile-qa` workflow (windows-latest);
  it is deliberately not part of the Linux CI job.
- **Not yet verified on physical hardware.** Safe-area insets are only non-zero on
  notched devices, Safari's `visualViewport` behaves differently from Chromium during
  URL-bar animation, and no frame-rate or thermal profiling has been done. Emulation is
  evidence, not proof.
- **A lost WebGL context is not re-initialised.** `main.js` catches `webglcontextlost`
  and falls back to the poster; there is no `webglcontextrestored` re-init yet, so a
  recovered GPU stays on the poster until reload.
- **`prefers-reduced-motion` is read once at boot**, so changing the OS setting mid-visit
  applies on the next load.
- **graphify does not index CSS** (`.css` is not a recognised source extension), and it
  skips `src/styles/tokens.css` as "potentially sensitive" because the credential
  heuristic matches the word `tokens`.
- **Deferred code-health items** (see `PONYTAIL-AUDIT.md`): `clamp01` is duplicated in
  `src/scroll/scrollRig.js` and `src/ui/scrub.js` instead of using the shared `clamp`
  from `geometry.js`, and `bump()` / `createMorphTube()` in `geometry.js` are unused
  exports. Both are intentional, small, separate follow-ups.
- **`--rail-safe` uses `100vw`**, so on desktop with a classic scrollbar it over-reserves
  by the scrollbar width. It clears the rail with ~99 px to spare, so the excess is
  harmless; mobile uses overlay scrollbars and is unaffected.

## License

MIT — see [`LICENSE`](LICENSE).

> If this is a commercial client site and you would rather keep all rights reserved,
> delete `LICENSE` and set `"license": "UNLICENSED"` in `package.json`. That is a
> one-commit change; the code is unaffected.

## Credits

- Typefaces: Instrument Serif, Instrument Sans, JetBrains Mono — self-hosted via
  [`@fontsource`](https://fontsource.org/) (SIL Open Font License).
- 3D: [Three.js](https://threejs.org/) (MIT).
- Measurement tools: hand-written Node ESM over the Chrome DevTools Protocol, no
  dependencies.

