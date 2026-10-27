import {
  packageJsonExports,
  packageScripts,
} from "@powerhousedao/shared/clis/constants";
import type { PackageJson } from "read-pkg";
import { packageJsonTemplate } from "templates";
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
  scripts: { custom: "echo custom", tsc: "tsc && tsc -p hosts" },
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

describe("the lint scripts", () => {
  it("generate the Connect route tree before the type-checked lint, in new and migrated projects", () => {
    const migrated = migratedPackageJson(generatedBefore, {});
    const scaffolded = JSON.parse(
      packageJsonTemplate("new-project", {}, {}),
    ) as {
      scripts: Record<string, string>;
    };

    for (const script of ["lint", "lint:fix"] as const) {
      expect(migrated.scripts?.[script]).toMatch(
        /^ph-cli generate connect-routes && oxlint --type-aware --type-check/,
      );
      expect(scaffolded.scripts[script]).toBe(packageScripts[script]);
    }
  });
});

describe("the tsc script", () => {
  it("generates the Connect route tree before tsc, in new and migrated projects", () => {
    const migrated = migratedPackageJson(generatedBefore, {});
    const scaffolded = JSON.parse(
      packageJsonTemplate("new-project", {}, {}),
    ) as {
      scripts: Record<string, string>;
    };

    expect(migrated.scripts?.tsc).toBe("ph-cli generate connect-routes && tsc");
    expect(scaffolded.scripts.tsc).toBe(packageScripts.tsc);
  });
});
