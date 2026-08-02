import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
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
    tailwindcss(),
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
    },
  },
  build: {
    target: [...browserTargets],
    cssTarget: [...browserTargets],
  },
  server: {
    proxy: {
      // 同源代理，绕过 CloudBase 网关 ACAO 拼成 "origin,*" 的浏览器 CORS 失败
      "/cloudbase-briefs": {
        target: "https://trader-d4gl4d7a1cb6baebb-1301814349.tcloudbaseapp.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/cloudbase-briefs/, "/get-briefs"),
      },
      "/cloudbase-backfill": {
        target: "https://trader-d4gl4d7a1cb6baebb-1301814349.tcloudbaseapp.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/cloudbase-backfill/, "/trigger-backfill"),
      },
      "/cloudbase-events": {
        target: "https://trader-d4gl4d7a1cb6baebb-1301814349.tcloudbaseapp.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/cloudbase-events/, "/get-events"),
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
  },
});
