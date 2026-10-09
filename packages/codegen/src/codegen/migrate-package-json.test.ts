import { packageJsonExports } from "@powerhousedao/shared/clis/constants";
import type { PackageJson } from "read-pkg";
import { describe, expect, it } from "vitest";
import { migratedPackageJson } from "./migrate.js";

// A project generated before `ph build` stopped building subgraphs for the
// browser, with the exports its package.json was given then.
const generatedBefore = {
  name: "legacy-project",
  version: "1.2.3",
  exports: {
    ".": {
      types: "./dist/types/index.d.ts",
      browser: "./dist/browser/index.js",
      node: "./dist/node/index.mjs",
    },
    "./subgraphs": {
      types: "./dist/types/subgraphs/index.d.ts",
      browser: "./dist/browser/subgraphs/index.js",
      node: "./dist/node/subgraphs/index.mjs",
    },
  },
  scripts: { custom: "echo custom" },
  dependencies: { leftover: "1.0.0" },
} as unknown as PackageJson;

describe("migratedPackageJson", () => {
  const migrated = migratedPackageJson(generatedBefore, {
    peerDependencies: { "document-model": "1.0.0" },
    devDependencies: { "@powerhousedao/ph-cli": "1.0.0" },
  });

  it("drops the browser build of ./subgraphs, which ph build no longer emits", () => {
    expect(migrated.exports).toEqual(packageJsonExports);
    expect(
      (migrated.exports as Record<string, Record<string, string>>)[
        "./subgraphs"
      ],
    ).toEqual({
      types: "./dist/types/subgraphs/index.d.ts",
      node: "./dist/node/subgraphs/index.mjs",
    });
  });

  it("keeps the project's own fields and scripts and drops runtime dependencies", () => {
    expect(migrated).toMatchObject({
      name: "legacy-project",
      version: "1.2.3",
      type: "module",
      peerDependencies: { "document-model": "1.0.0" },
      devDependencies: { "@powerhousedao/ph-cli": "1.0.0" },
    });
    expect(migrated.scripts).toHaveProperty("custom", "echo custom");
    expect(migrated).not.toHaveProperty("dependencies");
  });
});
