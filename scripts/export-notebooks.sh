#!/usr/bin/env bash
# Per-project notebook layout:
#   content/notebooks/<project_dir>/index.py   -> public/notebooks/<project_dir>/ (root/landing)
#   content/notebooks/<project_dir>/<name>.py  -> public/notebooks/<project_dir>/<name>/
# Each project can have content/notebooks/<project_dir>/public/ for assets (copied into each export).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONTENT="$ROOT/content/notebooks"
OUT="$ROOT/public/notebooks"

cd "$ROOT"
for project_dir in "$CONTENT"/*/; do
  [ -d "$project_dir" ] || continue
  project=$(basename "$project_dir")
  # Skip non-project dirs (e.g. __pycache__, or a stray file that got a dir)
  [ -f "$project_dir/index.py" ] || continue
  echo "Project: $project"

  # Root/landing notebook -> public/notebooks/<project>/
  echo "  Exporting index.py -> $OUT/$project/"
  uv run marimo export html-wasm "$project_dir/index.py" -o "$OUT/$project" --mode run
  if [ -d "$project_dir/public" ]; then
    mkdir -p "$OUT/$project/public"
    cp -r "$project_dir/public"/. "$OUT/$project/public/"
    echo "    Copied project public/ into $OUT/$project/public/"
  fi

  # Other notebooks -> public/notebooks/<project>/<name>/
  for py in "$project_dir"/*.py; do
    [ -f "$py" ] || continue
    name=$(basename "$py" .py)
    [ "$name" = "index" ] && continue
    echo "  Exporting $name.py -> $OUT/$project/$name/"
    uv run marimo export html-wasm "$py" -o "$OUT/$project/$name" --mode run
    if [ -d "$project_dir/public" ]; then
      mkdir -p "$OUT/$project/$name/public"
      cp -r "$project_dir/public"/. "$OUT/$project/$name/public/"
    fi
  done
done
