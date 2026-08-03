import path from "node:path";
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { createApiMiddleware } from "./server/api/middleware.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const browserTargets = ["chrome121", "edge121", "firefox122", "safari17.3", "ios17.3"] as const;

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    {
      name: "investor-api",
      configureServer(server) {
        server.middlewares.use(createApiMiddleware());
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@contracts": path.resolve(__dirname, "packages/contracts"),
    },
  },
  build: {
    target: [...browserTargets],
    cssTarget: [...browserTargets],
  },
  server: {
    proxy: {
      // 单一前缀：/cloudbase/get-events → 网关 /get-events（加函数只改 path，不改 proxy）
      "/cloudbase": {
        target: "https://trader-d4gl4d7a1cb6baebb-1301814349.tcloudbaseapp.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/cloudbase/, "") || "/",
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
    exclude: [...configDefaults.exclude, "**/.worktrees/**"],
  },
});
