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
# or for one notebook (then copy content/notebooks/public/ into the output dir):
uv run marimo export html-wasm content/notebooks/local_tiny.py -o public/notebooks/local_tiny --mode run
```
**Important:** The live site (e.g. GitHub Pages) serves the **exported** files under `public/notebooks/`, not the source `.py`. After changing a notebook, run `npm run export-notebooks` and **commit the updated `public/notebooks/<name>/`** (including `index.html` and `public/` assets) so the deployed app includes your changes.

## Env (optional)

Copy `.env.example` to `.env` and set `PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` when you add Turnstile. Backend API base can go in `PUBLIC_API_BASE` when you have it.

## Adding projects

Projects are listed on the [Projects](/projects) page and each has a detail page at `/projects/<slug>`.

### Page design: narrative first, embeds as components

Project pages are **Astro-owned**: the main text, structure, and links live in normal HTML/content (`body`). Notebooks are used as **small, focused embeds** (e.g. one chart, one dataframe, one interactive widget), not as whole-page “open this notebook” experiences. So:

- **Bulk text, subpages, links** → normal webpage content in `body` (or Content Collections later).
- **Dataframes, charts, interactive bits** → one or more Marimo (or other) exports, each embedded in its own section below the narrative.

Export **small, focused** notebooks (e.g. one notebook that only produces a chart, another that only shows a table) and reference them in the `embeds` array. Each embed gets a section with an optional title and an “Open in new tab” link.

1. **Add an entry** in `src/data/projects.ts` in the `projects` array. Each project has:
   - `slug` – URL segment (e.g. `"my-analysis"` → `/projects/my-analysis`)
   - `title` – display name
   - `description` – short blurb (shown on the projects list)
   - `body` (optional) – main narrative HTML on the project detail page
   - `embeds` (optional) – list of `{ path, title?, height? }` for notebook-derived blocks (path under `/notebooks/`, e.g. `"m4-chart.html"` or `"local_tiny/index.html"`). Legacy single `notebook` is still supported and treated as one embed.

2. **Export small Marimo outputs** to `public/notebooks/` (one file or subdir per embed so paths stay stable), then set `embeds: [{ path: "my-chart/index.html", title: "Results" }]` (and add more objects for more charts/tables). Each embed is rendered as its own section with optional heading and iframe; you can set `height` (e.g. `"400px"`) per embed if needed.

## Marimo notebooks

- **Source:** `.py` notebooks and a `public/` folder (assets like SVG) live in `content/notebooks/`. File layout here is the canonical one for the site; it differs from other repos (e.g. CS336).
- **Python env:** Use [uv](https://docs.astral.sh/uv/) and the project venv: run `uv sync` (creates `.venv` from `pyproject.toml`; marimo, polars, plotly). The Node build does not need marimo.
- Prefer **small, focused** notebooks and export each to its own path under `public/notebooks/<name>/`. Run `npm run export-notebooks` (which exports and copies `content/notebooks/public/` into the output so SVG/data files load in WASM). One output dir per notebook.
- A CI step can run exports on push; for now run locally and commit outputs under `public/notebooks/`.
- Reference from project pages via the `embeds` array in `src/data/projects.ts` (or legacy `notebook` for a single full-page-style embed).

### Including data files (e.g. SVG) in WASM exports

Put assets in a **`public/`** folder next to the notebook (e.g. `content/notebooks/public/cs336_forward.svg`). The export script and CI **copy** that folder into `public/notebooks/<name>/public/` so the WASM notebook can load files over HTTP. In the browser, `mo.notebook_location()` returns a **URL**, not a filesystem path, so **`open(path)` fails**—use the notebook’s `_read_public_file(mo, filename)` helper (or equivalent) that fetches via URL when given a URL path:

```python
import urllib.request

def _read_public_file(mo, filename: str) -> str:
    """Read a file from public/; works locally (path) and in WASM (URL)."""
    loc = mo.notebook_location()
    path = loc / "public" / filename
    path_str = str(path)
    if path_str.startswith(("http://", "https://")):
        with urllib.request.urlopen(path_str) as f:
            return f.read().decode()
    with open(path) as f:
        return f.read()

# In your cell, e.g. for an SVG:
svg = _read_public_file(mo, "cs336_forward.svg")
# then substitute template vars and use mo.Html(container_html) as before
```

Use `_read_public_file(mo, "cs336_forward.svg")` instead of `open(mo.notebook_location() / "public" / "cs336_forward.svg").read()` so the exported notebook can load the file over HTTP.

## Deploy

Push to `main`; GitHub Actions builds and deploys to GitHub Pages. Repo is `jbmopper.github.io` so the site is at the root URL. `.nojekyll` is in `public/` so Jekyll does not process the site.

**You can use either local export or CI** for the notebooks: the workflow runs `npm run export-notebooks` (marimo export + copy of `content/notebooks/public/`) in CI, so you don’t have to run it locally before every push. If you do run it locally, commit the updated `public/notebooks/` so the site reflects it until the next CI run.

**Important – Pages must use GitHub Actions:** In the repo **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions** (not “Deploy from a branch”). If Source is “Deploy from a branch”, GitHub runs its built-in **Jekyll** workflow (“pages-build-deployment”) and the build fails (this repo is Astro, not Jekyll). With Source = **GitHub Actions**, the workflow in `.github/workflows/deploy.yml` runs: checkout → export marimo notebooks → copy notebook assets → Astro build → deploy.

## Plan

See the associated plan (e.g. in `.cursor/plans/`) for full architecture: Lambda health/chat/resume, Turnstile validation, session handling, and PDF/resume options (e.g. Lambda + Docker + headless Chromium).
