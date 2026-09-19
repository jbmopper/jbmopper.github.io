import {defineConfig} from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  use: {
    baseURL: "http://127.0.0.1:4321"
  },
  webServer: {
    command: "npm run verify:observable && npm run build && python3 scripts/serve-dist.py 4321",
    url: "http://127.0.0.1:4321",
    reuseExistingServer: !process.env.CI,
    timeout: 240_000
  }
});
