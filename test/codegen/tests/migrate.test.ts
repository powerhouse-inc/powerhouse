import { migrate } from "@powerhousedao/codegen";
import { describe, test } from "bun:test";
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
    const version = "dev";
    await migrate(version, legacyDocumentModelsDir);
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
