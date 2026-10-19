import {
  FEATURE_DEPENDENCIES,
  VERSIONED_DEV_DEPENDENCIES,
  VERSIONED_PEER_DEPENDENCIES,
} from "@powerhousedao/shared/clis/constants";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WORKSPACE_PUBLISH_PACKAGES } from "../src/helpers/workspace.js";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const WORKSPACE_DIRS = [
  "apps",
  "clis",
  "packages",
  "packages/analytics-engine",
];

type Manifest = {
  name?: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

function workspaceManifests(): Map<string, Manifest> {
  const manifests = new Map<string, Manifest>();
  for (const dir of WORKSPACE_DIRS) {
    for (const entry of readdirSync(path.join(ROOT, dir))) {
      const file = path.join(ROOT, dir, entry, "package.json");
      if (!existsSync(file)) continue;
      const manifest = JSON.parse(readFileSync(file, "utf-8")) as Manifest;
      if (manifest.name) manifests.set(manifest.name, manifest);
    }
  }
  return manifests;
}

/** `roots` and every workspace package they depend on or peer, transitively. */
function workspaceClosure(roots: readonly string[]): Set<string> {
  const manifests = workspaceManifests();
  const seen = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const name = queue.pop()!;
    const manifest = manifests.get(name);
    if (!manifest || seen.has(name)) continue;
    seen.add(name);
    const deps = { ...manifest.dependencies, ...manifest.peerDependencies };
    for (const dep of Object.keys(deps)) {
      if (manifests.has(dep)) queue.push(dep);
    }
  }
  return seen;
}

describe("WORKSPACE_PUBLISH_PACKAGES", () => {
  it("publishes every workspace package a scaffolded project installs", () => {
    const roots = [
      ...VERSIONED_PEER_DEPENDENCIES,
      ...VERSIONED_DEV_DEPENDENCIES,
      ...Object.values(FEATURE_DEPENDENCIES).flatMap((feature) => [
        ...feature.peerVersioned,
        ...feature.devVersioned,
      ]),
    ];
    const published = new Set<string>(WORKSPACE_PUBLISH_PACKAGES);
    const missing = [...workspaceClosure(roots)].filter(
      (name) => !published.has(name),
    );
    expect(missing).toEqual([]);
  });
});
