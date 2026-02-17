import {readFile, stat} from "node:fs/promises";
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
  "public/observable/_file",
  "public/observable/_npm"
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
const expectedBaseHrefByPage = new Map([
  ["public/observable/index.html", "/observable/"],
  ["public/observable/projects/index.html", "/observable/projects/"],
  ["public/observable/projects/llm-fundamentals/perf-expected/index.html", "/observable/projects/llm-fundamentals/perf-expected/"]
]);

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

async function assertBaseHrefs() {
  for (const [relativeHtmlPath, expectedBaseHref] of expectedBaseHrefByPage.entries()) {
    const absoluteHtmlPath = path.join(PROJECT_ROOT, relativeHtmlPath);
    const html = await readFile(absoluteHtmlPath, "utf8");

    if (!html.includes(`<base href="${expectedBaseHref}">`)) {
      throw new Error(`Missing expected <base> tag in ${relativeHtmlPath}: <base href="${expectedBaseHref}">`);
    }
  }
}

async function assertKatexAssets() {
  const mathPagePath = "public/observable/projects/llm-fundamentals/perf-expected/index.html";
  const mathPageAbsolutePath = path.join(PROJECT_ROOT, mathPagePath);
  const mathPageHtml = await readFile(mathPageAbsolutePath, "utf8");

  const katexCssMatches = [...mathPageHtml.matchAll(/href="([^"]*katex[^"]*\.css)"/g)].map((match) => match[1]);
  if (katexCssMatches.length === 0) {
    throw new Error(`No KaTeX stylesheet references found in ${mathPagePath}`);
  }

  const uniqueKatexCssMatches = [...new Set(katexCssMatches)];
  for (const cssReference of uniqueKatexCssMatches) {
    const cssAbsolutePath = path.resolve(path.dirname(mathPageAbsolutePath), cssReference);
    try {
      await stat(cssAbsolutePath);
    } catch (error) {
      throw new Error(`Missing KaTeX stylesheet asset referenced by ${mathPagePath}: ${cssReference}`);
    }

    const cssText = await readFile(cssAbsolutePath, "utf8");
    const fontReferences = [...cssText.matchAll(/url\((?:'|")?([^'")]+)(?:'|")?\)/g)]
      .map((match) => match[1])
      .filter((fontPath) => fontPath.includes("fonts/") && !fontPath.startsWith("data:") && !fontPath.startsWith("http"));

    if (fontReferences.length === 0) {
      throw new Error(`No KaTeX font references found in stylesheet: ${path.relative(PROJECT_ROOT, cssAbsolutePath)}`);
    }

    const uniqueFontReferences = [...new Set(fontReferences)];
    for (const fontReference of uniqueFontReferences) {
      const fontAbsolutePath = path.resolve(path.dirname(cssAbsolutePath), fontReference);
      try {
        await stat(fontAbsolutePath);
      } catch (error) {
        throw new Error(
          `Missing KaTeX font asset referenced by ${path.relative(PROJECT_ROOT, cssAbsolutePath)}: ${fontReference}`
        );
      }
    }
  }
}

async function main() {
  for (const item of requiredSharedArtifacts) {
    await assertExists(item);
  }
  await assertCanonicalRoutes();
  await assertBaseHrefs();
  await assertKatexAssets();
  console.log("Observable artifact check passed (canonical project routes found).");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
