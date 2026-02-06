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
```

This runs `scripts/export-notebooks.sh`, which exports **per-project** notebook directories (see below). Each project has a root notebook that opens from the projects page; multi-notebook projects use the root as a landing page that links to the others.

**Important:** The live site serves the **exported** files under `public/notebooks/`, not the source `.py`. After changing a notebook, run `npm run export-notebooks` and commit the updated `public/notebooks/<project>/` so the deployed app includes your changes.

**Python linting:** This project uses [Ruff](https://docs.astral.sh/ruff/) (not Pylint). After `uv sync`, run `uv run ruff check .` and `uv run ruff format .`. In Cursor/VSCode, disable Pylint and use the Ruff extension (or set Python linting to Ruff) so the IDE matches.

## Env (optional)

Copy `.env.example` to `.env` and set `PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` when you add Turnstile. Backend API base can go in `PUBLIC_API_BASE` when you have it.

## Adding projects

Projects are listed on the [Projects](/projects) page and each has a detail page at `/projects/<slug>`.

### How notebooks are organized (per-project directories)

- **Source:** Each project that has notebooks has a directory `content/notebooks/<project_dir>/` (the directory name usually matches the project’s `notebooksDir` or `slug` in `src/data/projects.ts`).
  - **`index.py`** = root/landing notebook. Exported to `public/notebooks/<project_dir>/` so the project’s notebook URL is `/notebooks/<project_dir>/`. The projects page “Open notebook” link goes here.
  - **Other `*.py`** in the same directory = sibling notebooks. Exported to `public/notebooks/<project_dir>/<name>/` (e.g. `architecture.py` → `/notebooks/local-tiny/architecture/`). The root notebook should act as a landing page and link to these (e.g. with `mo.md` or `mo.Html` with `<a href="/notebooks/local-tiny/architecture/">Architecture</a>`).
  - **`public/`** inside the project dir (optional) holds assets (SVG, data files); it’s copied into each export for that project.
- **Build:** Run `npm run export-notebooks` (or CI does it on push). The script finds every `content/notebooks/*/index.py` and exports that project’s notebooks into `public/notebooks/<project_dir>/`.
- **Projects page:** In `src/data/projects.ts`, set `notebooksDir: "local-tiny"` (or omit it to default to `slug`) for any project that has a notebook directory. The projects list and project detail page show a single “Open notebook” link that opens the root notebook. Multi-notebook projects: users open the root, then use the landing content inside the notebook to jump to the others.

### Adding a project with notebooks

1. **Add an entry** in `src/data/projects.ts`: `slug`, `title`, `description`, optional `body`, and `notebooksDir` (optional; defaults to `slug`) to point at the notebook directory name.
2. **Create** `content/notebooks/<notebooksDir>/index.py` (the root/landing Marimo app). Add other `.py` files in the same dir for sibling notebooks. Optionally add `content/notebooks/<notebooksDir>/public/` for assets.
3. **Run** `npm run export-notebooks` and commit the new `public/notebooks/<notebooksDir>/` output.
4. In the root notebook, add markdown or HTML links to sibling notebooks (e.g. `/notebooks/local-tiny/architecture/`) so multi-notebook projects have a clear landing page.

## Theme and look-and-feel sync (site + notebooks)

- **Single source of truth:** `public/site-theme.css` defines the palette and fonts (`:root` variables and Marimo overrides). The Astro layout and all Marimo notebooks load this file so they stay in sync.
- **Site:** `Layout.astro` links to Google Fonts (DM Sans) and `/site-theme.css`. Layout-specific styles (header, main) stay in the layout and use the same variables.
- **Notebooks:** Each notebook should set `html_head_file="head.html"` in `marimo.App(...)`. The file `content/notebooks/head.html` injects the same font and `<link rel="stylesheet" href="/site-theme.css">` into the exported HTML. When the notebook is served from the same origin (e.g. GitHub Pages), it loads the same theme. **To change colors or fonts, edit only `public/site-theme.css`.**

## Marimo notebooks

- **Source:** Each project’s notebooks live in `content/notebooks/<project_dir>/`: `index.py` (root/landing) and any other `*.py` (siblings). Optional `public/` inside that dir holds assets (SVG, data); the export script copies it into each export for that project.
- **Python env:** Use [uv](https://docs.astral.sh/uv/) and the project venv: run `uv sync` (creates `.venv` from `pyproject.toml`; marimo, polars, plotly). The Node build does not need marimo.
- Run `npm run export-notebooks` to export all project notebook dirs into `public/notebooks/<project_dir>/`. CI runs this on push.
- The projects page and project detail page link to the **root** notebook only (`/notebooks/<project_dir>/`). For multi-notebook projects, the root notebook should be a landing page that links to the others.

### Including data files (e.g. SVG) in WASM exports

Put assets in **`content/notebooks/<project_dir>/public/`** (e.g. `content/notebooks/local-tiny/public/cs336_forward.svg`). The export script copies that folder into each of that project’s exports so the WASM notebook can load files over HTTP. In the browser, `mo.notebook_location()` returns a **URL**, not a filesystem path, so **`open(path)` fails**—use the notebook’s `read_public_file(mo, filename)` helper (or equivalent) that fetches via URL when given a URL path:

```python
import urllib.request

def read_public_file(mo, filename: str) -> str:
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
svg = read_public_file(mo, "cs336_forward.svg")
# then substitute template vars and use mo.Html(container_html) as before
```

Use `read_public_file(mo, "cs336_forward.svg")` so the exported notebook loads the file over HTTP. Ensure the helper builds the correct public URL for your project (e.g. `/notebooks/local-tiny/public/...`).

## Deploy

Push to `main`; GitHub Actions builds and deploys to GitHub Pages. Repo is `jbmopper.github.io` so the site is at the root URL. `.nojekyll` is in `public/` so Jekyll does not process the site.

**You can use either local export or CI** for the notebooks: the workflow runs `npm run export-notebooks` (marimo export + copy of `content/notebooks/public/`) in CI, so you don’t have to run it locally before every push. If you do run it locally, commit the updated `public/notebooks/` so the site reflects it until the next CI run.

**Important – Pages must use GitHub Actions:** In the repo **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions** (not “Deploy from a branch”). If Source is “Deploy from a branch”, GitHub runs its built-in **Jekyll** workflow (“pages-build-deployment”) and the build fails (this repo is Astro, not Jekyll). With Source = **GitHub Actions**, the workflow in `.github/workflows/deploy.yml` runs: checkout → export marimo notebooks → copy notebook assets → Astro build → deploy.

## Plan

See the associated plan (e.g. in `.cursor/plans/`) for full architecture: Lambda health/chat/resume, Turnstile validation, session handling, and PDF/resume options (e.g. Lambda + Docker + headless Chromium).
