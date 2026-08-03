import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultManifestPath = join(repoRoot, "cloudfunctions", "functions.json");
const defaultFunctionsRoot = join(repoRoot, "cloudfunctions");

function readGroup(value, group) {
  if (
    !Array.isArray(value) ||
    value.some((name) => typeof name !== "string" || name.length === 0)
  ) {
    throw new Error(`cloud function manifest group "${group}" must be a non-empty string array`);
  }
  return [...value];
}

export function loadFunctionManifest(filePath = defaultManifestPath) {
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  return {
    http: readGroup(parsed.http, "http"),
    event: readGroup(parsed.event, "event"),
  };
}

export function discoverFunctionDirs(functionsRoot = defaultFunctionsRoot) {
  return readdirSync(functionsRoot)
    .filter((name) => {
      if (name.startsWith(".") || name.startsWith("_")) return false;
      const functionDir = join(functionsRoot, name);
      return (
        statSync(functionDir).isDirectory() &&
        existsSync(join(functionDir, "package.json")) &&
        existsSync(join(functionDir, "index.ts"))
      );
    })
    .sort();
}

export function validateFunctionManifest(manifest, functionDirs) {
  const groups = ["http", "event"];
  const listed = groups.flatMap((group) => manifest[group]);
  const duplicates = listed.filter((name, index) => listed.indexOf(name) !== index);
  const unknown = listed.filter((name) => !functionDirs.includes(name));
  const missing = functionDirs.filter((name) => !listed.includes(name));

  if (duplicates.length > 0) {
    throw new Error(`cloud function manifest contains duplicate function: ${duplicates[0]}`);
  }
  if (unknown.length > 0) {
    throw new Error(`cloud function manifest contains unknown function: ${unknown[0]}`);
  }
  if (missing.length > 0) {
    throw new Error(`cloud function manifest is missing function: ${missing[0]}`);
  }

  return {
    http: [...manifest.http],
    event: [...manifest.event],
  };
}

export function functionNames(group) {
  const manifest = loadFunctionManifest();
  const validated = validateFunctionManifest(manifest, discoverFunctionDirs());
  if (!(group in validated)) {
    throw new Error(`unknown cloud function group: ${group}`);
  }
  return validated[group];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const group = process.argv[2];
  if (!group) {
    throw new Error("usage: node scripts/cloudfunctions-manifest.mjs <http|event>");
  }
  process.stdout.write(`${functionNames(group).join("\n")}\n`);
}
