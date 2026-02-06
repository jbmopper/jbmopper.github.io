# jbmopper.github.io

Portfolio site: Astro, Svelte mushroom chatbot, Marimo WASM notebooks, GitHub Pages.

## Stack

- **Site**: Astro (static), `@astrojs/svelte`, View Transitions via `ClientRouter`
- **Chatbot**: Svelte component in root layout with `client:load` and `transition:persist="chatbot"`; session ID and (future) chat history in `sessionStorage`
- **Backend** (not wired yet): Lambda + API Gateway + Cloudflare Turnstile + LLM (e.g. Gemini)
- **Marimo**: Source notebooks in `content/notebooks/`; export to WASM HTML into `public/notebooks/` and link from project pages

## Setup

**Site (Node):**

```bash
npm install
npm run dev
```

**Notebooks (Python / uv):** Install [uv](https://docs.astral.sh/uv/) then from the repo root:

```bash
uv sync
```

This creates a `.venv` with marimo, polars, plotly (see `pyproject.toml`). Export notebooks with:

```bash
npm run export-notebooks
# or for one project (then copy that project's public/ into the output dir):
uv run marimo export html-wasm content/notebooks/local-tiny/index.py -o public/notebooks/local-tiny --mode run
```
**Important:** The live site (e.g. GitHub Pages) serves the **exported** files under `public/notebooks/`, not the source `.py`. After changing a notebook, run `npm run export-notebooks` and **commit the updated `public/notebooks/<name>/`** (including `index.html` and `public/` assets) so the deployed app includes your changes.

## Env (optional)

Copy `.env.example` to `.env` and set `PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` when you add Turnstile. Backend API base can go in `PUBLIC_API_BASE` when you have it.

## Adding projects

Projects are listed on the [Projects](/projects) page and each has a detail page at `/projects/<slug>`.

### Page design: narrative first, notebook link

Project pages are **Astro-owned**: the main text and structure live in `body`.

Each project can have a root notebook; the project detail page shows an "Open notebook" link to it.

1. **Add an entry** in `src/data/projects.ts` in the `projects` array. Each project has:
   - `slug` – URL segment (e.g. `"my-analysis"` → `/projects/my-analysis`)
   - `title` – display name
   - `description` – short blurb (shown on the projects list)
   - `body` (optional) – main narrative HTML on the project detail page
   - `notebooksDir` (optional) – directory name under `content/notebooks/` (and under `public/notebooks/` after export). When set, the project page shows a link to `/notebooks/<notebooksDir>/index.html`.

2. **Add the notebook** at `content/notebooks/<notebooksDir>/index.py` (and optional sibling `.py` files), then run `npm run export-notebooks` so the export and `public/` assets are written to `public/notebooks/<notebooksDir>/`.

## Marimo notebooks

- **Source:** `.py` notebooks and a per-project `public/` folder (assets like SVG) live under `content/notebooks/<project>/`. One directory per project; the root notebook is `index.py`.
- **Python env:** Use [uv](https://docs.astral.sh/uv/) and the project venv: run `uv sync` (creates `.venv` from `pyproject.toml`; marimo, polars, plotly). The Node build does not need marimo.
- Run `npm run export-notebooks` to export each project to `public/notebooks/<project>/` and copy each project’s `public/` assets into the output so the WASM notebook can load them over HTTP. CI runs this on push.
- Wire a project to the site by setting `notebooksDir` in `src/data/projects.ts` so the project page shows an "Open notebook" link.

### Including data files (e.g. SVG) in WASM exports

Put assets in a **`public/`** folder next to the notebook (e.g. `content/notebooks/local-tiny/public/cs336_forward.svg`). The export script and CI copy that folder into `public/notebooks/<project>/public/` so the WASM notebook can load files over HTTP. In the browser, `mo.notebook_location()` returns a **URL**, not a filesystem path, so **`open(path)` fails**. Each notebook defines a small self-contained helper that works both locally (path) and in WASM (HTTP):

- **`get_public_resource(mo, filename)`** – returns **bytes** (for Parquet, images, or any binary).
- **`read_public_file(mo, filename)`** – returns **str** (e.g. for SVG or text).

Define these in an early cell (using `mo.notebook_location()` and `pathlib.Path` locally, `urllib.request.urlopen` in WASM). Then use e.g. `read_public_file(mo, "cs336_forward.svg")` in your cells. The notebook is self-contained; there is no injection step and no separate helper package.

## Deploy

Push to `main`; GitHub Actions builds and deploys to GitHub Pages. Repo is `jbmopper.github.io` so the site is at the root URL. `.nojekyll` is in `public/` so Jekyll does not process the site.

**You can use either local export or CI** for the notebooks: the workflow runs `npm run export-notebooks` (marimo export + copy of each project's `public/`) in CI, so you don’t have to run it locally before every push. If you do run it locally, commit the updated `public/notebooks/` so the site reflects it until the next CI run.

**Important – Pages must use GitHub Actions:** In the repo **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions** (not “Deploy from a branch”). If Source is “Deploy from a branch”, GitHub runs its built-in **Jekyll** workflow (“pages-build-deployment”) and the build fails (this repo is Astro, not Jekyll). With Source = **GitHub Actions**, the workflow in `.github/workflows/deploy.yml` runs: checkout → export marimo notebooks → copy notebook assets → Astro build → deploy.

## Plan

See the associated plan (e.g. in `.cursor/plans/`) for full architecture: Lambda health/chat/resume, Turnstile validation, session handling, and PDF/resume options (e.g. Lambda + Docker + headless Chromium).
