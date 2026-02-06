#!/usr/bin/env bash
# Per-project notebook layout:
#   content/notebooks/<project_dir>/index.py   -> public/notebooks/<project_dir>/ (root/landing)
#   content/notebooks/<project_dir>/<name>.py  -> public/notebooks/<project_dir>/<name>/
# Each project can have content/notebooks/<project_dir>/public/ for assets (copied into each export).
# Notebooks that "from notebook_helpers import" are inlined before export (WASM can't load that module).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONTENT="$ROOT/content/notebooks"
OUT="$ROOT/public/notebooks"

export_one() {
  local src="$1"
  local dest_dir="$2"
  if grep -q "from notebook_helpers import" "$src" 2>/dev/null; then
    echo "    Inlining notebook_helpers and exporting..."
    tmp=$(mktemp "${TMPDIR:-/tmp}/marimo_export.XXXXXX.py")
    uv run python "$ROOT/scripts/inline-notebook-helpers.py" "$src" > "$tmp" && \
      uv run marimo export html-wasm "$tmp" -o "$dest_dir" --mode run
    rm -f "$tmp"
  else
    uv run marimo export html-wasm "$src" -o "$dest_dir" --mode run
  fi
}

cd "$ROOT"
for project_dir in "$CONTENT"/*/; do
  [ -d "$project_dir" ] || continue
  project=$(basename "$project_dir")
  [ -f "$project_dir/index.py" ] || continue
  echo "Project: $project"

  echo "  Exporting index.py -> $OUT/$project/"
  export_one "$project_dir/index.py" "$OUT/$project"
  if [ -d "$project_dir/public" ]; then
    mkdir -p "$OUT/$project/public"
    cp -r "$project_dir/public"/. "$OUT/$project/public/"
    echo "    Copied project public/ into $OUT/$project/public/"
  fi

  for py in "$project_dir"/*.py; do
    [ -f "$py" ] || continue
    name=$(basename "$py" .py)
    [ "$name" = "index" ] && continue
    echo "  Exporting $name.py -> $OUT/$project/$name/"
    export_one "$py" "$OUT/$project/$name"
    if [ -d "$project_dir/public" ]; then
      mkdir -p "$OUT/$project/$name/public"
      cp -r "$project_dir/public"/. "$OUT/$project/$name/public/"
    fi
  done
done
