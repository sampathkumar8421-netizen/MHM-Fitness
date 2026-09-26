# Mobile compatibility pass — 2026-09-26

The engineering record of the pass that made this page usable on a phone. Numbers below
were produced by `tools/harness` against a local `npm run preview`, not estimated.

## What “mobile compatible” was measured as

Four instruments, because none of them can see the whole problem:

| Instrument | Sees | Blind to |
| --- | --- | --- |
| Pixels (`harness:shot`) | collisions, clipping, fold composition | behaviour over time, `inert`, focus |
| Geometry (`harness:probe`, `harness:audit`) | exact boxes, text-ink edges, unclipped overflow | pairs it was not told to compare; hidden-element false positives |
| Behaviour (`harness:mobile`) | scroll lock, focus containment, menu modality, resize | visual judgement |
| Device context (emulation) | touch, DPR 3, orientation, `visualViewport` | real GPU, real notches, real Safari |

Each defect below was invisible to at least one of these. That is the reason all four are
kept.

## Measured result — 390×844, DPR 3, touch emulation

| Metric | Before | After |
| --- | --- | --- |
| `tagFactsOverlap` (chapter tag × hero facts) | **2128 px²** | 0 |
| Tap targets under 44 px / under 24 px | **15 of 17** / **12** | 0 / 0 |
| Text below 12 px | 11.59 px labels throughout | none |
| Menu scroll-locked while open | **false** (0 → 600) | true (0 → 0) |
| Scroll restored on close | **left at 600** | returns to 0 |
| Background `inert` / focusables behind panel | **false** / **15** | true / 0 |
| Menu CTA, toggle, brand, skip-link height | 40, 38, 25, 40 px | 44 px each |
| First menu link at 320 px | **y = −31** (unreachable) | y = 126 |
| `cueFactsOverlap` ≥ 1100 px (`SCROLL` × facts) | **3762 px²** | 0 |
| Sideways overflow at 320/390/430/960/1100/1600 | 0 | 0 |

## The defects and their root causes

1. **Hero facts printed through the chapter tag.** `.chapter__tag` is absolutely
   positioned at the shell's bottom edge, which is the same line the third hero fact
   occupies once the hero is taller than the phone viewport. The geometry audit compared
   `.facts__item` siblings only and reported clean, so a sibling-only diagnostic cannot
   see this class of bug. Fixed by hiding the decorative tag below 64 rem, where the rail
   it mirrors is hidden anyway.
2. **The mobile menu was not really modal.** `body { overflow: hidden }` does not stop the
   document scrolling in Chrome and is ignored outright by iOS Safari, and nothing removed
   the page from the tab order or the accessibility tree. Fixed with
   `position: fixed; top: -scrollY` plus restore on close, `inert` on `main`, `.foot` and
   the skip link, a Tab trap, Escape to close, focus returned to the toggle, and
   auto-close when the viewport crosses into the desktop layout.
3. **Touch targets far below 44 px** (footer links 18–19 px tall). Fixed with a
   `--tap-min: 44px` token on every control for coarse pointers; the visit actions go
   full-width below 64 rem.
4. **Safe centring hid the top of the menu on short viewports.** `align-content: center`
   on an overflowing grid distributes overflow to both sides; `scrollTop` cannot go
   negative, so the first chapters were unreachable at 320×568. Fixed with
   `align-content: safe center`. The 390 px run did not catch this — only the 320 px run.
5. **Quality was computed once, at boot.** `quality.narrow`, `dpr` and segment counts were
   captured at module init, so rotating a phone kept portrait framing and shrinking a
   desktop window kept DPR 2 with 1024² shadows. `refreshQuality()` now re-derives
   everything on resize, and the breakpoint reads
   `document.documentElement.clientWidth`, because headless Chrome reports
   `innerWidth = clientWidth + 21` even with `--hide-scrollbars` and would otherwise shift
   the 860 px threshold. `scrollRig.js` also reads live `visualViewport.height` for act
   progress.
6. **The desktop hero cue collided with the facts row** (3762 px² at ≥ 1100 px, pre-existing
   and unrelated to phones). The cue is retired above 64 rem rather than relocated: the
   hero is already ~1052 px tall for a 1000 px viewport, so moving it lower would make it a
   useless affordance, and the rail carries progress at those widths.
7. **No safe-area contract.** Added `viewport-fit=cover`, `--safe-*` inset tokens and inset
   padding on the topbar, menu panel and skip link.
8. **Sticky hover and tap-highlight artefacts.** Every `:hover` rule moved behind
   `@media (hover: hover)`; `touch-action: manipulation` and no tap-highlight flash on
   controls; `overscroll-behavior-x: none`.
9. **Smallest type was 11.59 px** and the full-viewport grain blend ran on phone GPUs. The
   `--step--1` floor is now 12 px, and grain is skipped on coarse pointers.

## Harness defects found while doing this

Worth recording, because a lying instrument is worse than a missing one:

- **Probe did not pass `--hide-scrollbars`** while shot and audit did, so `innerWidth`
  disagreed with the layout for the same page.
- **`audit` reported `captionVsRail.into: 229` on phones** even though the rail is
  `display: none` (a zero rect looks like a perfect collision). Rail-dependent fields are
  now `null` when `railDisplay` is `none`.
- **`shot` reported 16 overflow causes that cannot be panned to** (clipped ticker spans)
  and bisected every block when there was no overflow at all. It now excludes fixed and
  clipped descendants and only bisects on real overflow.
- **There was no phone instrument at all**, hence `tools/harness/mhm-mobile.mjs`.

## Reproducing

```powershell
npm run build
npm run verify:build
npm run preview                # then, in another shell:
npm run verify:mobile          # the gate: fails on any broken condition below
```

`mhm-mobile.mjs` reports rather than fails (it exits 0 even when it finds a 20 px tap
target), so `tools/ci/verify-mobile.mjs` runs it over three phone configurations and
turns the conditions below into a pass/fail gate. Nested paths are the harness's own JSON:

```
tapTargets.counts.under44  0        tapTargets.counts.under24  0
smallText                  []       pairOverlap                []
hero.tagFactsOverlap       0        hero.cueFactsOverlap       0
sideways.count             0        canvas.w ≥ viewport.layoutW
canvas.w == viewport.innerW (fixed layers size against the ICB, not clientWidth)
MENU OPEN:   scrollLocked true, mainInert/footInert true, outsideFocusables 0,
             outsideInert > 0, ctaBox.h ≥ 44, toggleBox.h ≥ 44, firstLinkBox.y ≥ 0
MENU CLOSED: scrollY 0
ROTATION:    layoutW re-derived, canvas bufferRatioW ≤ 1.6, rail still hidden
```

To look at the raw numbers instead of the verdict:

```powershell
npm run harness:mobile -- http://127.0.0.1:4173/ 390 844 true 0,0.5,1 3
npm run harness:mobile -- http://127.0.0.1:4173/ 320 568 true 0,1 2
npm run harness:mobile -- http://127.0.0.1:4173/ 390 844 true 0 3 844x390   # resize path
npm run harness:probe  -- http://127.0.0.1:4173/ 320 568 true
```

The 8th argument (`844x390`) re-emulates the viewport mid-session, which is the only way
to prove the resize path re-derives `quality.narrow`, the DPR and the camera framing
instead of freezing at boot.

## Still open

- **No physical-device verification.** Safe-area insets are only non-zero on notched
  hardware, Safari's `visualViewport` differs from Chromium during URL-bar animation, and
  no frame-rate or thermal profiling has been done. Emulation is evidence, not proof.
- **`webglcontextrestored` is not handled** — `main.js` catches `webglcontextlost` and
  serves the poster, but there is no re-init, so a recovered GPU stays on the poster until
  reload.
- **`prefers-reduced-motion` is read at boot**, so an OS change needs a reload.
- **960–1023 px (landscape tablet)** shows no overlap in the probe but has had no visual
  pass: the rail is present, the stage uses narrow framing and the coach grid is a single
  column there.
- **Deferred code health**: duplicated `clamp01` (`scrollRig.js`, `scrub.js`) and unused
  `bump()` / `createMorphTube()` in `geometry.js`.

