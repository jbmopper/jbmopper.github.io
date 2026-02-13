# Observable → Astro wiring runbook

## Purpose
Use this runbook when wiring new Observable outputs from `ns_obv` into Astro pages in this repo.

## How to invoke this workflow
- **In Cursor:** Start a request with `@agent-observable-wiring.md` and ask to run the wiring (e.g. “@agent-observable-wiring.md Wire the new Observable embed”). Alternatively, enable the rule **Observable→Astro wiring runbook** (`.cursor/rules/observable-wiring.mdc`) for the conversation so the agent follows this runbook when you ask.

## Repo Roles
- `ns_obv` is the Observable source/build repo.
- `jbmopper.github.io` is the Astro website repo.
- `public/observable/` in this repo is generated and gitignored. Never hand-edit it.

## Standard Wiring Flow
1. Build Observable artifacts from source repo.
   - `cd /Users/juliusmopper/Dev/ns_obv`
   - `npm ci`
   - `npm run build`

2. Copy artifacts into Astro repo (local dev flow).
   - `npm run export:astro`
   - This replaces `/Users/juliusmopper/Dev/jbmopper.github.io/public/observable`.

3. Confirm artifacts exist in Astro repo.
   - `cd /Users/juliusmopper/Dev/jbmopper.github.io`
   - `npm run verify:observable`

4. Wire module mounts into Astro route.
   - Primary page: `src/pages/projects/deep-learning-fundamentals/index.astro`
   - Mount with `ObservableEmbed`:
     - `modulePath` must point to `/observable/embed/<module>.js`
     - `exportName` must match the exported render function in that module
     - `options` must match the function's supported options

5. If adding a new Astro route/page, create a new `.astro` page under `src/pages/...` and mount `ObservableEmbed` there.

6. Update e2e assertions when module UI text changes.
   - File: `tests/e2e/observable-embed.spec.ts`
   - Keep assertions aligned with real headings rendered by embeds.

7. Validate locally.
   - `npm ci`
   - `npm run test:ci`
   - Optional manual preview: `npm run preview`

## How Deploy Picks Up Changes
Deploy workflow (`.github/workflows/deploy-pages.yml`) does this on push to `main`:
1. Check out this repo.
2. Check out `jbmopper/ns_obv`.
3. Build `ns_obv`.
4. Copy `ns_obv/dist` into `public/observable`.
5. Build Astro and deploy Pages.

This is why `public/observable` can stay in `.gitignore`.

## Common Failure Modes
- `verify:observable` fails:
  - Observable assets were not copied. Re-run `ns_obv` build + export/copy.

- E2E fails on missing text like `Benchmark Analysis`:
  - The embed module changed its heading/content. Update test expectations in
    `tests/e2e/observable-embed.spec.ts`.

- Deploy workflow cannot check out `jbmopper/ns_obv`:
  - If private, provide a repo-read PAT secret and use it in checkout `token:`.

## Definition of Done
- `npm run verify:observable` passes
- `npm run test:ci` passes
- Push to `main` in `jbmopper.github.io` triggers successful `Deploy Pages`
