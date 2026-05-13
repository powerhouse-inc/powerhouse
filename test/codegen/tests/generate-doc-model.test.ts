import { describe, expect, test } from "bun:test";
import { basename, join } from "node:path";
import {
  DATA,
  NEW_PROJECT,
  SPEC_VERSION_1,
  SPEC_VERSION_2,
  SPEC_VERSION_3,
  TEST_OUTPUT,
  WITH_DOCUMENT_MODELS_SPEC_1,
  WITH_DOCUMENT_MODELS_SPEC_2,
} from "../constants.js";
import {
  cpForce,
  loadDocumentModelsInDir,
  mkdirRecursive,
  rmForce,
  runTsc,
} from "../utils.js";

const parentOutDir = join(TEST_OUTPUT, "generate-doc-model");
await rmForce(parentOutDir);
await mkdirRecursive(parentOutDir);

async function runDocumentModelTests(args: {
  testOutputParentDir: string;
  inDirName: string;
  specDirName: string;
}) {
  const { inDirName, specDirName, testOutputParentDir } = args;
  const outDir = join(
    testOutputParentDir,
    `${basename(inDirName)}-${basename(specDirName)}`,
  );
  console.log({
    outDir,
    inDirName,
    specDirName,
    testOutputParentDir,
  });
  await rmForce(outDir);
  await cpForce(inDirName, outDir);
  await loadDocumentModelsInDir(specDirName, outDir);
  await runTsc(outDir);
  return outDir;
}

describe("versioned document models", () => {
  describe("v1", () => {
    test("should generate new document models as v1", async () => {
      await runDocumentModelTests({
        inDirName: NEW_PROJECT,
        specDirName: SPEC_VERSION_1,
        testOutputParentDir: parentOutDir,
      });
    });
    test("should persist existing reducers, tests, utils, and custom files when generating for the same spec version", async () => {
      await runDocumentModelTests({
        inDirName: WITH_DOCUMENT_MODELS_SPEC_1,
        specDirName: join(DATA, "spec-version-1-with-more-operations"),
        testOutputParentDir: parentOutDir,
      });
    });
  });
  describe("v2", () => {
    test("should handle generating document models as v2", async () => {
      const testOutDir = await runDocumentModelTests({
        inDirName: NEW_PROJECT,
        specDirName: SPEC_VERSION_2,
        testOutputParentDir: parentOutDir,
      });

      const v1ModulePath = join(
        testOutDir,
        "document-models",
        "test-doc",
        "v1",
        "module.ts",
      );
      const v2ModulePath = join(
        testOutDir,
        "document-models",
        "test-doc",
        "v2",
        "module.ts",
      );

      const v1ModuleContent = await Bun.file(v1ModulePath).text();
      const v2ModuleContent = await Bun.file(v2ModulePath).text();

      expect(v1ModuleContent).toContain("version: 1,");
      expect(v2ModuleContent).toContain("version: 2,");
    });
    test("should persist existing reducers, tests, utils, and custom files when generating a new spec version", async () => {
      await runDocumentModelTests({
        inDirName: WITH_DOCUMENT_MODELS_SPEC_1,
        specDirName: SPEC_VERSION_2,
        testOutputParentDir: parentOutDir,
      });
    });

    test("should throw a typescript error in upgrades when new state does not match old state", () => {
      expect(
        async () =>
          await runDocumentModelTests({
            inDirName: WITH_DOCUMENT_MODELS_SPEC_1,
            specDirName: join(DATA, "spec-version-2-with-state-changes"),
            testOutputParentDir: parentOutDir,
          }),
      ).toThrow();
    });
  });

  describe("v3", () => {
    test("should handle generating document models as v3", async () => {
      await runDocumentModelTests({
        inDirName: NEW_PROJECT,
        specDirName: SPEC_VERSION_3,
        testOutputParentDir: parentOutDir,
      });
    });

    test("should persist existing reducers, tests, utils, and custom files when generating a new spec version", async () => {
      await runDocumentModelTests({
        inDirName: WITH_DOCUMENT_MODELS_SPEC_2,
        specDirName: SPEC_VERSION_3,
        testOutputParentDir: parentOutDir,
      });
    });

    test("should throw a typescript error in upgrades when new state does not match old state", () => {
      expect(
        async () =>
          await runDocumentModelTests({
            inDirName: WITH_DOCUMENT_MODELS_SPEC_2,
            specDirName: join(DATA, "spec-version-3-with-state-changes"),
            testOutputParentDir: parentOutDir,
          }),
      ).toThrow();
    });
  });
});
