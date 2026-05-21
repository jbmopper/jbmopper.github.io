import {readdir, readFile, stat} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const requiredSharedArtifacts = [
  "public/.nojekyll",
  "public/observable/index.html",
  "public/observable/embed/nsys.js",
  "public/observable/embed/ablations.js",
  "public/observable/embed/lr-sweep.js",
  "public/observable/embed/perf-empirical.js",
  "public/observable/embed/perf-expected.js",
  "public/observable/embed/data-playground.js",
  "public/observable/_observablehq",
  "public/observable/_import",
  "public/observable/_import/inference-standalone.js",
  "public/observable/_file",
  "public/observable/_npm"
];
const requiredCanonicalRoutes = [
  "projects/llm-fundamentals",
  "projects/llm-fundamentals/perf-expected",
  "projects/llm-fundamentals/perf-empirical",
  "projects/llm-fundamentals/nsys",
  "projects/llm-fundamentals/optimizer-sweep",
  "projects/llm-fundamentals/ablations",
  "projects/llm-fundamentals/deployment",
  "projects/data-playground"
];
const expectedBaseHrefByPage = new Map([
  ["public/observable/index.html", "/observable/"],
  ["public/observable/projects/index.html", "/observable/projects/"],
  ["public/observable/projects/llm-fundamentals/perf-expected/index.html", "/observable/projects/llm-fundamentals/perf-expected/"]
]);
const forbiddenPublicArtifactPatterns = [
  "/Users/juliusmopper",
  "/Users/juliusmopper/Dev/Notebooks",
  "/Users/juliusmopper/Dev/stanford-cs336",
  "/Users/juliusmopper/Dev/jbmopper.github.io",
  '"source_root"',
  '"source_file"',
  '"source_repo": "Notebooks"',
];
const forbiddenMetadataNames = new Set([".DS_Store", "__MACOSX"]);

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

async function assertSharedProjectCatalog() {
  const relativeCatalogPath = "src/data/projects.json";
  const absoluteCatalogPath = path.join(PROJECT_ROOT, relativeCatalogPath);
  await assertExists(relativeCatalogPath);
  const rawCatalog = await readFile(absoluteCatalogPath, "utf8");

  let catalog;
  try {
    catalog = JSON.parse(rawCatalog);
  } catch (error) {
    throw new Error(`Shared project catalog is not valid JSON: ${relativeCatalogPath}`);
  }

  if (!Array.isArray(catalog)) {
    throw new Error(`Shared project catalog must be an array: ${relativeCatalogPath}`);
  }

  const publishedEntries = catalog.filter((entry) => entry?.status === "published");
  if (publishedEntries.length === 0) {
    throw new Error(`Shared project catalog has no published entries: ${relativeCatalogPath}`);
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
    const details = missing.map((item) => `  - ${item}`).join("\n");
    throw new Error(
      [
        "Canonical Observable route check failed.",
        "Missing route index files:",
        details,
        "Re-export Observable pages or update scripts/verify-observable-export.mjs route expectations."
      ].join("\n")
    );
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

async function assertEchartsRuntimeAsset() {
  const componentsDir = path.join(PROJECT_ROOT, "public/observable/_import/components");
  const componentFiles = await readdir(componentsDir);
  const echartComponentFile = componentFiles.find((filename) => /^echart\..+\.js$/.test(filename));

  if (!echartComponentFile) {
    throw new Error("Missing Observable echart component bundle in public/observable/_import/components.");
  }

  const componentAbsolutePath = path.join(componentsDir, echartComponentFile);
  const componentSource = await readFile(componentAbsolutePath, "utf8");
  const echartsImportMatch = componentSource.match(/from "(\.\.\/\.\.\/_npm\/echarts[^"]+)"/);

  if (!echartsImportMatch) {
    throw new Error(`Unable to resolve ECharts import path from ${path.relative(PROJECT_ROOT, componentAbsolutePath)}.`);
  }

  const echartsAssetAbsolutePath = path.resolve(path.dirname(componentAbsolutePath), echartsImportMatch[1]);
  try {
    await stat(echartsAssetAbsolutePath);
  } catch {
    throw new Error(
      `Missing ECharts runtime asset referenced by ${path.relative(PROJECT_ROOT, componentAbsolutePath)}: ${echartsImportMatch[1]}`
    );
  }
}

async function walkDirectory(directory) {
  const entries = await readdir(directory, {withFileTypes: true});
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkDirectory(fullPath)));
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

async function assertInferenceMountsAreWired() {
  const observableRoot = path.join(PROJECT_ROOT, "public/observable");
  const files = await walkDirectory(observableRoot);
  const htmlFiles = files.filter((filePath) => filePath.endsWith(".html"));

  for (const absoluteHtmlPath of htmlFiles) {
    const html = await readFile(absoluteHtmlPath, "utf8");
    if (!html.includes("jm-inference-mount")) {
      continue;
    }

    if (!html.includes("/observable/_import/inference-standalone.js")) {
      throw new Error(
        `Missing inline inference standalone script in ${path.relative(PROJECT_ROOT, absoluteHtmlPath)}.`,
      );
    }
  }
}

function isMacosMetadataPath(filePath) {
  return filePath
    .split(path.sep)
    .some((segment) => forbiddenMetadataNames.has(segment) || segment.startsWith("._"));
}

async function assertPublicArtifactsAreSanitized() {
  const observableRoot = path.join(PROJECT_ROOT, "public/observable");
  const files = await walkDirectory(observableRoot);
  const failures = [];

  for (const absolutePath of files) {
    const relativePath = path.relative(PROJECT_ROOT, absolutePath);
    if (isMacosMetadataPath(absolutePath)) {
      failures.push(`${relativePath}: macOS metadata artifact must not be published`);
      continue;
    }

    const contents = await readFile(absolutePath, "utf8").catch(() => "");
    for (const pattern of forbiddenPublicArtifactPatterns) {
      if (contents.includes(pattern)) {
        failures.push(`${relativePath}: contains forbidden local path prefix ${pattern}`);
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(
      [
        "Observable public artifact sanitization check failed.",
        ...failures.map((failure) => `  - ${failure}`),
        "Run scripts/postprocess-observable-export.mjs and re-export generated artifacts if needed."
      ].join("\n")
    );
  }
}

async function main() {
  for (const item of requiredSharedArtifacts) {
    await assertExists(item);
  }
  await assertSharedProjectCatalog();
  await assertCanonicalRoutes();
  await assertBaseHrefs();
  await assertKatexAssets();
  await assertEchartsRuntimeAsset();
  await assertInferenceMountsAreWired();
  await assertPublicArtifactsAreSanitized();
  console.log("[verify:observable] PASS: Observable artifact check passed (canonical project routes found).");
}

main().catch((error) => {
  console.error("[verify:observable] FAIL:");
  console.error(error.message);
  process.exitCode = 1;
});
