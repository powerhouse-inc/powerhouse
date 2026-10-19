#!/usr/bin/env node
/**
 * First manual publish of a new monorepo package, with the lockstep guards
 * that prevent the "dependencies one behind" manifest.
 *
 * Why it exists: `pnpm publish` rewrites `workspace:*` pins from the versions
 * on DISK. Publishing a new package right after a nightly — before pulling the
 * nightly's version-bump commit — packs a manifest whose own version matches
 * the release but whose sibling pins are one dev number behind (seen on
 * reactor-router@6.2.3-dev.51, which pinned shared/reactor/document-model at
 * dev.50). Trusted publishing requires the first publish to be manual, so the
 * workflow cannot guard this; this script does.
 *
 * Usage: node scripts/publish-first.mjs <package-dir> [pnpm publish args...]
 *   e.g. node scripts/publish-first.mjs packages/clint --auth-type=web
 * Flags: --offline skips the registry freshness check (NOT recommended).
 *
 * Checks, then runs `pnpm publish --access public` in the package dir:
 *   1. the target is public (no `private`, publishConfig.access "public");
 *   2. LOCKSTEP: every non-private workspace package on disk has the same
 *      version as the target (a mixed tree is mid-merge or mid-bump);
 *   3. FRESHNESS: the registry's `dev` dist-tag for a published sibling is
 *      not newer than the disk version (a newer registry means a nightly
 *      bumped after this checkout — pull the bump commit first).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const [, , targetDirArg, ...rest] = process.argv;
const offline = rest.includes("--offline");
const publishArgs = rest.filter((a) => a !== "--offline");

function fail(message) {
  console.error(`\npublish-first: ${message}`);
  process.exit(1);
}

if (!targetDirArg) {
  fail("usage: node scripts/publish-first.mjs <package-dir> [publish args]");
}

const root = process.cwd();
const targetDir = path.resolve(root, targetDirArg);
const targetManifestPath = path.join(targetDir, "package.json");
if (!fs.existsSync(targetManifestPath)) {
  fail(`${targetDirArg} has no package.json`);
}
const target = JSON.parse(fs.readFileSync(targetManifestPath, "utf8"));

// 1. publishable
if (target.private)
  fail(`${target.name} is still "private": true — flip it first`);
if (target.publishConfig?.access !== "public") {
  fail(`${target.name} lacks publishConfig.access "public"`);
}

// 2. lockstep across the workspace (same globs as nx.json release.projects)
const globs = ["packages", "packages/analytics-engine", "clis", "apps"];
const members = [];
for (const base of globs) {
  const dir = path.join(root, base);
  if (!fs.existsSync(dir)) continue;
  for (const entry of fs.readdirSync(dir)) {
    const manifestPath = path.join(dir, entry, "package.json");
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (!manifest.name || manifest.private) continue;
    members.push({ name: manifest.name, version: manifest.version });
  }
}
const offLockstep = members.filter((m) => m.version !== target.version);
if (offLockstep.length > 0) {
  fail(
    `lockstep violated — ${target.name} is ${target.version} but:\n` +
      offLockstep.map((m) => `  ${m.name} ${m.version}`).join("\n") +
      `\nThe tree is mid-bump or mid-merge; publishing now would pin stale versions.`,
  );
}

// 3. registry freshness: compare a published sibling's dev tag to disk
if (!offline) {
  const sibling =
    members.find((m) => m.name === "@powerhousedao/shared") ??
    members.find((m) => m.name !== target.name);
  const view = spawnSync(`npm view ${sibling.name}@dev version --json`, {
    shell: true,
    encoding: "utf8",
    windowsHide: true,
  });
  if (view.status !== 0) {
    fail(
      `could not read the registry (${sibling.name}@dev) — fix connectivity or pass --offline:\n` +
        view.stderr.slice(-300),
    );
  }
  const registryDev = JSON.parse(view.stdout.trim());
  if (registryDev !== sibling.version) {
    fail(
      `stale checkout — registry has ${sibling.name}@dev = ${registryDev}, disk has ${sibling.version}.\n` +
        `A nightly released after this checkout: pull the version-bump commit, then retry.\n` +
        `(Publishing now is exactly how pins end up one version behind.)`,
    );
  }
}

console.log(
  `publish-first: ${target.name}@${target.version} — lockstep ok (${members.length} packages)` +
    (offline ? ", registry check SKIPPED (--offline)" : ", registry fresh"),
);

const publish = spawnSync(
  `pnpm publish --access public ${publishArgs.join(" ")}`.trim(),
  { cwd: targetDir, shell: true, stdio: "inherit", windowsHide: true },
);
process.exit(publish.status ?? 1);
