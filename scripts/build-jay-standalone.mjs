import {build} from "vite";
import {readFile, writeFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_FILE = path.join(PROJECT_ROOT, "public/observable/_import/jay-standalone.js");

await build({
  root: PROJECT_ROOT,
  configFile: path.join(PROJECT_ROOT, "vite.config.jay.ts"),
  logLevel: "warn",
});

const output = await readFile(OUTPUT_FILE, "utf8");
await writeFile(OUTPUT_FILE, `${output.trimEnd()}\n`, "utf8");

console.log("Built jay-standalone.js → public/observable/_import/");
