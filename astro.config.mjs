import {defineConfig} from "astro/config";
import svelte from "@astrojs/svelte";

export default defineConfig({
  site: "https://jbmopper.github.io",
  output: "static",
  integrations: [svelte()]
});
