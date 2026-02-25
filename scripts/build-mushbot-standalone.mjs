import {build} from "vite";
import {fileURLToPath} from "node:url";
import path from "node:path";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await build({
  root: PROJECT_ROOT,
  configFile: path.join(PROJECT_ROOT, "vite.config.mushbot.ts"),
  logLevel: "warn",
});

console.log("Built mushbot-standalone.js → public/observable/_import/");
