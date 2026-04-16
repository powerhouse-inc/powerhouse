import { migrate } from "@powerhousedao/codegen";
import { describe, test } from "bun:test";
import { join } from "path";
import { TEST_OUTPUT, TEST_PROJECTS, WITH_EDITORS } from "../constants.js";
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
    await cpForce(join(testProjectsDir, WITH_EDITORS), legacyDocumentModelsDir);
    await cpForce(
      join(testProjectsDir, WITH_EDITORS),
      versionedDocumentModelsDir,
    );
    const version = "dev";
    await migrate(version, legacyDocumentModelsDir);
    await runTsc(legacyDocumentModelsDir);
  });
});
