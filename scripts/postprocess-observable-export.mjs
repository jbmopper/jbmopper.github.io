import {readdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const OBSERVABLE_ROOT = path.join(PROJECT_ROOT, "public/observable");

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

async function processHtmlFile(fullPath) {
  const relativePath = path.relative(OBSERVABLE_ROOT, fullPath);
  let html = await readFile(fullPath, "utf8");

  html = upsertBaseHref(html, getCanonicalBaseHref(relativePath));
  html = normalizeProjectRootMatcher(html);

  await writeFile(fullPath, html, "utf8");
}

async function main() {
  const allFiles = await walkDirectory(OBSERVABLE_ROOT);
  const htmlFiles = allFiles.filter((filePath) => filePath.endsWith(".html"));

  for (const htmlFile of htmlFiles) {
    await processHtmlFile(htmlFile);
  }

  console.log(`Post-processed Observable export HTML (${htmlFiles.length} files).`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
