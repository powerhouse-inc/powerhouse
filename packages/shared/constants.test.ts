import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALL_POWERHOUSE_DEPENDENCIES } from "./constants.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
// Mirrors RELEASE_PROJECT_GLOBS in releases/release.ts.
const RELEASE_DIRS = ["packages", "packages/analytics-engine", "clis", "apps"];

function publishedWorkspacePackages() {
  const names: string[] = [];
  for (const dir of RELEASE_DIRS) {
    for (const entry of readdirSync(join(REPO_ROOT, dir), {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory()) continue;
      let manifest: { name?: string; private?: boolean };
      try {
        manifest = JSON.parse(
          readFileSync(
            join(REPO_ROOT, dir, entry.name, "package.json"),
            "utf8",
          ),
        ) as typeof manifest;
      } catch {
        continue;
      }
      if (manifest.name && !manifest.private) names.push(manifest.name);
    }
  }
  return names;
}

describe("ALL_POWERHOUSE_DEPENDENCIES", () => {
  it("includes every package the monorepo publishes", () => {
    const published = publishedWorkspacePackages();
    expect(published).toContain("@powerhousedao/pieces-framework");
    expect(published).toContain("@powerhousedao/workflow");
    const missing = published.filter(
      (name) => !ALL_POWERHOUSE_DEPENDENCIES.includes(name),
    );
    expect(missing).toEqual([]);
  });

  it("has no duplicates", () => {
    expect(new Set(ALL_POWERHOUSE_DEPENDENCIES).size).toBe(
      ALL_POWERHOUSE_DEPENDENCIES.length,
    );
  });
});
