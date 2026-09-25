import { migrate } from "@powerhousedao/codegen";
import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { updatePackage } from "write-package";
import { TEST_OUTPUT, WITH_EDITORS } from "../constants.js";
import { cpForce, mkdirRecursive, rmForce, runTsc } from "../utils.js";
const parentOutDir = join(TEST_OUTPUT, "migrate");
await rmForce(parentOutDir);
await mkdirRecursive(parentOutDir);

describe("migrate", () => {
  test("non-versioned document models to versioned", async () => {
    const outDir = join(parentOutDir, "document-model-versioning");
    const legacyDocumentModelsDir = join(outDir, "legacy");
    const versionedDocumentModelsDir = join(outDir, "versioned");
    await cpForce(WITH_EDITORS, legacyDocumentModelsDir);
    await cpForce(WITH_EDITORS, versionedDocumentModelsDir);
    // A secondary tsconfig with options TypeScript 7 removed.
    const extraTsconfig = join(legacyDocumentModelsDir, "tsconfig.node.json");
    writeFileSync(
      extraTsconfig,
      JSON.stringify({
        compilerOptions: { baseUrl: ".", moduleResolution: "node" },
      }),
    );
    const version = "dev";
    await migrate(version, legacyDocumentModelsDir);
    const migrated = JSON.parse(readFileSync(extraTsconfig, "utf8")) as {
      compilerOptions: Record<string, unknown>;
    };
    expect(migrated.compilerOptions.baseUrl).toBeUndefined();
    expect(migrated.compilerOptions.moduleResolution).toBe("bundler");
    await updatePackage(legacyDocumentModelsDir, {
      exports: null,
    });
    // Remove the locally-installed document-model and @powerhousedao/shared so
    // tsc resolves them from the monorepo workspace node_modules instead. The
    // registry version lags behind the workspace — the generated code uses
    // baseLoadFromInputVersioned which is present in the workspace build.
    await rmForce(
      join(legacyDocumentModelsDir, "node_modules", "document-model"),
    );
    await rmForce(
      join(legacyDocumentModelsDir, "node_modules", "@powerhousedao", "shared"),
    );
    await runTsc(legacyDocumentModelsDir);
  });
});
