import {readdir, readFile, writeFile, access} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const OBSERVABLE_ROOT = path.join(PROJECT_ROOT, "public/observable");
const MUSHBOT_BUNDLE = path.join(OBSERVABLE_ROOT, "_import/mushbot-standalone.js");

const PROJECT_ROOT_PATH_CHECK = /^\/projects(?:\/index\.html)?\/?$/;
const LEGACY_PROJECT_ROOT_PATH_CHECK = /^\/projects\/?$/;

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

function injectMushbotScript(html) {
  const tag = `<script src="/observable/_import/mushbot-standalone.js" defer><\/script>`;
  html = html.replace(/<script[^>]*mushbot-standalone\.js[^>]*><\/script>\n?/g, "");
  if (html.includes("</head>")) {
    return html.replace("</head>", `${tag}\n</head>`);
  }
  return html;
}

async function mushbotBundleExists() {
  try {
    await access(MUSHBOT_BUNDLE);
    return true;
  } catch {
    return false;
  }
}

async function processHtmlFile(fullPath, injectMushbot) {
  const relativePath = path.relative(OBSERVABLE_ROOT, fullPath);
  let html = await readFile(fullPath, "utf8");

  html = upsertBaseHref(html, getCanonicalBaseHref(relativePath));
  html = normalizeProjectRootMatcher(html);
  if (injectMushbot) html = injectMushbotScript(html);

  await writeFile(fullPath, html, "utf8");
}

async function main() {
  const allFiles = await walkDirectory(OBSERVABLE_ROOT);
  const htmlFiles = allFiles.filter((filePath) => filePath.endsWith(".html"));
  const injectMushbot = await mushbotBundleExists();

  for (const htmlFile of htmlFiles) {
    await processHtmlFile(htmlFile, injectMushbot);
  }

  const mushbotNote = injectMushbot ? " (with Mushbot injection)" : "";
  console.log(`Post-processed Observable export HTML (${htmlFiles.length} files)${mushbotNote}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
