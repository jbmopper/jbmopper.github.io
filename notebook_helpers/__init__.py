"""
Shared helpers for Marimo notebooks in this repo.

- read_public_file(mo, filename, public_base_url=None): read a file from the
  project's public/ directory; works when running locally (path) and in WASM (HTTP).
  When notebook_location() is None (some WASM contexts), pass public_base_url
  e.g. "https://jbmopper.github.io/notebooks/local-tiny/public".
"""
from __future__ import annotations

import urllib.request
from urllib.parse import urlparse, urlunparse


def _normalize_to_public_url(segments: list[str], filename: str) -> str:
    """Build path like /notebooks/<project>/public/filename from path segments."""
    try:
        i = segments.index("public")
        base = segments[:i]
    except ValueError:
        base = segments
    if base and "." in base[-1]:
        base = base[:-1]
    return "/" + "/".join(base) + "/public/" + filename if base else "/public/" + filename


def _fetch_url(url: str) -> str:
    """Fetch URL and return body as string. Uses Pyodide in browser; urllib locally."""
    try:
        from pyodide.http import open_url  # type: ignore[import-untyped]
        f = open_url(url)
        return f.read()
    except Exception:
        try:
            from pyodide.http import pyxhr  # type: ignore[import-untyped]
            r = pyxhr.get(url)
            return r.text if hasattr(r, "text") else r.content.decode()
        except Exception:
            with urllib.request.urlopen(url) as f:
                return f.read().decode()


def read_public_file(
    mo,
    filename: str,
    public_base_url: str | None = None,
) -> str:
    """
    Read a file from the project's public/ directory.

    Works when running locally (filesystem path) and in WASM (HTTP fetch).
    When mo.notebook_location() is None (e.g. some WASM contexts), you must
    pass public_base_url, e.g. "https://jbmopper.github.io/notebooks/local-tiny/public".
    """
    loc = mo.notebook_location()
    if loc is None:
        if public_base_url is None:
            raise ValueError(
                "public_base_url is required when notebook_location() is None "
                "(e.g. in WASM). Pass e.g. 'https://jbmopper.github.io/notebooks/<project>/public'"
            )
        url = f"{public_base_url.rstrip('/')}/{filename}"
        return _fetch_url(url)

    path = loc / "public" / filename
    path_str = str(path)

    if path_str.startswith(("http://", "https://")):
        parsed = urlparse(path_str)
        segments = [s for s in parsed.path.split("/") if s]
        base_path = _normalize_to_public_url(segments, filename)
        url = urlunparse((parsed.scheme, parsed.netloc, base_path, "", "", ""))
        return _fetch_url(url)
    if path_str.startswith("/"):
        try:
            from js import window  # type: ignore[import-untyped]
            origin = window.location.origin
        except Exception:
            origin = "https://jbmopper.github.io"
        segments = [s for s in path_str.split("/") if s]
        path_only = _normalize_to_public_url(segments, filename)
        url = origin + path_only
        return _fetch_url(url)
    with open(path) as f:
        return f.read()
