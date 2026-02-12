import {stat} from "node:fs/promises";
import path from "node:path";

const PROJECT_ROOT = "/Users/juliusmopper/Dev/jbmopper.github.io";
const required = [
  "public/observable/embed/nsys.js",
  "public/observable/embed/benchmarks.js",
  "public/observable/_observablehq",
  "public/observable/_file"
];

async function assertExists(relativePath) {
  const absolutePath = path.join(PROJECT_ROOT, relativePath);
  try {
    await stat(absolutePath);
  } catch (error) {
    throw new Error(`Missing Observable artifact: ${relativePath} (${error.message})`);
  }
}

async function main() {
  for (const item of required) {
    await assertExists(item);
  }
  console.log("Observable artifact check passed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
