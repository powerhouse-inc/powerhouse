import { migrate } from "@powerhousedao/codegen";
import { describe, test } from "bun:test";
import { join } from "path";
import {
  TEST_OUTPUT,
  TEST_PROJECTS,
  WITH_DOCUMENT_MODELS_SPEC_1,
  WITH_LEGACY_UNVERSIONED_DOCUMENT_MODELS,
} from "../constants.js";
import { cpForce, mkdirRecursive, rmForce, runTsc } from "../utils.js";

const cwd = process.cwd();
const parentOutDir = join(cwd, TEST_OUTPUT, "migrate");
const testProjectsDir = join(cwd, TEST_PROJECTS);
await rmForce(parentOutDir);
await mkdirRecursive(parentOutDir);

describe("migrate", () => {
  test("non-versioned document models to versioned", async () => {
    const outDir = join(parentOutDir, "document-model-versioning");
    const legacyDocumentModelsDir = join(outDir, "legacy");
    const versionedDocumentModelsDir = join(outDir, "versioned");
    await cpForce(
      join(testProjectsDir, WITH_LEGACY_UNVERSIONED_DOCUMENT_MODELS),
      legacyDocumentModelsDir,
    );
    await cpForce(
      join(testProjectsDir, WITH_DOCUMENT_MODELS_SPEC_1),
      versionedDocumentModelsDir,
    );
    const version = "dev";
    await migrate(version, legacyDocumentModelsDir);
    await runTsc(legacyDocumentModelsDir);
  });
});
