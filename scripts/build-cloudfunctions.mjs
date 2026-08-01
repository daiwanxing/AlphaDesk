/**
 * 云函数：只维护 .ts，部署前编译为 CommonJS .js（CloudBase Node 运行时入口）
 *
 * 用法：
 *   pnpm cf:build  — 编译（bundle index.ts，打入同目录相对模块）
 *   pnpm cf:clean  — 删除生成的 .js
 *   pnpm cf:typecheck
 */
import { readdirSync, statSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const cfRoot = join(root, "cloudfunctions");

function listFunctionDirs() {
  return readdirSync(cfRoot).filter((name) => {
    if (name.startsWith(".") || name.startsWith("_")) return false;
    const p = join(cfRoot, name);
    return (
      statSync(p).isDirectory() &&
      existsSync(join(p, "package.json")) &&
      existsSync(join(p, "index.ts"))
    );
  });
}

function cleanFunctionJs(fnDir) {
  for (const f of readdirSync(fnDir)) {
    if (f.endsWith(".js")) rmSync(join(fnDir, f));
  }
}

function cleanAll() {
  for (const name of listFunctionDirs()) {
    cleanFunctionJs(join(cfRoot, name));
    console.log(`[cf:clean] ${name}`);
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

  console.log(`[cf:build] ${name}: index.ts → index.js (bundled)`);
}

async function main() {
  const mode = process.argv[2] === "clean" ? "clean" : "build";
  if (mode === "clean") {
    cleanAll();
    console.log("[cf:clean] done");
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
  console.log(`[cf:build] done (${dirs.length} functions)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
