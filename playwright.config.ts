import {defineConfig} from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  use: {
    baseURL: "http://127.0.0.1:4321"
  },
  webServer: {
    command: "npm run verify:observable && npm run build && python3 -m http.server 4321 --directory dist",
    url: "http://127.0.0.1:4321",
    reuseExistingServer: !process.env.CI,
    timeout: 240_000
  }
});
