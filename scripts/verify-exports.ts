/**
 * After export-notebooks, verify that every project with notebook source
 * has a corresponding export (public/notebooks/<dir>/index.html).
 * Run from repo root: tsx scripts/verify-exports.ts
 */
import { existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { projects, getProjectNotebooksDir } from "../src/data/projects";

const root = join(fileURLToPath(import.meta.url), "..", "..");

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
  }
}
if (failed) process.exit(1);
console.log("Export verification passed.");
