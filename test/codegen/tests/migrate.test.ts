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
    await runTsc(legacyDocumentModelsDir);
  });
});
