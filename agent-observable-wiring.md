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
- Main notebook landing: `/observable/projects/llm-fundamentals/`

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
- Home project card links directly to `/observable/projects/llm-fundamentals/`.
- Notebook header exposes visible project navigation links.
- `Projects` navigation returns to `/observable/projects/` on the same origin.
- No broken notebook section links from `/observable/projects/llm-fundamentals/`.

## Inline notebook widgets
- Inline Svelte widgets may be mounted into exported notebook content, but only through explicit mount markers in the generated HTML.
- Preferred marker contract from `ns_obv`:
  - add a plain HTML container with class `jm-inference-mount`
  - configure instance props with `data-inference-*` attributes
  - example:

```html
<div
  class="jm-inference-mount"
  data-inference-title="TinyStories Demo"
  data-inference-description="Run the notebook's current ONNX checkpoint inline."
  data-inference-warmup-path="/v1/inferwarmup"
  data-inference-locked-model="tinystories-base"
  data-inference-prompt-placeholder="Prompt the writeup model..."
></div>
```

- Supported `data-inference-*` attributes:
  - `eyebrow`
  - `title`
  - `description`
  - `verification-title`
  - `verification-message`
  - `prompt-label`
  - `prompt-placeholder`
  - `submit-label`
  - `reset-label`
  - `warmup-path`
  - `initial-model`
  - `locked-model`
  - `prompt-rows`
  - `models` (JSON array string)
- Astro-side postprocess injects `/observable/_import/inference-standalone.js` only on pages containing `jm-inference-mount`.
- Keep widget placement in `ns_obv` so the notebook source controls where inline inference appears within writeup content.

## Common failures
- `verify:observable` fails:
  - Export step not run or `public/observable` incomplete. Re-run build + export in `ns_obv`.

- Notebook links broken:
  - Fix source links in `ns_obv/src/projects/llm-fundamentals/index.md` and rebuild/export.

- Styling drift:
  - Adjust Observable theme in `ns_obv` (`observablehq.config.js` + `src/astro-bridge-theme.css`), then rebuild/export.

## Definition of done
- `ns_obv`: `npm run build`, `npm run test:unit`, `npm run test:e2e`, `npm run export:astro` pass.
- `jbmopper.github.io`: `npm run verify:observable`, `npm run build`, `npm run test:e2e` pass.
