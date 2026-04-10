import {readdir, readFile, writeFile, access} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const OBSERVABLE_ROOT = path.join(PROJECT_ROOT, "public/observable");
const JAY_BUNDLE = path.join(OBSERVABLE_ROOT, "_import/jay-standalone.js");
const INFERENCE_BUNDLE = path.join(OBSERVABLE_ROOT, "_import/inference-standalone.js");
const INFERENCE_MOUNT_CLASS = "jm-inference-mount";

const PROJECT_ROOT_PATH_CHECK = /^\/projects(?:\/index\.html)?\/?$/;
const LEGACY_PROJECT_ROOT_PATH_CHECK = /^\/projects\/?$/;
const INFERENCE_MOUNTS_BY_PAGE = new Map([
  // Prefer explicit markers emitted by ns_obv for exact inline placement.
  // This map is only for Astro-side fallback injections keyed by exported HTML path.
]);

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

function getCanonicalBaseHref(relativeHtmlPath) {
  const normalizedRelativePath = relativeHtmlPath.split(path.sep).join("/");
  if (normalizedRelativePath === "index.html") {
    return "/observable/";
  }

  const withoutIndex = normalizedRelativePath.replace(/\/index\.html$/, "/");
  return `/observable/${withoutIndex}`;
}

function upsertBaseHref(html, baseHref) {
  const baseTag = `<base href="${baseHref}">`;
  if (/<base\s+href="[^"]*"\s*>/i.test(html)) {
    return html.replace(/<base\s+href="[^"]*"\s*>/i, baseTag);
  }

  if (html.includes('<meta name="generator"')) {
    return html.replace(/(<meta name="generator"[^>]*>\n)/, `$1${baseTag}\n`);
  }

  if (html.includes("<head>\n")) {
    return html.replace("<head>\n", `<head>\n${baseTag}\n`);
  }

  return html;
}

function normalizeProjectRootMatcher(html) {
  if (!html.includes(LEGACY_PROJECT_ROOT_PATH_CHECK.source)) {
    return html;
  }
  return html.replaceAll(LEGACY_PROJECT_ROOT_PATH_CHECK.toString(), PROJECT_ROOT_PATH_CHECK.toString());
}

function normalizeHeaderHomeLink(html) {
  return html.replace(
    /(<a class="portfolio-nav-link"[^>]*onclick="event\.preventDefault\(\); window\.location\.assign\(window\.location\.origin \+ ')(?:\/#welcome|\/|#welcome)('\);">)(?:Home|Welcome)(<\/a>)/g,
    "$1/#welcome$2Welcome$3"
  );
}

function stripModulePreloads(html) {
  return html.replace(/^\s*<link rel="modulepreload"[^>]*>\n?/gm, "");
}

function normalizeInferenceMountPaths(html) {
  return html.replaceAll(
    'data-inference-warmup-path="/warmup"',
    'data-inference-warmup-path="/v1/infer/warmup"'
  );
}

function injectJayScript(html) {
  const tag = `<script src="/observable/_import/jay-standalone.js" defer><\/script>`;
  html = html.replace(/<script[^>]*jay-standalone\.js[^>]*><\/script>\n?/g, "");
  html = html.replace(/<script[^>]*mushbot-standalone\.js[^>]*><\/script>\n?/g, "");
  if (html.includes("</head>")) {
    return html.replace("</head>", `${tag}\n</head>`);
  }
  return html;
}

function escapeHtmlAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderInferenceMount(config = {}) {
  const attributes = [`class="${INFERENCE_MOUNT_CLASS}"`];
  const attributeMap = [
    ["eyebrow", "data-inference-eyebrow"],
    ["title", "data-inference-title"],
    ["description", "data-inference-description"],
    ["verificationTitle", "data-inference-verification-title"],
    ["verificationMessage", "data-inference-verification-message"],
    ["promptLabel", "data-inference-prompt-label"],
    ["promptPlaceholder", "data-inference-prompt-placeholder"],
    ["submitLabel", "data-inference-submit-label"],
    ["resetLabel", "data-inference-reset-label"],
    ["warmupPath", "data-inference-warmup-path"],
    ["initialModel", "data-inference-initial-model"],
    ["lockedModel", "data-inference-locked-model"],
    ["promptRows", "data-inference-prompt-rows"],
  ];

  for (const [configKey, attributeName] of attributeMap) {
    if (!(configKey in config) || config[configKey] === undefined || config[configKey] === null) {
      continue;
    }
    attributes.push(`${attributeName}="${escapeHtmlAttribute(config[configKey])}"`);
  }

  if (Array.isArray(config.models) && config.models.length > 0) {
    attributes.push(`data-inference-models="${escapeHtmlAttribute(JSON.stringify(config.models))}"`);
  }

  return `<div ${attributes.join(" ")}></div>`;
}

function ensureConfiguredInferenceMounts(html, relativePath) {
  const pageConfigs = INFERENCE_MOUNTS_BY_PAGE.get(relativePath);
  if (!pageConfigs || pageConfigs.length === 0) {
    return html;
  }

  if (html.includes(INFERENCE_MOUNT_CLASS)) {
    return html;
  }

  const renderedMounts = pageConfigs.map((config) => renderInferenceMount(config)).join("\n");
  if (html.includes("</main>")) {
    return html.replace("</main>", `\n${renderedMounts}\n</main>`);
  }

  return html;
}

function hasInlineInferenceMount(html) {
  return html.includes(INFERENCE_MOUNT_CLASS);
}

function injectInferenceScript(html) {
  const tag = `<script src="/observable/_import/inference-standalone.js" defer><\/script>`;
  html = html.replace(/<script[^>]*inference-standalone\.js[^>]*><\/script>\n?/g, "");
  if (html.includes("</head>")) {
    return html.replace("</head>", `${tag}\n</head>`);
  }
  return html;
}

async function jayBundleExists() {
  try {
    await access(JAY_BUNDLE);
    return true;
  } catch {
    return false;
  }
}

async function inferenceBundleExists() {
  try {
    await access(INFERENCE_BUNDLE);
    return true;
  } catch {
    return false;
  }
}

async function processHtmlFile(fullPath, injectJay, injectInference) {
  const relativePath = path.relative(OBSERVABLE_ROOT, fullPath).split(path.sep).join("/");
  let html = await readFile(fullPath, "utf8");

  html = upsertBaseHref(html, getCanonicalBaseHref(relativePath));
  html = normalizeProjectRootMatcher(html);
  html = normalizeHeaderHomeLink(html);
  html = stripModulePreloads(html);
  html = normalizeInferenceMountPaths(html);
  html = ensureConfiguredInferenceMounts(html, relativePath);
  if (injectJay) html = injectJayScript(html);
  if (injectInference && hasInlineInferenceMount(html)) html = injectInferenceScript(html);

  await writeFile(fullPath, html, "utf8");
}

async function main() {
  const allFiles = await walkDirectory(OBSERVABLE_ROOT);
  const htmlFiles = allFiles.filter((filePath) => filePath.endsWith(".html"));
  const injectJay = await jayBundleExists();
  const injectInference = await inferenceBundleExists();

  for (const htmlFile of htmlFiles) {
    await processHtmlFile(htmlFile, injectJay, injectInference);
  }

  const notes = [];
  if (injectJay) notes.push("Jay injection");
  if (injectInference) notes.push("inline inference injection");
  const suffix = notes.length > 0 ? ` (with ${notes.join(" + ")})` : "";
  console.log(`Post-processed Observable export HTML (${htmlFiles.length} files)${suffix}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
