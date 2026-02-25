import {defineConfig} from "vite";
import {svelte} from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  publicDir: false,
  plugins: [svelte({compilerOptions: {css: "injected"}})],
  build: {
    lib: {
      entry: "src/components/mushbot/standalone.ts",
      formats: ["iife"],
      name: "Mushbot",
      fileName: () => "mushbot-standalone.js",
    },
    outDir: "public/observable/_import",
    emptyOutDir: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  define: {
    "import.meta.env.PUBLIC_MUSHBOT_API": "undefined",
  },
});
