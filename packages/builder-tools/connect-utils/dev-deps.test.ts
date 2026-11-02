import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { connectOptimizeDeps, dependencyStoreOf } from "./dev-deps.js";
import {
  CONNECT_ROUTE_FILE_DEPS,
  CORE_ROUTE_TREE_SPECIFIER,
  ROUTE_TREE_SPECIFIER,
} from "./vite-plugins/connect-routes.js";

const require = createRequire(import.meta.url);
const packageDir = (name: string) =>
  dirname(require.resolve(`${name}/package.json`));

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));

// Route files import each other by package name; those are source, not deps.
const ROUTE_FILE = /^@powerhousedao\/connect(-core)?\/routes\//;

describe("CONNECT_ROUTE_FILE_DEPS", () => {
  it("pre-bundles every package Connect's and core's route files import", () => {
    const routeDirs = [
      join(packageDir("@powerhousedao/connect"), "src/routes"),
      join(packageDir("@powerhousedao/connect-core"), "src/routes"),
    ];
    const imported = new Set(
      routeDirs
        .flatMap(sourceFiles)
        .filter((file) => !file.endsWith(".gen.ts"))
        .flatMap((file) =>
          [
            ...readFileSync(file, "utf8").matchAll(
              /^import (?!type )[^"]*"([^".][^"]*)";$/gm,
            ),
          ].map((match) => match[1]),
        )
        .filter((specifier) => !ROUTE_FILE.test(specifier)),
    );
    expect(imported.size).toBeGreaterThan(0);
    expect(CONNECT_ROUTE_FILE_DEPS).toEqual(
      expect.arrayContaining([...imported]),
    );
  });

  it("keeps the route tree out of pre-bundled deps, as live project modules", () => {
    expect(
      connectOptimizeDeps("/p", false, []).rolldownOptions?.external,
    ).toEqual([ROUTE_TREE_SPECIFIER, CORE_ROUTE_TREE_SPECIFIER]);
  });

  it("scans the project's route files beside index.html", () => {
    expect(
      connectOptimizeDeps("/p", "/p/hosts/lab/routes", []).entries,
    ).toEqual(["index.html", "hosts/lab/routes/**/*.{js,jsx,ts,tsx}"]);
    expect(connectOptimizeDeps("/p", false, []).entries).toBeUndefined();
  });
});

describe("dependencyStoreOf", () => {
  const at = (...parts: string[]) => [""].concat(parts).join(sep);

  it("is the outermost node_modules of a pnpm install", () => {
    expect(
      dependencyStoreOf(
        at("p", "node_modules", ".pnpm", "c@1", "node_modules", "@ph", "c"),
      ),
    ).toBe(at("p", "node_modules"));
  });

  it("is the node_modules of a flat install", () => {
    expect(dependencyStoreOf(at("p", "node_modules", "@ph", "c"))).toBe(
      at("p", "node_modules"),
    );
  });

  it("is null for a workspace link", () => {
    expect(dependencyStoreOf(at("repo", "apps", "connect"))).toBeNull();
  });
});
