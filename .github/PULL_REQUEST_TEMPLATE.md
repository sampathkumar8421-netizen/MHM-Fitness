<!--
Keep this short. Delete any section that genuinely does not apply, and say why.
-->

## What changed

<!-- One or two sentences. Link the issue if there is one: Closes #12 -->

## Why

<!-- The user-visible reason. "It was on the list" is not a reason. -->

## How it was checked

- [ ] `npm run build` passes
- [ ] `npm run verify:build` passes (checks the mobile/viewport contract in `dist/`)
- [ ] `npm run verify:mobile` passes — 390×844, 320×568 and a rotation to 844×390
      <!-- required for any change to CSS, layout, scroll, 3D quality or nav -->
- [ ] `npm run harness:probe -- http://127.0.0.1:4173/ 320 568 true` reports `sideways.count === 0`
      <!-- required for anything that can widen or reposition content -->
- [ ] I looked at the result, not only at the numbers
      <!-- screenshots in tools/harness/screens/, or the browser -->

## Risk / rollback

<!-- What is the worst case if this is wrong, and how do we undo it? -->

## Notes for the reviewer

<!-- Anything surprising, deferred, or deliberately left out. -->
