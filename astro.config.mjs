import {defineConfig} from "astro/config";
import svelte from "@astrojs/svelte";

export default defineConfig({
  site: "https://juliusm.com",
  output: "static",
  integrations: [svelte()]
});
