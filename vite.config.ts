import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

import { createApiMiddleware } from "./server/middleware";

function nbbApiPlugin(): Plugin {
  return {
    name: "nbb-stats-generator-api",
    configureServer(server) {
      // The middleware performs its own path check. Registering it at a
      // Connect mount path would strip that prefix before it sees the URL.
      server.middlewares.use(createApiMiddleware());
    },
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
  return {
    plugins: [react(), nbbApiPlugin()],
    build: {
      outDir: "dist/site",
      emptyOutDir: true,
    },
    server: {
      host: "0.0.0.0",
      port: 4173,
    },
  };
});
