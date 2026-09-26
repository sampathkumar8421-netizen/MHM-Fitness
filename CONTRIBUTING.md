# Contributing

Single-maintainer project, but the rules are the ones that keep the site measurable.

## Setup

```bash
npm ci
npm run dev
```

Node ≥ 20.19 (`.nvmrc` pins 24). There is no linter or formatter task: match the file
you are editing, and let `.editorconfig` handle whitespace.

## Before you push

```bash
npm run build
npm run verify:build
```

If you touched CSS, layout, the scroll rig, 3D quality or `nav.js`, also run the
measurement tools and paste the result into the pull request:

```bash
npm run preview                                              # in one terminal
npm run harness:mobile -- http://127.0.0.1:4173/ 390 844 true 0,0.5,1 3
npm run harness:probe  -- http://127.0.0.1:4173/ 320 568 true
```

Pass conditions, and the false positives to watch for, are in
[`tools/harness/README.md`](tools/harness/README.md). Treat `sideways.count === 0`,
`under44: 0`, `smallText: []` and `scrollLocked: true` as gates, not as suggestions —
each one was a real shipped defect once (see
[`docs/mobile-compatibility.md`](docs/mobile-compatibility.md)).

## Conventions that actually bite

- **CSS `@layer` order beats specificity and media queries.** A narrow-viewport
  override must live in the same layer as the declaration it overrides. This has
  already caused one silent bug; the comment in `components.css` explains it.
- **Never measure with `window.innerWidth`** for layout decisions. Headless Chrome
  reports `innerWidth = clientWidth + 21` even with `--hide-scrollbars`; use
  `document.documentElement.clientWidth`.
- **Hover styles go inside `@media (hover: hover)`.** Anything outside it sticks after a
  tap on a phone.
- **`--rail-safe` is viewport-dependent** (112 px at 1600, 220 px at 1100). Anything that
  must clear the fixed rail uses it rather than a magic number.
- **No new runtime dependencies** without a clear reason. This page ships one
  (`three`); fonts are self-hosted through `@fontsource`.
- **Two clocks only**: global `p` and per-chapter `act` progress. New UI should read one
  of those rather than adding its own scroll listener.

## Commits and pull requests

Commit messages are imperative and scoped, e.g. `fix(nav): restore scroll after closing
the menu`. Use the pull request template and say what you measured — "looks fine" is not
a result.

## Known debt

`PONYTAIL-AUDIT.md` and the "Known limitations" section of the README list the deferred
items: a duplicated `clamp01` (`scrollRig.js`, `scrub.js` versus the shared `clamp` in
`geometry.js`) and unused exports `bump()` / `createMorphTube()` in `geometry.js`.
Removing them is welcome as its own small pull request.

## Reporting bugs and security issues

Use the issue forms for bugs and features. For anything security-related, follow
[`SECURITY.md`](SECURITY.md) instead of opening a public issue.
