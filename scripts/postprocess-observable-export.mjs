import {readdir, readFile, writeFile, access, rm} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const OBSERVABLE_ROOT = path.join(PROJECT_ROOT, "public/observable");
const JAY_BUNDLE = path.join(OBSERVABLE_ROOT, "_import/jay-standalone.js");
const INFERENCE_BUNDLE = path.join(OBSERVABLE_ROOT, "_import/inference-standalone.js");
const INFERENCE_MOUNT_CLASS = "jm-inference-mount";
const HEAVY_DATA_LOAD_THRESHOLD_BYTES = 2_000_000;
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

function normalizeConsultingAndResumeLinks(html) {
  const consultingLink = `<a class="portfolio-nav-link" href="/consulting/" onclick="event.preventDefault(); window.location.assign(window.location.origin + '/consulting/');">Consulting</a>`;
  const resumeLink = `<a class="portfolio-nav-link" href="/resume/" onclick="event.preventDefault(); window.location.assign(window.location.origin + '/resume/');">Resume</a>`;
  return html.replace(
    /<a class="portfolio-nav-link"[^>]*onclick="event\.preventDefault\(\); window\.location\.assign\(window\.location\.origin \+ '\/resume\/'\);"[^>]*>(?:Resume Generator|Consulting|Consulting Intake|Intake)<\/a>/g,
    `${consultingLink}${resumeLink}`
  );
}

function stripModulePreloads(html) {
  return html.replace(/^\s*<link rel="modulepreload"[^>]*>\n?/gm, "");
}

function getRegisteredDataBytes(html) {
  const registeredFiles = new Map();
  const registerFilePattern = /registerFile\([^;]*?"path":"([^"]+)"[^;]*?"size":(\d+)\}\);/g;

  for (const match of html.matchAll(registerFilePattern)) {
    registeredFiles.set(match[1], Number(match[2]));
  }

  return Array.from(registeredFiles.values()).reduce((total, size) => total + size, 0);
}

function deferHeavyObservableData(html) {
  const registeredDataBytes = getRegisteredDataBytes(html);
  if (registeredDataBytes < HEAVY_DATA_LOAD_THRESHOLD_BYTES || html.includes("data-heavy-observable-module")) {
    return html;
  }

  const modulePattern = /<script type="module">/;
  if (!modulePattern.test(html)) {
    return html;
  }

  html = html.replace(modulePattern, '<script type="application/x-observable-module" data-heavy-observable-module>');
  html = html.replace(/<html(\s[^>]*)?>/i, (tag) => tag.replace("<html", '<html class="observable-data-deferred"'));

  const dataSize = `${(registeredDataBytes / 1_000_000).toFixed(1)} MB`;
  const gate = `<aside class="observable-data-gate" data-observable-data-gate>
  <strong>Interactive analysis is paused</strong>
  <span>Load ${dataSize} of source data only when you want the charts and calculated values.</span>
  <button type="button" data-observable-data-load>Load interactive analysis</button>
  <span class="observable-data-gate__status" data-observable-data-status role="status" aria-live="polite"></span>
</aside>`;
  html = html.replace(/(<main\b[^>]*id="observablehq-main"[^>]*>)/i, `$1\n${gate}`);

  const loader = `<style>
.observable-data-gate{display:flex;flex-wrap:wrap;align-items:center;gap:.65rem 1rem;margin:0 0 1.5rem;padding:.9rem 1rem;border:1px solid var(--theme-foreground-faintest);border-radius:.45rem;background:var(--theme-background-alt)}
.observable-data-gate strong{font-weight:700}.observable-data-gate span{flex:1 1 24rem}.observable-data-gate button{font:inherit;font-weight:650;padding:.5rem .8rem;border:1px solid currentColor;border-radius:.35rem;color:var(--theme-foreground);background:var(--theme-background);cursor:pointer}.observable-data-gate button:disabled{cursor:wait;opacity:.65}.observable-data-gate__status{flex-basis:100%;font-size:.9rem;color:var(--theme-foreground-muted)}
.observable-data-deferred observablehq-loading{display:none!important}.observable-data-deferred .observablehq--block:has(>observablehq-loading:only-child){display:none}
</style>
<script>
(() => {
  const gate = document.querySelector("[data-observable-data-gate]");
  const button = gate?.querySelector("[data-observable-data-load]");
  const status = gate?.querySelector("[data-observable-data-status]");
  const source = document.querySelector("script[data-heavy-observable-module]");
  const main = document.querySelector("#observablehq-main");
  if (!gate || !button || !status || !source || !main) return;

  let finished = false;
  const finish = (message, failed = false) => {
    if (finished) return;
    finished = true;
    document.documentElement.classList.remove("observable-data-deferred");
    main.removeAttribute("aria-busy");
    status.textContent = message;
    button.hidden = !failed;
    if (failed) button.disabled = true;
  };

  button.addEventListener("click", () => {
    button.disabled = true;
    button.textContent = "Loading…";
    status.textContent = "Downloading and preparing the interactive analysis.";
    main.setAttribute("aria-busy", "true");

    const module = document.createElement("script");
    module.type = "module";
    module.textContent = source.textContent;
    module.addEventListener("error", () => finish("The interactive analysis could not be loaded. Reload the page to try again.", true), {once: true});
    const startedAt = Date.now();
    const check = () => {
      const pending = document.querySelectorAll("observablehq-loading").length;
      const errors = document.querySelectorAll(".observablehq--error").length;
      if (errors > 0) {
        finish("Some interactive elements could not be loaded. Reload the page to try again.", true);
      } else if (pending === 0) {
        finish("Interactive analysis loaded.");
      } else if (Date.now() - startedAt > 120000) {
        finish("The interactive analysis is taking longer than expected; completed elements are available below.");
      } else {
        window.setTimeout(check, 250);
      }
    };
    document.head.appendChild(module);
    check();
  }, {once: true});
})();
<\/script>`;

  return html.replace("</body>", `${loader}\n</body>`);
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

  html = sanitizeHtmlText(html);
  html = upsertBaseHref(html, getCanonicalBaseHref(relativePath));
  html = normalizeProjectRootMatcher(html);
  html = normalizeHeaderHomeLink(html);
  html = normalizeConsultingAndResumeLinks(html);
  html = stripModulePreloads(html);
  html = deferHeavyObservableData(html);
  html = normalizeInferenceMountPaths(html);
  html = ensureConfiguredInferenceMounts(html, relativePath);
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

  const notes = [];
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
