import {stat} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const requiredSharedArtifacts = [
  "public/observable/index.html",
  "public/observable/embed/nsys.js",
  "public/observable/embed/ablations.js",
  "public/observable/embed/lr-sweep.js",
  "public/observable/embed/perf-empirical.js",
  "public/observable/embed/perf-expected.js",
  "public/observable/embed/data-playground.js",
  "public/observable/_observablehq",
  "public/observable/_import",
  "public/observable/_file"
];
const requiredCanonicalRoutes = [
  "projects/llm-fundamentals",
  "projects/llm-fundamentals/perf-expected",
  "projects/llm-fundamentals/perf-empirical",
  "projects/llm-fundamentals/nsys",
  "projects/llm-fundamentals/lr-sweep",
  "projects/llm-fundamentals/ablations",
  "projects/data-playground"
];

async function pathExists(relativePath) {
  const absolutePath = path.join(PROJECT_ROOT, relativePath);
  try {
    await stat(absolutePath);
    return true;
  } catch (error) {
    return false;
  }
}

async function assertExists(relativePath) {
  if (!(await pathExists(relativePath))) {
    throw new Error(`Missing Observable artifact: ${relativePath}`);
  }
}

async function assertCanonicalRoutes() {
  const missing = [];
  for (const route of requiredCanonicalRoutes) {
    const routeIndexPath = `public/observable/${route}/index.html`;
    if (!(await pathExists(routeIndexPath))) {
      missing.push(routeIndexPath);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing canonical Observable routes: ${missing.join(", ")}`);
  }
}

async function main() {
  for (const item of requiredSharedArtifacts) {
    await assertExists(item);
  }
  await assertCanonicalRoutes();
  console.log("Observable artifact check passed (canonical project routes found).");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
