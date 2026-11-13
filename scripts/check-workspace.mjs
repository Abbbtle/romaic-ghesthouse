/**
 * Checks that every package the app imports resolves from this project's own
 * node_modules, never from a parent folder's. This project sits inside the
 * Weberu agency's project folder, which has its own node_modules; Node and
 * Next.js look for packages in parent folders when one is missing here, so a
 * missing dependency could silently load the parent's copy.
 *
 *   node scripts/check-workspace.mjs
 *
 * Exits 1 and lists every package that isn't installed here.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
const importPattern = /(?:import|export)\s[^"']*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g;

function* sourceFiles(directory) {
  for (const name of readdirSync(directory)) {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) yield* sourceFiles(full);
    else if (/\.(ts|tsx|mts|mjs|js)$/.test(name)) yield full;
  }
}

/** "@scope/name/sub" → "@scope/name"; "name/sub" → "name". */
function packageOf(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

const packages = new Map();
const roots = ["src", "scripts"].map((folder) => path.join(root, folder)).concat([path.join(root, "next.config.ts")]);
for (const start of roots) {
  const files = statSync(start).isDirectory() ? [...sourceFiles(start)] : [start];
  for (const file of files) {
    for (const match of readFileSync(file, "utf8").matchAll(importPattern)) {
      const specifier = match[1] ?? match[2] ?? match[3];
      if (!specifier || specifier.startsWith(".") || specifier.startsWith("@/") || builtins.has(specifier)) continue;
      const name = packageOf(specifier);
      if (!packages.has(name)) packages.set(name, path.relative(root, file));
    }
  }
}

const missing = [...packages].filter(([name]) => !existsSync(path.join(root, "node_modules", name, "package.json")));
const declared = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const listed = new Set([...Object.keys(declared.dependencies ?? {}), ...Object.keys(declared.devDependencies ?? {})]);
const undeclared = [...packages.keys()].filter((name) => !listed.has(name) && !["next", "react", "react-dom"].includes(name) && !name.startsWith("@types/"));

console.log(`Checked ${packages.size} packages imported by src/, scripts/ and next.config.ts against ${path.join(root, "node_modules")}.`);
if (missing.length > 0) {
  console.error("Not installed in this project (they would resolve from a parent folder, or not at all):");
  for (const [name, file] of missing) console.error(`  ${name} (first imported by ${file})`);
}
if (undeclared.length > 0) console.warn(`Imported but not in package.json (transitive): ${undeclared.join(", ")}`);
process.exitCode = missing.length > 0 ? 1 : 0;
if (missing.length === 0) console.log("Every import resolves from this project's own node_modules.");
