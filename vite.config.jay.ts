import {defineConfig} from "vite";
import {svelte} from "@sveltejs/vite-plugin-svelte";

function envLiteral(value: string | undefined): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}

export default defineConfig({
  publicDir: false,
  plugins: [svelte({compilerOptions: {css: "injected"}})],
  build: {
    lib: {
      entry: "src/components/jay/standalone.ts",
      formats: ["iife"],
      name: "Jay",
      fileName: () => "jay-standalone.js",
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
    "import.meta.env.PUBLIC_AWS_SERVERLESS_API": envLiteral(process.env.PUBLIC_AWS_SERVERLESS_API),
    "import.meta.env.PUBLIC_TURNSTILE_SITE_KEY": envLiteral(process.env.PUBLIC_TURNSTILE_SITE_KEY),
  },
});
