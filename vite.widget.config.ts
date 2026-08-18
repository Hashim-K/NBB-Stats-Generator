import { resolve } from "node:path";

import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist/site",
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, "src/widget/index.ts"),
      formats: ["iife"],
      name: "NBBStatsWidget",
      fileName: () => "nbb-stats-widget.js",
    },
    minify: "esbuild",
    sourcemap: true,
  },
});
