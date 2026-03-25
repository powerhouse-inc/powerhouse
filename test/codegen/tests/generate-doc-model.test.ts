import { $ } from "bun";
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Project, ts } from "ts-morph";
import {
  DATA,
  DOCUMENT_MODELS,
  SPEC_VERSION_1,
  SPEC_VERSION_2,
  SPEC_VERSION_3,
  TEST_OUTPUT,
  TEST_PROJECT,
  WITH_DOCUMENT_MODELS,
  WITH_DOCUMENT_MODELS_SPEC_1,
  WITH_DOCUMENT_MODELS_SPEC_2,
} from "../constants.js";
import { cpForce, loadDocumentModelsInDir, rmForce } from "../utils.js";

const testOutputDir = join(process.cwd(), TEST_OUTPUT);
const testsDataDir = join(process.cwd(), DATA);

async function runDocumentModelTests(args: {
  testsDataDir: string;
  testOutputParentDir: string;
  useVersioning?: boolean;
  inDirName: string;
  specDirName: string;
}) {
  const {
    inDirName,
    specDirName,
    testsDataDir,
    testOutputParentDir,
    useVersioning = true,
  } = args;
  const dataDir = join(testsDataDir, inDirName);
  const documentModelsInDir = join(testsDataDir, specDirName);
  const outDir = join(testOutputParentDir, `${inDirName}-${specDirName}`);
  await rmForce(outDir);
  await cpForce(dataDir, outDir);
  await loadDocumentModelsInDir(documentModelsInDir, outDir, useVersioning);
  await $`bun run --cwd ${outDir} tsc --noEmit`;
  return outDir;
}

async function checkFileContents(outDir: string) {
  const project = new Project({
    tsConfigFilePath: join(outDir, "tsconfig.json"),
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    skipLoadingLibFiles: true,
  });
  project.addSourceFilesAtPaths(join(outDir, "document-models/**/*"));

  const documentModelsFile = project.getSourceFileOrThrow("document-models.ts");
  const documentModelsArray = documentModelsFile
    .getVariableStatementOrThrow("documentModels")
    .getDescendantsOfKind(ts.SyntaxKind.ArrayLiteralExpression)
    .at(0);

  const elements = documentModelsArray!
    .getElements()
    .map((e) => e.getText())
    .join(" ");
  expect(elements).toContain("BillingStatement");
  expect(elements).toContain("TestDoc");

  const billingStatementErrorFile = await Bun.file(
    join(
      outDir,
      "document-models",
      "billing-statement",
      "gen",
      "general",
      "error.ts",
    ),
  ).text();
  expect(billingStatementErrorFile).toContain("export type ErrorCode");
  expect(billingStatementErrorFile).toContain(`"InvalidStatusTransition"`);
  expect(billingStatementErrorFile).toContain(
    "export class InvalidStatusTransition extends Error implements ReducerError",
  );
  expect(billingStatementErrorFile).toContain(
    `errorCode = "InvalidStatusTransition" as ErrorCode`,
  );

  const lineItemsErrorFile = await Bun.file(
    join(
      outDir,
      "document-models",
      "billing-statement",
      "gen",
      "line-items",
      "error.ts",
    ),
  ).text();

  expect(lineItemsErrorFile).toContain("export type ErrorCode =");
  expect(lineItemsErrorFile).toContain(`"DuplicateLineItem"`);
  expect(lineItemsErrorFile).toContain(`"InvalidStatusTransition"`);
  expect(lineItemsErrorFile).toContain(
    "export class DuplicateLineItem extends Error implements ReducerError",
  );
  expect(lineItemsErrorFile).toContain(
    "export class InvalidStatusTransition extends Error implements ReducerError",
  );

  const errorCodeMatches = lineItemsErrorFile.match(
    /"InvalidStatusTransition"/g,
  );
  expect(errorCodeMatches?.length).toBe(3);
}

describe("generate doc model", () => {
  const testOutputParentDir = join(testOutputDir, "generate-doc-model");
  const useVersioning = false;
  test("generate document models", async () => {
    const outDir = await runDocumentModelTests({
      inDirName: TEST_PROJECT,
      specDirName: DOCUMENT_MODELS,
      testOutputParentDir,
      testsDataDir,
      useVersioning,
    });
    await checkFileContents(outDir);
  });
  test("generate document models in existing project", async () => {
    const outDir = await runDocumentModelTests({
      inDirName: WITH_DOCUMENT_MODELS,
      specDirName: DOCUMENT_MODELS,
      testOutputParentDir,
      testsDataDir,
      useVersioning,
    });
    await checkFileContents(outDir);
  });
});

describe("versioned document models", () => {
  const testOutputParentDir = join(testOutputDir, "versioned-document-models");
  describe("v1", () => {
    test("should generate new document models as v1", async () => {
      await runDocumentModelTests({
        inDirName: TEST_PROJECT,
        specDirName: SPEC_VERSION_1,
        testOutputParentDir,
        testsDataDir,
      });
    });
    test("should persist existing reducers, tests, utils, and custom files when generating for the same spec version", async () => {
      await runDocumentModelTests({
        inDirName: WITH_DOCUMENT_MODELS_SPEC_1,
        specDirName: "spec-version-1-with-more-operations",
        testOutputParentDir,
        testsDataDir,
      });
    });
  });
  describe("v2", () => {
    test("should handle generating document models as v2", async () => {
      const testOutDir = await runDocumentModelTests({
        inDirName: TEST_PROJECT,
        specDirName: SPEC_VERSION_2,
        testOutputParentDir,
        testsDataDir,
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
        testsDataDir,
      });
    });

    test("should throw a typescript error in upgrades when new state does not match old state", () => {
      expect(
        async () =>
          await runDocumentModelTests({
            inDirName: WITH_DOCUMENT_MODELS_SPEC_1,
            specDirName: "spec-version-2-with-state-changes",
            testOutputParentDir,
            testsDataDir,
          }),
      ).toThrow();
    });
  });

  describe("v3", () => {
    test("should handle generating document models as v3", async () => {
      await runDocumentModelTests({
        inDirName: TEST_PROJECT,
        specDirName: SPEC_VERSION_3,
        testOutputParentDir,
        testsDataDir,
      });
    });

    test("should persist existing reducers, tests, utils, and custom files when generating a new spec version", async () => {
      await runDocumentModelTests({
        inDirName: WITH_DOCUMENT_MODELS_SPEC_2,
        specDirName: SPEC_VERSION_3,
        testOutputParentDir,
        testsDataDir,
      });
    });

    test("should throw a typescript error in upgrades when new state does not match old state", () => {
      expect(
        async () =>
          await runDocumentModelTests({
            inDirName: WITH_DOCUMENT_MODELS_SPEC_2,
            specDirName: "spec-version-3-with-state-changes",
            testOutputParentDir,
            testsDataDir,
          }),
      ).toThrow();
    });
  });
});
