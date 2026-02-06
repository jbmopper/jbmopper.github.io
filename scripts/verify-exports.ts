/**
 * After export-notebooks, verify that every project with notebook source
 * has a corresponding export (public/notebooks/<dir>/index.html) and that
 * exported HTML does not contain patterns that break in WASM (e.g. imports
 * of packages that are not bundled).
 * Run from repo root: tsx scripts/verify-exports.ts
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { projects, getProjectNotebooksDir } from "../src/data/projects";

const root = join(fileURLToPath(import.meta.url), "..", "..");

/**
 * Patterns that must not appear in exported notebook HTML (e.g. imports of
 * local modules that are not bundled in WASM). Notebooks are self-contained;
 * any helper code lives in the notebook itself.
 */
const FORBIDDEN_IN_EXPORT = ["notebook_helpers"];

let failed = false;
for (const project of projects) {
  const dir = getProjectNotebooksDir(project);
  if (!dir) continue;
  const indexPy = join(root, "content", "notebooks", dir, "index.py");
  const indexHtml = join(root, "public", "notebooks", dir, "index.html");
  if (existsSync(indexPy) && !existsSync(indexHtml)) {
    console.error(
      `Missing export: content/notebooks/${dir}/index.py exists but public/notebooks/${dir}/index.html not found`
    );
    failed = true;
    continue;
  }
  if (!existsSync(indexHtml)) continue;
  const html = readFileSync(indexHtml, "utf-8");
  for (const bad of FORBIDDEN_IN_EXPORT) {
    if (html.includes(bad)) {
      console.error(
        `Export ${dir}: found "${bad}" in public/notebooks/${dir}/index.html. ` +
          `WASM export cannot load that module; remove the reference and re-export.`
      );
      failed = true;
    }
  }
}
if (failed) process.exit(1);
console.log("Export verification passed.");
