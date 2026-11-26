import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ALL_POWERHOUSE_DEPENDENCIES,
  DEFAULT_RENOWN_URL,
} from "./constants.js";

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

describe("root build script", () => {
  it("builds every published package (an unbuilt package publishes an EMPTY tarball)", () => {
    // @powerhousedao/desktop@6.2.3-dev.57 shipped with no dist because the
    // root `build` script is a hand-maintained --filter list and the new
    // package was missing from it. The release packs whatever is on disk, so
    // the omission is silent until an install fails at runtime.
    const rootManifest = JSON.parse(
      readFileSync(join(REPO_ROOT, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    const buildScript = rootManifest.scripts.build;
    const missing = publishedWorkspacePackages().filter(
      (name) => !buildScript.includes(`--filter=${name} `),
    );
    expect(missing).toEqual([]);
  });
});

/**
 * Every built-in default Renown address is DEFAULT_RENOWN_URL, so switching
 * Renown is one edit and a forgotten copy fails here. Source code imports the
 * constant; the files that cannot (static configs, generated schemas) are
 * listed and must carry its value. Tests, their fixtures and the Academy
 * (which describes releases) are not defaults and are not read.
 */
describe("DEFAULT_RENOWN_URL", () => {
  // The two addresses the default switches between: Renown in production,
  // and renown.id on staging until it runs in production.
  const ADDRESS = /https:\/\/(?:www\.renown\.id|renown-staging\.vetra\.io)/g;
  const DEFINITION = "packages/shared/constants.ts";
  const COPIES: Record<string, string> = {
    "apps/connect/public/powerhouse.config.json": "edit it",
    "packages/clint-common/powerhouse.config.json": "edit it",
    "packages/builder-tools/connect-utils/runtime-config.schema.json":
      "pnpm tsx scripts/emit-schemas.ts",
    "packages/shared/clis/source-config.schema.json":
      "pnpm tsx scripts/emit-schemas.ts",
    "clis/ph-cli/schemas/runner-connect.schema.json":
      "pnpm --filter @powerhousedao/ph-cli emit-schemas",
  };
  const SCANNED_ROOTS = ["apps", "clis", "packages"];
  const SCANNED_FILE = /\.(?:[cm]?[jt]sx?|json|ya?ml|html)$/;
  const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
  const SKIPPED_DIRECTORIES = new Set([
    "node_modules",
    "dist",
    "build",
    "coverage",
    "storybook-static",
    "test-results",
    "playwright-report",
    "test",
    "tests",
    "e2e",
    "fixtures",
    "__fixtures__",
    "__snapshots__",
  ]);
  const SKIPPED_PATHS = new Set(["apps/academy"]);
  const LARGEST_SCANNED_FILE = 2_000_000;

  /** Repo-relative path of every scanned file that spells an address. */
  function spellings(): Map<string, string[]> {
    const found = new Map<string, string[]>();
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(REPO_ROOT, dir), {
        withFileTypes: true,
      })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          const skip =
            entry.name.startsWith(".") ||
            SKIPPED_DIRECTORIES.has(entry.name) ||
            SKIPPED_PATHS.has(path);
          if (!skip) walk(path);
          continue;
        }
        if (!entry.isFile() || !SCANNED_FILE.test(entry.name)) continue;
        if (TEST_FILE.test(entry.name)) continue;
        const file = join(REPO_ROOT, path);
        if (statSync(file).size > LARGEST_SCANNED_FILE) continue;
        const text = readFileSync(file, "utf8");
        if (!text.includes("renown")) continue;
        const matches = text.match(ADDRESS);
        if (matches) found.set(path, matches);
      }
    };
    for (const root of SCANNED_ROOTS) walk(root);
    return found;
  }

  let found: Map<string, string[]>;
  // A fraction of a second warm; a cold Windows checkout reads slower.
  beforeAll(() => {
    found = spellings();
  }, 60_000);

  it("is spelled only where it is defined and in the listed copies", () => {
    expect(found.get(DEFINITION)).toContain(DEFAULT_RENOWN_URL);
    const elsewhere = [...found.keys()].filter(
      (path) => path !== DEFINITION && !(path in COPIES),
    );
    expect(
      elsewhere,
      "import DEFAULT_RENOWN_URL (@powerhousedao/shared/constants) instead",
    ).toEqual([]);
  });

  it.each(Object.entries(COPIES))("%s carries it (%s)", (path, fix) => {
    const addresses = found.get(path) ?? [];
    expect(addresses.length, `${path} names no Renown; ${fix}`).toBeGreaterThan(
      0,
    );
    expect(
      addresses.filter((address) => address !== DEFAULT_RENOWN_URL),
      `${path} is behind DEFAULT_RENOWN_URL; ${fix}`,
    ).toEqual([]);
  });
});
