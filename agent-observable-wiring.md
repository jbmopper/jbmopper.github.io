# Observable → Astro bridge runbook

## Purpose
Keep Astro as the landing shell and publish Observable as static pages under `/observable/**` with no hybrid wrapping.

## Architecture lock
- `ns_obv` owns all notebook content and rendering.
- `jbmopper.github.io` owns `/` and non-`/observable/**` pages.
- `/observable/**` is generated output only.
- Do not create or restore Astro routes that wrap Observable notebook pages.
- Do not inject Astro header/footer/CSS/JS into exported Observable HTML.

## Canonical URL
- Main notebook landing: `/observable/llm-fundamentals/`

## Standard flow
1. Build Observable source:
   - `cd /Users/juliusmopper/Dev/ns_obv`
   - `npm run build`

2. Export to Astro public assets:
   - `npm run export:astro`
   - This performs a copy-only sync from `ns_obv/dist` to `jbmopper.github.io/public/observable`.

3. Validate Astro-side artifacts:
   - `cd /Users/juliusmopper/Dev/jbmopper.github.io`
   - `npm run verify:observable`

4. Validate full site:
   - `npm run build`
   - `npm run test:e2e`

## Required behavior
- Home project card links directly to `/observable/llm-fundamentals/`.
- Notebook page exposes visible `Back to Home` link.
- Back link returns to `/` on the same origin.
- No broken notebook section links from `/observable/llm-fundamentals/`.

## Common failures
- `verify:observable` fails:
  - Export step not run or `public/observable` incomplete. Re-run build + export in `ns_obv`.

- Notebook links broken:
  - Fix source links in `ns_obv/src/llm-fundamentals/index.md` and rebuild/export.

- Styling drift:
  - Adjust Observable theme in `ns_obv` (`observablehq.config.js` + `src/astro-bridge-theme.css`), then rebuild/export.

## Definition of done
- `ns_obv`: `npm run build`, `npm run test:unit`, `npm run test:e2e`, `npm run export:astro` pass.
- `jbmopper.github.io`: `npm run verify:observable`, `npm run build`, `npm run test:e2e` pass.
