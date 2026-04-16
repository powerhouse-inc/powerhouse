import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  DATA,
  DOCUMENT_MODELS,
  NEW_PROJECT,
  SPEC_VERSION_1,
  SPEC_VERSION_2,
  SPEC_VERSION_3,
  TEST_OUTPUT,
  TEST_PROJECTS,
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

const parentOutDir = join(process.cwd(), TEST_OUTPUT, "generate-doc-model");
const testProjectsDir = join(process.cwd(), TEST_PROJECTS);
const dataDir = join(process.cwd(), DATA);
await rmForce(parentOutDir);
await mkdirRecursive(parentOutDir);

async function runDocumentModelTests(args: {
  testsDataDir: string;
  testOutputParentDir: string;
  inDirName: string;
  specDirName: string;
}) {
  const { inDirName, specDirName, testsDataDir, testOutputParentDir } = args;
  const testProjectDir = join(testProjectsDir, inDirName);
  const documentModelsInDir = join(testsDataDir, specDirName);
  const outDir = join(testOutputParentDir, `${inDirName}-${specDirName}`);
  await rmForce(outDir);
  await cpForce(testProjectDir, outDir);
  await loadDocumentModelsInDir(documentModelsInDir, outDir);
  await runTsc(outDir);
  return outDir;
}

describe("versioned document models", () => {
  const testOutputParentDir = join(parentOutDir, "versioned-document-models");
  describe("v1", () => {
    test("should generate new document models as v1", async () => {
      await runDocumentModelTests({
        inDirName: NEW_PROJECT,
        specDirName: SPEC_VERSION_1,
        testOutputParentDir,
        testsDataDir: dataDir,
      });
    });
    test("should persist existing reducers, tests, utils, and custom files when generating for the same spec version", async () => {
      await runDocumentModelTests({
        inDirName: WITH_DOCUMENT_MODELS_SPEC_1,
        specDirName: "spec-version-1-with-more-operations",
        testOutputParentDir,
        testsDataDir: dataDir,
      });
    });
  });
  describe("v2", () => {
    test("should handle generating document models as v2", async () => {
      const testOutDir = await runDocumentModelTests({
        inDirName: NEW_PROJECT,
        specDirName: SPEC_VERSION_2,
        testOutputParentDir,
        testsDataDir: dataDir,
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
        testOutputParentDir,
        testsDataDir: dataDir,
      });
    });

    test("should throw a typescript error in upgrades when new state does not match old state", () => {
      expect(
        async () =>
          await runDocumentModelTests({
            inDirName: WITH_DOCUMENT_MODELS_SPEC_1,
            specDirName: "spec-version-2-with-state-changes",
            testOutputParentDir,
            testsDataDir: dataDir,
          }),
      ).toThrow();
    });
  });

  describe("v3", () => {
    test("should handle generating document models as v3", async () => {
      await runDocumentModelTests({
        inDirName: NEW_PROJECT,
        specDirName: SPEC_VERSION_3,
        testOutputParentDir,
        testsDataDir: dataDir,
      });
    });

    test("should persist existing reducers, tests, utils, and custom files when generating a new spec version", async () => {
      await runDocumentModelTests({
        inDirName: WITH_DOCUMENT_MODELS_SPEC_2,
        specDirName: SPEC_VERSION_3,
        testOutputParentDir,
        testsDataDir: dataDir,
      });
    });

    test("should throw a typescript error in upgrades when new state does not match old state", () => {
      expect(
        async () =>
          await runDocumentModelTests({
            inDirName: WITH_DOCUMENT_MODELS_SPEC_2,
            specDirName: "spec-version-3-with-state-changes",
            testOutputParentDir,
            testsDataDir: dataDir,
          }),
      ).toThrow();
    });
  });
});
