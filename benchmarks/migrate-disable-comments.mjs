#!/usr/bin/env node
// Codemod: rewrite eslint-disable rule references that need a new
// identifier under oxlint. Conservative: only the rules whose name
// changed, not the ones oxlint already accepts under their original
// ESLint id.
//
// What this rewrites:
//   react-hooks/set-state-in-effect   → react-hooks-extra/set-state-in-effect
//   react-hooks/incompatible-library  → react-hooks-extra/incompatible-library
//   react-hooks/static-components     → react-hooks-extra/static-components
//
// What this LEAVES ALONE (oxlint already honors both names):
//   @typescript-eslint/*  — oxlint accepts as alias for typescript/*
//   react-hooks/rules-of-hooks, exhaustive-deps  — native, same name
//   eslint core rules (no-unused-vars, etc.)
//
// Run with: node benchmarks/migrate-disable-comments.mjs [--dry]

import fs from "node:fs";
import path from "node:path";

const RENAMES = {
  "react-hooks/set-state-in-effect": "react-hooks-extra/set-state-in-effect",
  "react-hooks/incompatible-library": "react-hooks-extra/incompatible-library",
  "react-hooks/static-components": "react-hooks-extra/static-components",
};

const dryRun = process.argv.includes("--dry");
const exts = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"]);
const skipDirs = new Set([
  "node_modules",
  "dist",
  "build",
  ".tsbuild",
  "ts-build",
  ".nx",
  ".vite",
  ".docusaurus",
  "coverage",
  ".out",
  ".test-output",
  "playwright-report",
  ".pnpm",
]);

let filesScanned = 0;
let filesChanged = 0;
let totalReplacements = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".github") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      walk(full);
    } else if (entry.isFile() && exts.has(path.extname(entry.name))) {
      processFile(full);
    }
  }
}

function processFile(file) {
  filesScanned++;
  const src = fs.readFileSync(file, "utf8");
  if (!/eslint-disable|oxlint-disable/.test(src)) return;
  let out = src;
  let count = 0;
  for (const [from, to] of Object.entries(RENAMES)) {
    // Match the rule name only when it appears as a comma-/space-/end-of-line
    // separated token after eslint-disable or oxlint-disable.
    const re = new RegExp(
      "((?:eslint|oxlint)-disable(?:-next-line|-line)?[^\\n*/]*?)" +
        from.replace(/\//g, "\\/") +
        "(?=$|[,\\s*/\\)\\]])",
      "g",
    );
    out = out.replace(re, (_, lead) => {
      count++;
      return lead + to;
    });
  }
  if (count > 0) {
    filesChanged++;
    totalReplacements += count;
    if (!dryRun) fs.writeFileSync(file, out);
    console.log(`${dryRun ? "[dry] " : ""}${file}  (${count} replacement${count > 1 ? "s" : ""})`);
  }
}

walk(process.cwd());

console.log(
  `\n${dryRun ? "[dry] " : ""}scanned ${filesScanned} files, ${filesChanged} changed, ${totalReplacements} total replacements`,
);
