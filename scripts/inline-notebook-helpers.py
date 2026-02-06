#!/usr/bin/env python3
"""
Inline notebook_helpers into a notebook so the result can be exported to WASM
(marimo export does not bundle local modules). Reads the notebook and
notebook_helpers/__init__.py, replaces the cell that imports notebook_helpers
with the full inlined implementation, and writes the result to stdout.

Usage:
  python scripts/inline-notebook-helpers.py content/notebooks/<project>/index.py [public_base_url]
  If public_base_url is omitted, it is derived from the project dir (e.g. local-tiny -> .../notebooks/local-tiny/public).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path


def get_root() -> Path:
    return Path(__file__).resolve().parent.parent


def read_notebook_helpers_source(root: Path) -> str:
    init = root / "notebook_helpers" / "__init__.py"
    if not init.exists():
        raise SystemExit(f"notebook_helpers/__init__.py not found at {init}")
    text = init.read_text()
    # Strip module docstring (first triple-quoted string)
    text = re.sub(r'^"""[\s\S]*?"""\s*\n', "", text, count=1)
    text = re.sub(r"^'''[\s\S]*?'''\s*\n", "", text, count=1)
    # Strip __future__ (not valid inside a function)
    text = re.sub(r'^from __future__ import annotations\s*\n', "", text)
    return text.strip()


def find_helpers_cell(content: str) -> tuple[int, int] | None:
    """Return (start_index, end_index) of the cell that contains 'from notebook_helpers import', or None."""
    if "from notebook_helpers import" not in content:
        return None
    # Find @app.cell that precedes the line with notebook_helpers
    lines = content.split("\n")
    in_cell_start = None
    for i, line in enumerate(lines):
        if line.strip().startswith("@app.cell"):
            in_cell_start = i
        if in_cell_start is not None and "from notebook_helpers import" in line:
            # Find end of this cell: next @app.cell or end of file
            end = len(lines)
            for j in range(i + 1, len(lines)):
                if lines[j].strip().startswith("@app.cell"):
                    end = j
                    break
            return (in_cell_start, end)
    return None


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: inline-notebook-helpers.py <index.py> [public_base_url]", file=sys.stderr)
        sys.exit(1)
    root = get_root()
    index_path = Path(sys.argv[1])
    if not index_path.is_absolute():
        index_path = root / index_path
    if not index_path.exists():
        raise SystemExit(f"Not found: {index_path}")

    # public_base_url: e.g. https://jbmopper.github.io/notebooks/local-tiny/public
    if len(sys.argv) >= 3:
        public_base_url = sys.argv[2].rstrip("/")
    else:
        # Derive from path: content/notebooks/local-tiny/index.py -> local-tiny
        project = index_path.parent.name
        public_base_url = f"https://jbmopper.github.io/notebooks/{project}/public"

    content = index_path.read_text()
    span = find_helpers_cell(content)
    if span is None:
        # No notebook_helpers import; pass through unchanged
        print(content)
        return

    start, end = span
    lines = content.split("\n")
    project = index_path.parent.name
    helpers_source = read_notebook_helpers_source(root)
    # Indent helpers source so it's inside def _(mo):
    indented = "\n".join("    " + line if line.strip() else "" for line in helpers_source.split("\n"))
    # Use current origin when in browser (localhost or production) so assets load on localhost too
    new_cell = f'''@app.cell
def _(mo):
    try:
        from js import window
        _PUBLIC_BASE_URL = f"{{window.location.origin}}/notebooks/{project}/public"
    except Exception:
        _PUBLIC_BASE_URL = {repr(public_base_url)}

{indented}

    _read_public_file_impl = read_public_file
    def read_public_file(mo, filename: str) -> str:
        return _read_public_file_impl(mo, filename, public_base_url=_PUBLIC_BASE_URL)

    return (read_public_file,)
'''

    out_lines = lines[:start] + new_cell.rstrip().split("\n") + [""] + lines[end:]
    print("\n".join(out_lines))


if __name__ == "__main__":
    main()
