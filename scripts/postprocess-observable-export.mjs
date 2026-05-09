import {readdir, readFile, writeFile, access, rm} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const OBSERVABLE_ROOT = path.join(PROJECT_ROOT, "public/observable");
const JAY_BUNDLE = path.join(OBSERVABLE_ROOT, "_import/jay-standalone.js");
const INFERENCE_BUNDLE = path.join(OBSERVABLE_ROOT, "_import/inference-standalone.js");
const INFERENCE_MOUNT_CLASS = "jm-inference-mount";
const SENSITIVE_JSON_KEYS = new Set(["source_root", "source", "source_file"]);
const SENSITIVE_SOURCE_REPOS = new Set(["Notebooks"]);
const MACOS_METADATA_NAMES = new Set([".DS_Store", "__MACOSX"]);
const LOCAL_PATH_PREFIXES = [
  "/Users/juliusmopper",
  "/Users/juliusmopper/Dev/Notebooks",
  "/Users/juliusmopper/Dev/stanford-cs336",
  "/Users/juliusmopper/Dev/jbmopper.github.io",
];
const LOCAL_PATH_PATTERN = /\/Users\/juliusmopper\/[^\s"'<>),}\]]+/g;

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
    if (MACOS_METADATA_NAMES.has(entry.name) || entry.name.startsWith("._")) {
      files.push(fullPath);
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...(await walkDirectory(fullPath)));
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

function isMacosMetadataPath(filePath) {
  return filePath
    .split(path.sep)
    .some((segment) => MACOS_METADATA_NAMES.has(segment) || segment.startsWith("._"));
}

function isLocalPath(value) {
  return LOCAL_PATH_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function sanitizeLocalPathString(value) {
  if (!isLocalPath(value)) {
    return value;
  }

  return path.posix.basename(value);
}

function sanitizeJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonValue(item));
  }

  if (!value || typeof value !== "object") {
    return typeof value === "string" ? sanitizeLocalPathString(value) : value;
  }

  const sanitized = {};
  for (const [key, childValue] of Object.entries(value)) {
    if (SENSITIVE_JSON_KEYS.has(key)) {
      if (typeof childValue === "string" && isLocalPath(childValue)) {
        continue;
      }
      if (typeof childValue === "string") {
        continue;
      }
    }

    if (key === "source_repo" && typeof childValue === "string" && SENSITIVE_SOURCE_REPOS.has(childValue)) {
      continue;
    }

    sanitized[key] = sanitizeJsonValue(childValue);
  }

  return sanitized;
}

function sanitizeHtmlText(html) {
  return html.replace(LOCAL_PATH_PATTERN, (match) => path.posix.basename(match));
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

/*
 * Cross-frame theme parity: the Astro shell sets data-theme + data-mode on
 * <html> from localStorage on first paint (see BaseLayout.astro). Observable
 * export pages live on the same origin so they read the same localStorage,
 * but their default <head> doesn't run the init. Inject the same synchronous
 * snippet here so palette/mode are applied BEFORE the theme stylesheet so
 * there's no flash when navigating from /#welcome -> /observable/projects/.
 *
 * Marked with id="jm-theme-init" so verify scripts can grep for it.
 */
const THEME_INIT_TAG_ID = "jm-theme-init";
const THEME_INIT_TAG =
  `<script id="${THEME_INIT_TAG_ID}">(function(){try{var d=document.documentElement;var ls=window.localStorage;var t=ls&&ls.getItem("jm:theme");var m=ls&&ls.getItem("jm:mode");if(!t)t="paper";if(!m)m=(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light";d.dataset.theme=t;d.dataset.mode=m;}catch(e){document.documentElement.dataset.theme="paper";document.documentElement.dataset.mode="light";}})();<\/script>`;

function injectThemeInitScript(html) {
  // Idempotent: skip if a previous run already inserted the tag.
  if (html.includes(`id="${THEME_INIT_TAG_ID}"`)) return html;
  // Place as early in <head> as possible — before any <link rel="stylesheet">
  // so the [data-theme][data-mode] selectors match on first paint.
  if (html.includes("<head>\n")) {
    return html.replace("<head>\n", `<head>\n${THEME_INIT_TAG}\n`);
  }
  if (html.includes("<head>")) {
    return html.replace("<head>", `<head>${THEME_INIT_TAG}`);
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

  html = sanitizeHtmlText(html);
  html = upsertBaseHref(html, getCanonicalBaseHref(relativePath));
  html = normalizeProjectRootMatcher(html);
  html = normalizeHeaderHomeLink(html);
  html = stripModulePreloads(html);
  html = normalizeInferenceMountPaths(html);
  html = ensureConfiguredInferenceMounts(html, relativePath);
  html = injectThemeInitScript(html);
  if (injectJay) html = injectJayScript(html);
  if (injectInference && hasInlineInferenceMount(html)) html = injectInferenceScript(html);

  await writeFile(fullPath, html, "utf8");
}

async function processJsonFile(fullPath) {
  const rawJson = await readFile(fullPath, "utf8");
  const parsed = JSON.parse(rawJson);
  const sanitized = sanitizeJsonValue(parsed);
  if (JSON.stringify(sanitized) === JSON.stringify(parsed)) {
    return;
  }
  await writeFile(fullPath, `${JSON.stringify(sanitized, null, 2)}\n`, "utf8");
}

async function removeMetadataFile(fullPath) {
  await rm(fullPath, {force: true, recursive: true});
}

async function main() {
  const allFiles = await walkDirectory(OBSERVABLE_ROOT);
  const metadataFiles = allFiles.filter((filePath) => isMacosMetadataPath(filePath));
  const publicFiles = allFiles.filter((filePath) => !isMacosMetadataPath(filePath));
  const htmlFiles = publicFiles.filter((filePath) => filePath.endsWith(".html"));
  const jsonFiles = publicFiles.filter((filePath) => filePath.endsWith(".json"));
  const injectJay = await jayBundleExists();
  const injectInference = await inferenceBundleExists();

  for (const metadataFile of metadataFiles) {
    await removeMetadataFile(metadataFile);
  }

  for (const htmlFile of htmlFiles) {
    await processHtmlFile(htmlFile, injectJay, injectInference);
  }

  for (const jsonFile of jsonFiles) {
    await processJsonFile(jsonFile);
  }

  const notes = ["theme init injection"];
  if (injectJay) notes.push("Jay injection");
  if (injectInference) notes.push("inline inference injection");
  if (jsonFiles.length > 0) notes.push(`JSON sanitization for ${jsonFiles.length} files`);
  if (metadataFiles.length > 0) notes.push(`removed ${metadataFiles.length} macOS metadata artifact(s)`);
  const suffix = notes.length > 0 ? ` (with ${notes.join(" + ")})` : "";
  console.log(`Post-processed Observable export HTML (${htmlFiles.length} files)${suffix}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
