import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  type TestContext,
} from "vitest";
import { generateDocumentModel } from "../generate.js";
import { loadDocumentModel } from "../utils.js";
import { USE_TS_MORPH } from "./config.js";
import {
  DOCUMENT_MODELS_TEST_PROJECT,
  GENERATE_DOC_MODEL_TEST_OUTPUT_DIR,
  TEST_PACKAGE_NAME,
} from "./constants.js";
import { runGeneratedTests } from "./fixtures/run-generated-tests.js";
import {
  copyAllFiles,
  getTestDataDir,
  getTestOutDirPath,
  getTestOutputDir,
  purgeDirAfterTest,
  resetDirForTest,
} from "./utils.js";
import { compile } from "./fixtures/typecheck.js";

describe("document model", () => {
  const testDir = import.meta.dirname;
  const outDirName = getTestOutputDir(
    testDir,
    GENERATE_DOC_MODEL_TEST_OUTPUT_DIR,
  );
  const testDataDir = getTestDataDir(testDir, DOCUMENT_MODELS_TEST_PROJECT);

  let testOutDirPath = getTestOutDirPath("initial", outDirName);
  const documentModelsSrcPath = path.join(testDir, "data", "document-models");
  let documentModelsDirName = path.join(testOutDirPath, "document-models");
  async function setupTest(context: TestContext, dataDir = testDataDir) {
    testOutDirPath = getTestOutDirPath(context.task.name, outDirName);

    await copyAllFiles(dataDir, testOutDirPath);

    documentModelsDirName = path.join(testOutDirPath, "document-models");

    process.chdir(testOutDirPath);
  }

  beforeEach(async (context) => {
    await setupTest(context);
  });

  beforeAll(() => {
    resetDirForTest(outDirName);
  });

  afterAll(() => {
    purgeDirAfterTest(outDirName);
  });

  const generate = async () => {
    const billingStatementDocumentModel = await loadDocumentModel(
      path.join(
        documentModelsSrcPath,
        "billing-statement",
        "billing-statement.json",
      ),
    );

    await generateDocumentModel({
      dir: documentModelsDirName,
      specifiedPackageName: TEST_PACKAGE_NAME,
      documentModelState: billingStatementDocumentModel,
      useTsMorph: USE_TS_MORPH,
      useVersioning: false,
      skipFormat: true,
    });

    const testDocDocumentModel = await loadDocumentModel(
      path.join(documentModelsSrcPath, "test-doc", "test-doc.json"),
    );

    await generateDocumentModel({
      useTsMorph: USE_TS_MORPH,
      useVersioning: false,
      dir: documentModelsDirName,
      specifiedPackageName: TEST_PACKAGE_NAME,
      documentModelState: testDocDocumentModel,
      skipFormat: true,
    });
  };

  it(
    "should generate a document model",
    {
      timeout: 100000,
    },
    async (context) => {
      await setupTest(context);
      await generate();
      await compile(testOutDirPath);
      await runGeneratedTests(testOutDirPath);
    },
  );

  it(
    "should generate a document model when previous document models exist",
    {
      timeout: 100000,
    },
    async (context) => {
      const dataDirOverride = getTestDataDir(
        testDir,
        "document-models-test-project-with-existing-document-models",
      );
      await setupTest(context, dataDirOverride);
      await generate();
      await compile(testOutDirPath);
      await runGeneratedTests(testOutDirPath);
    },
  );

  it(
    "should create the document-models.ts file if it does not exist",
    {
      timeout: 100000,
    },
    async (context) => {
      await setupTest(context);
      const documentModelsFilePath = path.join(
        documentModelsDirName,
        "document-models.ts",
      );

      rmSync(documentModelsFilePath, { force: true });

      await generate();
      await compile(testOutDirPath);

      const documentModelsContent = readFileSync(
        documentModelsFilePath,
        "utf-8",
      );

      // Check that both models are exported
      expect(documentModelsContent).toContain(
        `import { BillingStatement } from "./billing-statement/module.js";`,
      );
      expect(documentModelsContent).toContain(
        `import { TestDoc } from "./test-doc/module.js";`,
      );
      expect(documentModelsContent).toContain(
        "export const documentModels: DocumentModelModule<any>[] = [",
      );
      expect(documentModelsContent).toContain("BillingStatement");
      expect(documentModelsContent).toContain("TestDoc");
      expect(documentModelsContent).toContain("]");
    },
  );

  it(
    "should generate multiple document models and export both in document-models.ts",
    {
      timeout: 100000,
    },
    async (context) => {
      await setupTest(context);
      await generate();
      await compile(testOutDirPath);

      const documentModelsFilePath = path.join(
        documentModelsDirName,
        "document-models.ts",
      );
      const documentModelsContent = readFileSync(
        documentModelsFilePath,
        "utf-8",
      );

      // Check that both models are exported
      expect(documentModelsContent).toContain(
        `import { BillingStatement } from "./billing-statement/module.js";`,
      );
      expect(documentModelsContent).toContain(
        `import { TestDoc } from "./test-doc/module.js";`,
      );
      expect(documentModelsContent).toContain(
        "export const documentModels: DocumentModelModule<any>[] = [",
      );
      expect(documentModelsContent).toContain("BillingStatement");
      expect(documentModelsContent).toContain("TestDoc");
      expect(documentModelsContent).toContain("]");
    },
  );

  it(
    "should generate an updated version of test-doc",
    { timeout: 100000 },
    async (context) => {
      await setupTest(context);
      await generate();
      await compile(testOutDirPath);

      const testDocDocumentModelV2 = await loadDocumentModel(
        path.join(
          documentModelsSrcPath,
          "..",
          "test-doc-versions",
          "test-doc-v2",
          "test-doc.json",
        ),
      );

      // TODO: this is a hack to get the test to pass, we should be able to update the reducer file once is generated
      // remove .out/document-model/test-doc/src/reducers/base-operations.ts file
      rmSync(
        path.join(
          documentModelsDirName,
          "test-doc",
          "src",
          "reducers",
          "base-operations.ts",
        ),
        { force: true },
      );

      await generateDocumentModel({
        useTsMorph: USE_TS_MORPH,
        useVersioning: false,
        dir: documentModelsDirName,
        specifiedPackageName: TEST_PACKAGE_NAME,
        documentModelState: testDocDocumentModelV2,
        skipFormat: true,
      });

      // expect .out/document-model/test-doc/src/reducers/base-operations.ts to contain setTestIdOperation, setTestNameOperation, setTestDescriptionOperation and setTestValueOperation
      const baseOperationsPath = path.join(
        documentModelsDirName,
        "test-doc",
        "src",
        "reducers",
        "base-operations.ts",
      );
      const baseOperationsContent = readFileSync(baseOperationsPath, "utf-8");
      expect(baseOperationsContent).toContain("setTestIdOperation");
      expect(baseOperationsContent).toContain("setTestNameOperation");
      expect(baseOperationsContent).toContain("setTestDescriptionOperation");
      expect(baseOperationsContent).toContain("setTestValueOperation");
    },
  );

  it(
    "should generate error classes and types from billing statement errors",
    { timeout: 100000 },
    async (context) => {
      await setupTest(context);
      await generate();
      await compile(testOutDirPath);

      // Check general module errors
      const generalErrorPath = path.join(
        documentModelsDirName,
        "billing-statement",
        "gen",
        "general",
        "error.ts",
      );
      const generalErrorContent = readFileSync(generalErrorPath, "utf-8");

      // Check that InvalidStatusTransition error is generated
      expect(generalErrorContent).toContain("export type ErrorCode =");
      expect(generalErrorContent).toContain(`"InvalidStatusTransition"`);
      expect(generalErrorContent).toContain(
        "export class InvalidStatusTransition extends Error implements ReducerError",
      );
      expect(generalErrorContent).toContain(
        `errorCode = "InvalidStatusTransition" as ErrorCode`,
      );

      // Check line_items module errors
      const lineItemsErrorPath = path.join(
        documentModelsDirName,
        "billing-statement",
        "gen",
        "line-items",
        "error.ts",
      );
      const lineItemsErrorContent = readFileSync(lineItemsErrorPath, "utf-8");

      // Check that both DuplicateLineItem and InvalidStatusTransition errors are generated (but deduplicated)
      expect(lineItemsErrorContent).toContain("export type ErrorCode =");
      expect(lineItemsErrorContent).toContain(`"DuplicateLineItem"`);
      expect(lineItemsErrorContent).toContain(`"InvalidStatusTransition"`);
      expect(lineItemsErrorContent).toContain(
        "export class DuplicateLineItem extends Error implements ReducerError",
      );
      expect(lineItemsErrorContent).toContain(
        "export class InvalidStatusTransition extends Error implements ReducerError",
      );

      // Verify that InvalidStatusTransition only appears once in the ErrorCode type (deduplication test)
      const errorCodeMatches = lineItemsErrorContent.match(
        /"InvalidStatusTransition"/g,
      );
      expect(errorCodeMatches?.length).toBe(3); // Once in type definition, once in each class
    },
  );

  it(
    "should generate error codes for legacy documents with empty error codes",
    { timeout: 100000 },
    async (context) => {
      await setupTest(context);
      await generate();

      const testEmptyCodesDocumentModel = await loadDocumentModel(
        path.join(
          documentModelsSrcPath,
          "test-empty-error-codes",
          "test-empty-error-codes.json",
        ),
      );

      await generateDocumentModel({
        useTsMorph: USE_TS_MORPH,
        useVersioning: false,
        dir: documentModelsDirName,
        specifiedPackageName: TEST_PACKAGE_NAME,
        documentModelState: testEmptyCodesDocumentModel,
        skipFormat: true,
      });

      // Check that error codes are generated from error names
      const testOperationsErrorPath = path.join(
        documentModelsDirName,
        "test-empty-codes",
        "gen",
        "test-operations",
        "error.ts",
      );
      const testOperationsErrorContent = readFileSync(
        testOperationsErrorPath,
        "utf-8",
      );

      // Check that error codes are generated from names in PascalCase when empty
      expect(testOperationsErrorContent).toContain("export type ErrorCode =");
      expect(testOperationsErrorContent).toContain(`"InvalidValue"`);
      expect(testOperationsErrorContent).toContain(`"EmptyValue"`);

      // Check that error classes are generated
      expect(testOperationsErrorContent).toContain(
        "export class InvalidValue extends Error implements ReducerError",
      );
      expect(testOperationsErrorContent).toContain(
        "export class EmptyValue extends Error implements ReducerError",
      );

      // Verify error code constants are set properly in PascalCase
      expect(testOperationsErrorContent).toContain(
        `errorCode = "InvalidValue" as ErrorCode`,
      );
      expect(testOperationsErrorContent).toContain(
        `errorCode = "EmptyValue" as ErrorCode`,
      );
    },
  );
});
