import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A packaged app vendors this package and what it depends on, so anything added
 * to that tree is files on every install, and Windows installs slowly by file.
 * These are what a host runs without, and need only someone to depend on them
 * for 20,000 files to come back: move one to an optional peer instead, as
 * switchboard does with vetra and vite, for a path only a developer reaches.
 */
const NOT_ON_THE_RUN_PATH = [
  "@babel/core",
  "@powerhousedao/builder-tools",
  "@powerhousedao/codegen",
  "@powerhousedao/connect",
  "@powerhousedao/design-system",
  "@powerhousedao/ph-cli",
  "@powerhousedao/reactor-browser",
  "@powerhousedao/vetra",
  "esbuild",
  "lightningcss",
  "prettier",
  "rolldown",
  "tailwindcss",
  "ts-morph",
  "tsdown",
  "vite",
];

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

interface Manifest {
  name: string;
  dependencies?: Record<string, string>;
}

function workspacePackages(): Map<string, Manifest> {
  const manifests = new Map<string, Manifest>();
  const look = (dir: string, depth: number) => {
    const file = join(dir, "package.json");
    if (existsSync(file)) {
      const manifest = JSON.parse(readFileSync(file, "utf8")) as Manifest;
      if (manifest.name) manifests.set(manifest.name, manifest);
    }
    if (depth === 0) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== "node_modules") {
        look(join(dir, entry.name), depth - 1);
      }
    }
  };
  for (const top of ["apps", "clis", "packages"]) look(join(ROOT, top), 2);
  return manifests;
}

/** Every workspace package this one depends on, and what brought each. */
function runPath(manifests: Map<string, Manifest>): Map<string, string[]> {
  const chains = new Map([
    ["@powerhousedao/ph-run", ["@powerhousedao/ph-run"]],
  ]);
  const queue = ["@powerhousedao/ph-run"];
  for (const name of queue) {
    for (const dependency of Object.keys(
      manifests.get(name)?.dependencies ?? {},
    )) {
      if (chains.has(dependency) || !manifests.has(dependency)) continue;
      chains.set(dependency, [...(chains.get(name) ?? []), dependency]);
      queue.push(dependency);
    }
  }
  return chains;
}

describe("the run path", () => {
  const manifests = workspacePackages();
  const chains = runPath(manifests);

  it("takes in the packages it's meant to", () => {
    expect(chains.has("@powerhousedao/switchboard")).toBe(true);
    expect(chains.has("@powerhousedao/reactor-api")).toBe(true);
    expect(chains.has("@powerhousedao/workflow")).toBe(true);
  });

  it("depends on no build tool, however far down", () => {
    const found: string[] = [];
    for (const [name, chain] of chains) {
      for (const dependency of Object.keys(
        manifests.get(name)?.dependencies ?? {},
      )) {
        if (NOT_ON_THE_RUN_PATH.includes(dependency)) {
          found.push([...chain, dependency].join(" -> "));
        }
      }
    }
    expect(found).toEqual([]);
  });
});
