/**
 * 云函数：只维护 .ts，部署前编译为 CommonJS .js（CloudBase Node 运行时入口）
 *
 * 用法：
 *   pnpm cf:build  — 编译（bundle index.ts，打入同目录相对模块）
 *   pnpm cf:clean  — 删除生成的 .js
 *   pnpm cf:typecheck
 */
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { functionNames } from "./cloudfunctions-manifest.mjs";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const cfRoot = join(root, "cloudfunctions");

function listFunctionDirs() {
  return [...functionNames("http"), ...functionNames("event")];
}

function cleanFunctionJs(fnDir) {
  for (const f of readdirSync(fnDir)) {
    if (f.endsWith(".js")) rmSync(join(fnDir, f));
  }
}

function cleanAll() {
  for (const name of listFunctionDirs()) {
    cleanFunctionJs(join(cfRoot, name));
    process.stdout.write(`[cf:clean] ${name}\n`);
  }
}

async function buildOne(name) {
  const fnDir = join(cfRoot, name);
  cleanFunctionJs(fnDir);

  await esbuild.build({
    entryPoints: [join(fnDir, "index.ts")],
    outfile: join(fnDir, "index.js"),
    bundle: true,
    platform: "node",
    target: "node18",
    format: "cjs",
    packages: "external",
    sourcemap: false,
    logLevel: "info",
  });

  process.stdout.write(`[cf:build] ${name}: index.ts → index.js (bundled)\n`);
}

async function main() {
  const mode = process.argv[2] === "clean" ? "clean" : "build";
  if (mode === "clean") {
    cleanAll();
    process.stdout.write("[cf:clean] done\n");
    return;
  }

  const dirs = listFunctionDirs();
  if (dirs.length === 0) {
    console.error("[cf:build] no cloudfunctions found");
    process.exit(1);
  }
  for (const name of dirs) {
    await buildOne(name);
  }
  process.stdout.write(`[cf:build] done (${dirs.length} functions)\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
