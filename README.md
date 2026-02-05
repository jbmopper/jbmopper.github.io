# jbmopper.github.io

Portfolio site: Astro, Svelte mushroom chatbot, Marimo WASM notebooks, GitHub Pages.

## Stack

- **Site**: Astro (static), `@astrojs/svelte`, View Transitions via `ClientRouter`
- **Chatbot**: Svelte component in root layout with `client:load` and `transition:persist="chatbot"`; session ID and (future) chat history in `sessionStorage`
- **Backend** (not wired yet): Lambda + API Gateway + Cloudflare Turnstile + LLM (e.g. Gemini)
- **Marimo**: Source notebooks in `content/notebooks/`; export to WASM HTML into `public/notebooks/` and link from project pages

## Setup

```bash
npm install
npm run dev
```

## Env (optional)

Copy `.env.example` to `.env` and set `PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` when you add Turnstile. Backend API base can go in `PUBLIC_API_BASE` when you have it.

## Adding projects

Projects are listed on the [Projects](/projects) page and each has a detail page at `/projects/<slug>`.

1. **Add an entry** in `src/data/projects.ts` in the `projects` array. Each project needs:
   - `slug` – URL segment (e.g. `"my-analysis"` → `/projects/my-analysis`)
   - `title` – display name
   - `description` – short blurb (shown on the projects list)
   - `body` (optional) – HTML writeup on the project detail page
   - `notebook` (optional) – path under `/notebooks/` for a Marimo WASM export (e.g. `"my-notebook/index.html"`)

2. **Optional: attach a Marimo notebook**  
   Export the notebook to its **own subdirectory** under `public/notebooks/` (so each export has its own `index.html` and they don’t overwrite each other):
   ```bash
   marimo export html-wasm content/notebooks/<name>.py -o public/notebooks/<name> --mode run
   ```
   Then set `notebook: "<name>/index.html"` for that project in `src/data/projects.ts`. The project page will show an “Open interactive notebook” link and an iframe embedding the notebook.

## Marimo notebooks

- Put source `.py` marimo notebooks in `content/notebooks/`.
- Export to WASM into **one subdirectory per notebook**: `marimo export html-wasm content/notebooks/<name>.py -o public/notebooks/<name> --mode run` (or `--mode edit`). Using the same `-o` dir for multiple notebooks overwrites `index.html`.
- A CI step can run this for all notebooks; for now run locally and commit the outputs under `public/notebooks/`.
- Link from project pages by setting `notebook: "<name>/index.html"` in `src/data/projects.ts`.

## Deploy

Push to `main`; GitHub Actions builds and deploys to GitHub Pages. Repo is `jbmopper.github.io` so the site is at the root URL. `.nojekyll` is in `public/` so Jekyll does not process the site.

## Plan

See the associated plan (e.g. in `.cursor/plans/`) for full architecture: Lambda health/chat/resume, Turnstile validation, session handling, and PDF/resume options (e.g. Lambda + Docker + headless Chromium).
