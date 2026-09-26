# MHM Fitness harness

Measurement tools for this landing page. They drive a headless Chrome over the
Chrome DevTools Protocol (CDP) and print **numbers** — rects, text-ink edges,
computed colours, the active tone — so layout regressions are caught by
measurement instead of by eyeballing screenshots.

Everything here is plain Node ESM with no dependencies: `node:child_process`,
`node:fs/promises`, a raw WebSocket, and a local Chrome. Nothing is added to the
shipped bundle.

## Prerequisites

- **Chrome** at `C:\Program Files\Google\Chrome\Application\chrome.exe`
  (each script has a `CHROME` constant at the top if yours lives elsewhere).
- The page served somewhere the browser can reach:
  `npm run preview` (built output, port 4173) or `npm run dev`.
- The URL is the first argument; it defaults to `http://127.0.0.1:4173/`.

## The four tools

| Script | npm | What it answers |
| --- | --- | --- |
| `mhm-probe.mjs` | `npm run harness:probe` | Geometry: shell/rail/track boxes, true text-ink edges, coach grid columns, unclipped sideways overflow with named culprits |
| `mhm-shot.mjs` | `npm run harness:shot` | PNGs at chosen scroll positions, plus an overflow report and a per-block overflow bisect; can open the mobile menu panel |
| `mhm-audit.mjs` | `npm run harness:audit` | Rail stability, topbar/rail tone switching, caption-vs-rail clearance, at a list of scroll fractions |
| `mhm-mobile.mjs` | `npm run harness:mobile` | Phone-specific: tap-target sizes, sub-12px text, heading overflow, hero facts vs chapter tag overlap, canvas device-pixel-ratio, menu scroll-lock/inert/focus containment |

Usage (arguments are positional):

```
node tools/harness/mhm-probe.mjs   <url> <width> <height> [mobile:false]
node tools/harness/mhm-shot.mjs    <url> <width> <height> <scrolls csv> [menu:false] [prefix]
node tools/harness/mhm-audit.mjs   <url> <width> <height> <scrolls csv> [mobile:false]
node tools/harness/mhm-mobile.mjs  <url> <width> <height> [mobile:true] [scrolls csv] [dpr:3]
```

Examples:

```
npm run harness:probe  -- http://127.0.0.1:4173/ 1100 800
npm run harness:shot   -- http://127.0.0.1:4173/ 390 844 0,0.53,0.97 true mobile
npm run harness:audit  -- http://127.0.0.1:4173/ 1600 1000 0.42,0.53,0.64,0.72,0.97
npm run harness:mobile -- http://127.0.0.1:4173/ 390 844 true 0,0.5,1 3
```

Screenshots are written to `tools/harness/screens/` (override with the
`MHM_SHOTS` environment variable). That folder is deliberately ignored by
both graphify and the build.

## Reading the output

The probe's `sideways` block is the mobile-overflow verdict. It lists only
elements whose box crosses the layout edge **that are not inside a clipping
ancestor and are not `position: fixed`**, because both of those stretch to the
document's overflow and would otherwise be reported as false culprits. Treat
`sideways.count === 0` as the pass condition.

`document.scrollWidth` being larger than `clientWidth` is **not** by itself a
defect here: `body { overflow-x: clip }` in `src/styles/base.css` propagates to
the viewport, so any such strip is unreachable — it cannot be panned to even
programmatically. Judge by `sideways.count`, not by `scrollWidth`.

For rail clearance, compare an element's ink edge against the track's `x`: coach
bios, the programs grid, visit details and `.stage-caption` must all end left of
it. `captionVsRail.into` negative means clear.

## Gotchas that cost real debugging time

- **Give every harness a unique debug port and `--user-data-dir`.** Both are
  derived from `process.pid` on purpose. Two scripts sharing a port attach to one
  browser, and the later `Emulation.setDeviceMetricsOverride` then silently
  rewrites the other run's viewport mid-audit — an audit can report `vw:1100` for
  rows it believes are 390px wide. Run audit-style scripts sequentially, not in
  parallel.
- **Don't trust the overflow bisect under `mobile: true`.** Chrome's mobile
  emulation expands the initial containing block, so hiding one block at a time
  reports nothing even when a real culprit exists.
- **CSS `@layer` order beats specificity _and_ media queries.** A `display:none`
  written in a lower layer than the rule declaring the element's `display` never
  applies, however narrow the viewport is. The narrow-viewport switches for
  `.rail`, `.topbar__cta` and `.nav__cta` therefore live in the `components`
  layer (`src/styles/components.css`), beside the declarations they override —
  not in `layout.css`. The comment there records why.
- **`--rail-safe` is viewport-dependent.** It is a `max()` of the gutter and the
  band the fixed rail steals from the centred shell, so it grows as the viewport
  narrows (112px at 1600, 220px at 1100). Any element that must clear the rail
  uses it; the shell reserves it as right padding from `min-width: 60rem`.
- **The coach role column takes a length, not a flexible track, in the squeezed
  band** (`>=64rem` and `<=76.99rem`). With a `1fr` there, reserving the rail's
  band collapsed the column to as little as 0px and long mono words such as
  `conditioning` escaped into the bio column.

## Knowledge graph

`graphify` (v0.9.67, installed with `uv tool install graphifyy`) builds a
queryable graph of this repo:

```
npm run graph          # local AST extraction, no LLM, no API key
npm run graph:report   # cluster + regenerate GRAPH_REPORT.md and graph.html
npm run graph:update   # re-extract only changed files
```

Output lands in `graphify-out/`: `graph.json`, `GRAPH_REPORT.md`, and
`graph.html`, an interactive graph to open in a browser. Query with
`graphify explain "createStage()"` or `graphify path "A" "B"`.

Two limitations, both verified rather than assumed:

- **CSS is not indexed.** `.css` is neither a supported code extension nor a doc
  extension, so `tokens.css`, `base.css`, `components.css`, `layers.css`,
  `layout.css` and `sections.css` are all skipped. The graph covers the
  JavaScript (this harness included) and, with a semantic backend, the docs.
- **`src/styles/tokens.css` is flagged "potentially sensitive"** and skipped.
  The credential heuristic matches the bare word `tokens`, and because CSS is not
  recognised as source, the exemption that spares e.g. `service_account.py` does
  not apply. Harmless while CSS is unindexed; if CSS support arrives, this file
  needs a rename or an allowlist entry.

An LLM pass is only needed for docs, papers and images. On this machine the
options are limited by what is actually authenticated:

- **`--backend claude-cli` will not work as-is** — the Claude CLI is installed
  (`~\.local\bin\claude.exe`) but reports `Not logged in · Please run /login`.
- **`--backend ollama` works with no key.** Local models are already pulled, e.g.
  `qwen3.8:27b` (17 GB). Community naming and doc extraction are forced to
  serial calls for this backend, so budget a few minutes.

```
graphify extract . --backend ollama                       # docs + community names
graphify extract . --backend ollama --max-concurrency 1   # gentler on small GPUs
graphify extract . --backend ollama --no-cluster          # raw extraction only
```

`graphify-out/` is regenerated in place; `npm run graph:update` stays the cheap
way to keep code current between LLM passes.