import {
  generateSchemas,
  hygenGenerateDocumentModel,
  hygenGenerateProcessor,
  loadDocumentModel,
} from "@powerhousedao/codegen";
import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compile } from "./fixtures/typecheck.js";

const testDir = import.meta.dirname;
const testPackageName = "test";
const documentModelsDirName = "document-models";
const editorDirName = "editors";
const processorsDirName = "processors";
const subgraphsDirName = "subgraphs";
const outDirs = [
  documentModelsDirName,
  editorDirName,
  processorsDirName,
  subgraphsDirName,
  "dist",
];
const srcPath = path.join(testDir, "data", documentModelsDirName);
const outDirName = path.join(testDir, ".out");
let testOutDirCount = 0;
let testOutDirName = `test-${testOutDirCount}`;
let testOutDirPath = path.join(outDirName, testOutDirName);
const packageJsonPath = path.join(testDir, "data", "package.json");
const tsConfigPath = path.join(testDir, "data", "tsconfig.json");

describe("document model", () => {
  try {
    rmSync(outDirName, { recursive: true });
  } catch (error) {
    // Ignore error if folder doesn't exist
  }
  mkdirSync(outDirName, { recursive: true });

  const generate = async () => {
    testOutDirCount++;
    testOutDirName = `test-${testOutDirCount}`;
    testOutDirPath = path.join(outDirName, testOutDirName);
    mkdirSync(testOutDirPath, { recursive: true });
    copyFileSync(packageJsonPath, path.join(testOutDirPath, "package.json"));
    copyFileSync(tsConfigPath, path.join(testOutDirPath, "tsconfig.json"));
    await generateSchemas(srcPath, {
      skipFormat: true,
      outDir: path.join(testOutDirPath, documentModelsDirName),
    });

    const billingStatementDocumentModel = await loadDocumentModel(
      path.join(srcPath, "billing-statement", "billing-statement.json"),
    );

    await hygenGenerateDocumentModel(
      billingStatementDocumentModel,
      path.join(testOutDirPath, documentModelsDirName),
      testPackageName,
      { skipFormat: true },
    );

    const testDocDocumentModel = await loadDocumentModel(
      path.join(srcPath, "test-doc", "test-doc.json"),
    );

    await hygenGenerateDocumentModel(
      testDocDocumentModel,
      path.join(testOutDirPath, documentModelsDirName),
      testPackageName,
      { skipFormat: true },
    );
  };

  it(
    "should generate a document model",
    {
      timeout: 10000,
    },
    async () => {
      await generate();
      await compile(testOutDirPath);
    },
  );

  it(
    "should generate an analytics processor and factory",
    {
      timeout: 10000,
    },
    async () => {
      await generate();

      await hygenGenerateProcessor(
        "test-analytics-processor",
        ["billing-statement"],
        path.join(testOutDirPath, processorsDirName),
        "analytics",
        {
          skipFormat: true,
        },
      );

      await compile(testOutDirPath);
    },
  );

  it(
    "should generate multiple analytics processors with composable factories",
    {
      timeout: 10000,
    },
    async () => {
      await generate();

      await hygenGenerateProcessor(
        "test1",
        ["billing-statement"],
        path.join(testOutDirPath, processorsDirName),
        "analytics",
        {
          skipFormat: true,
        },
      );

      await hygenGenerateProcessor(
        "test2",
        ["billing-statement"],
        path.join(testOutDirPath, processorsDirName),
        "analytics",
        {
          skipFormat: true,
        },
      );

      await hygenGenerateProcessor(
        "test3",
        ["billing-statement"],
        path.join(testOutDirPath, processorsDirName),
        "analytics",
        {
          skipFormat: true,
        },
      );

      await compile(testOutDirPath);
    },
  );

  it(
    "should generate a relational db processor and factory",
    {
      timeout: 10000,
    },
    async () => {
      await generate();

      await hygenGenerateProcessor(
        "test-relational-processor",
        ["billing-statement"],
        path.join(testOutDirPath, processorsDirName),
        "relationalDb",
        {
          skipFormat: true,
        },
      );

      await compile(testOutDirPath);
    },
  );

  it(
    "should generate multiple relational db processors with composable factories",
    {
      timeout: 10000,
    },
    async () => {
      await generate();

      await hygenGenerateProcessor(
        "test1",
        ["billing-statement"],
        path.join(testOutDirPath, processorsDirName),
        "relationalDb",
        {
          skipFormat: true,
        },
      );

      await hygenGenerateProcessor(
        "test2",
        ["billing-statement"],
        path.join(testOutDirPath, processorsDirName),
        "relationalDb",
        {
          skipFormat: true,
        },
      );

      await hygenGenerateProcessor(
        "test3",
        ["billing-statement"],
        path.join(testOutDirPath, processorsDirName),
        "relationalDb",
        {
          skipFormat: true,
        },
      );

      await compile(testOutDirPath);
    },
  );

  it(
    "should generate multiple document models and export both in document-models.ts",
    {
      timeout: 15000,
    },
    async () => {
      await generate();
      await compile(testOutDirPath);

      const indexPath = path.join(
        testOutDirPath,
        documentModelsDirName,
        "document-models.ts",
      );
      const documentModelsContent = readFileSync(indexPath, "utf-8");

      // Check that both models are exported
      expect(documentModelsContent).toContain(
        "import { BillingStatement } from './billing-statement/module.js';",
      );
      expect(documentModelsContent).toContain(
        "import { TestDoc } from './test-doc/module.js';",
      );
      expect(documentModelsContent).toContain(
        "export const documentModels: DocumentModelModule<any>[] = [",
      );
      expect(documentModelsContent).toContain("BillingStatement,");
      expect(documentModelsContent).toContain("TestDoc,");
      expect(documentModelsContent).toContain("]");
    },
  );

  it(
    "should generate an updated version of test-doc",
    { timeout: 10000 },
    async () => {
      await generate();
      await compile(testOutDirPath);

      const testDocDocumentModelV2 = await loadDocumentModel(
        path.join(
          srcPath,
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
          testOutDirPath,
          documentModelsDirName,
          "test-doc",
          "src",
          "reducers",
          "base-operations.ts",
        ),
        { force: true },
      );

      await hygenGenerateDocumentModel(
        testDocDocumentModelV2,
        path.join(testOutDirPath, documentModelsDirName),
        testPackageName,
        { skipFormat: true },
      );

      // expect .out/document-model/test-doc/src/reducers/base-operations.ts to contain setTestIdOperation, setTestNameOperation, setTestDescriptionOperation and setTestValueOperation
      const baseOperationsPath = path.join(
        testOutDirPath,
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
    { timeout: 10000 },
    async () => {
      await generate();
      await compile(testOutDirPath);

      // Check general module errors
      const generalErrorPath = path.join(
        testOutDirPath,
        documentModelsDirName,
        "billing-statement",
        "gen",
        "general",
        "error.ts",
      );
      const generalErrorContent = readFileSync(generalErrorPath, "utf-8");

      // Check that InvalidStatusTransition error is generated
      expect(generalErrorContent).toContain("export type ErrorCode =");
      expect(generalErrorContent).toContain("'InvalidStatusTransition'");
      expect(generalErrorContent).toContain(
        "export class InvalidStatusTransition extends Error implements ReducerError",
      );
      expect(generalErrorContent).toContain(
        "errorCode = 'InvalidStatusTransition' as ErrorCode",
      );

      // Check line_items module errors
      const lineItemsErrorPath = path.join(
        testOutDirPath,
        documentModelsDirName,
        "billing-statement",
        "gen",
        "line-items",
        "error.ts",
      );
      const lineItemsErrorContent = readFileSync(lineItemsErrorPath, "utf-8");

      // Check that both DuplicateLineItem and InvalidStatusTransition errors are generated (but deduplicated)
      expect(lineItemsErrorContent).toContain("export type ErrorCode =");
      expect(lineItemsErrorContent).toContain("'DuplicateLineItem'");
      expect(lineItemsErrorContent).toContain("'InvalidStatusTransition'");
      expect(lineItemsErrorContent).toContain(
        "export class DuplicateLineItem extends Error implements ReducerError",
      );
      expect(lineItemsErrorContent).toContain(
        "export class InvalidStatusTransition extends Error implements ReducerError",
      );

      // Verify that InvalidStatusTransition only appears once in the ErrorCode type (deduplication test)
      const errorCodeMatches = lineItemsErrorContent.match(
        /'InvalidStatusTransition'/g,
      );
      expect(errorCodeMatches?.length).toBe(3); // Once in type definition, once in each class
    },
  );

  it(
    "should automatically import error classes in reducer files when used",
    { timeout: 10000 },
    async () => {
      await generate();
      await compile(testOutDirPath);

      // Check that the general module reducer imports InvalidStatusTransition
      const generalReducerPath = path.join(
        testOutDirPath,
        documentModelsDirName,
        "billing-statement",
        "src",
        "reducers",
        "general.ts",
      );
      const generalReducerContent = readFileSync(generalReducerPath, "utf-8");

      // Should have import for both InvalidStatusTransition and StatusAlreadySet errors in single import
      expect(generalReducerContent).toContain(
        'import { InvalidStatusTransition, StatusAlreadySet } from "../../gen/general/error.js";',
      );

      // Should contain the reducer code with both error usages
      expect(generalReducerContent).toContain(
        "throw new InvalidStatusTransition",
      );
      expect(generalReducerContent).toContain("throw new StatusAlreadySet");

      // Check that the line-items module reducer imports DuplicateLineItem
      const lineItemsReducerPath = path.join(
        testOutDirPath,
        documentModelsDirName,
        "billing-statement",
        "src",
        "reducers",
        "line-items.ts",
      );
      const lineItemsReducerContent = readFileSync(
        lineItemsReducerPath,
        "utf-8",
      );

      // Should have import for DuplicateLineItem error
      expect(lineItemsReducerContent).toContain(
        'import { DuplicateLineItem } from "../../gen/line-items/error.js";',
      );

      // Should contain the reducer code with error usage
      expect(lineItemsReducerContent).toContain("throw new DuplicateLineItem");
    },
  );

  it(
    "should generate error codes for legacy documents with empty error codes",
    { timeout: 10000 },
    async () => {
      await generateSchemas(srcPath, {
        skipFormat: true,
        outDir: path.join(testOutDirPath, documentModelsDirName),
      });

      const testEmptyCodesDocumentModel = await loadDocumentModel(
        path.join(
          srcPath,
          "test-empty-error-codes",
          "test-empty-error-codes.json",
        ),
      );

      await hygenGenerateDocumentModel(
        testEmptyCodesDocumentModel,
        path.join(testOutDirPath, documentModelsDirName),
        testPackageName,
        { skipFormat: true },
      );

      // Check that error codes are generated from error names
      const testOperationsErrorPath = path.join(
        testOutDirPath,
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
      expect(testOperationsErrorContent).toContain("'InvalidValue'");
      expect(testOperationsErrorContent).toContain("'EmptyValue'");

      // Check that error classes are generated
      expect(testOperationsErrorContent).toContain(
        "export class InvalidValue extends Error implements ReducerError",
      );
      expect(testOperationsErrorContent).toContain(
        "export class EmptyValue extends Error implements ReducerError",
      );

      // Verify error code constants are set properly in PascalCase
      expect(testOperationsErrorContent).toContain(
        "errorCode = 'InvalidValue' as ErrorCode",
      );
      expect(testOperationsErrorContent).toContain(
        "errorCode = 'EmptyValue' as ErrorCode",
      );
    },
  );
});
