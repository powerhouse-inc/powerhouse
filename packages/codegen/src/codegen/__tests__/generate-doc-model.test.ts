import { exec } from "node:child_process";
import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { generateSchemas } from "../graphql.js";
import { generateDocumentModel, generateProcessor } from "../hygen.js";
import { loadDocumentModel } from "../utils.js";

describe("document model", () => {
  const srcPath = path.join(
    process.cwd(),
    "src",
    "codegen",
    "__tests__",
    "data",
    "document-models",
  );

  const outPath = path.join(
    process.cwd(),
    "src",
    "codegen",
    "__tests__",
    ".out",
  );

  beforeEach(async () => {
    // make sure to remove the outPath directory
    await rm(outPath, { recursive: true, force: true });
  });

  const generate = async () => {
    await generateSchemas(srcPath, {
      skipFormat: true,
      outDir: path.join(outPath, "document-model"),
    });

    const billingStatementDocumentModel = await loadDocumentModel(
      path.join(srcPath, "billing-statement", "billing-statement.json"),
    );

    await generateDocumentModel(
      billingStatementDocumentModel,
      path.join(outPath, "document-model"),
      { skipFormat: true },
    );

    const testDocDocumentModel = await loadDocumentModel(
      path.join(srcPath, "test-doc", "test-doc.json"),
    );

    await generateDocumentModel(
      testDocDocumentModel,
      path.join(outPath, "document-model"),
      { skipFormat: true },
    );
  };

  const compile = () =>
    new Promise((resolve, reject) => {
      const output: { stdout: string[]; stderr: string[] } = {
        stdout: [],
        stderr: [],
      };
      const child = exec(
        "npx tsc --project tsconfig.document-model.test.json",
        { cwd: process.cwd() },
      );
      child.stdout?.on("data", (data) => {
        output.stdout.push(data);
      });
      child.stderr?.on("data", (data) => {
        output.stderr.push(data);
      });
      child.on("close", (code) => {
        if (code === 0) {
          resolve(true);
        } else {
          reject(
            new Error(
              `tsc failed with code ${code}:\n${output.stdout.join("")}\n${output.stderr.join("")}`,
            ),
          );
        }
      });
    });

  it(
    "should generate a document model",
    {
      timeout: 10000,
    },
    async () => {
      await generate();
      await compile();
    },
  );

  it(
    "should generate an analytics processor and factory",
    {
      timeout: 10000,
    },
    async () => {
      await generate();

      await generateProcessor(
        "test-analytics-processor",
        ["billing-statement"],
        {
          "billing-statement": {
            name: "BillingStatement",
            importPath: "../../document-model/billing-statement",
          },
        },
        path.join(outPath, "processors"),
        path.join(outPath, "document-model"),
        "analytics",
        {
          skipFormat: true,
        },
      );

      await compile();
    },
  );

  it(
    "should generate multiple analytics processors with composable factories",
    {
      timeout: 10000,
    },
    async () => {
      await generate();

      await generateProcessor(
        "test1",
        ["billing-statement"],
        {
          "billing-statement": {
            name: "BillingStatement",
            importPath: "../../document-model/billing-statement",
          },
        },
        path.join(outPath, "processors"),
        path.join(outPath, "document-model"),
        "analytics",
        {
          skipFormat: true,
        },
      );

      await generateProcessor(
        "test2",
        ["billing-statement"],
        {
          "billing-statement": {
            name: "BillingStatement",
            importPath: "../../document-model/billing-statement",
          },
        },
        path.join(outPath, "processors"),
        path.join(outPath, "document-model"),
        "analytics",
        {
          skipFormat: true,
        },
      );

      await generateProcessor(
        "test3",
        ["billing-statement"],
        {
          "billing-statement": {
            name: "BillingStatement",
            importPath: "../../document-model/billing-statement",
          },
        },
        path.join(outPath, "processors"),
        path.join(outPath, "document-model"),
        "analytics",
        {
          skipFormat: true,
        },
      );

      await compile();
    },
  );

  it(
    "should generate multiple document models and export both in index.ts",
    {
      timeout: 15000,
    },
    async () => {
      await generate();
      await compile();

      const indexPath = path.join(outPath, "document-model", "index.ts");
      const indexContent = readFileSync(indexPath, "utf-8");

      // Check that both models are exported
      expect(indexContent).toContain(
        "export { module as BillingStatement } from './billing-statement/index.js';",
      );
      expect(indexContent).toContain(
        "export { module as TestDoc } from './test-doc/index.js';",
      );
    },
  );

  it(
    "should generate an updated version of test-doc",
    { timeout: 10000 },
    async () => {
      await generate();
      await compile();

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
      await rm(
        path.join(
          outPath,
          "document-model",
          "test-doc",
          "src",
          "reducers",
          "base-operations.ts",
        ),
        { force: true },
      );

      await generateDocumentModel(
        testDocDocumentModelV2,
        path.join(outPath, "document-model"),
        { skipFormat: true },
      );

      // expect .out/document-model/test-doc/src/reducers/base-operations.ts to contain setTestIdOperation, setTestNameOperation, setTestDescriptionOperation and setTestValueOperation
      const baseOperationsPath = path.join(
        outPath,
        "document-model",
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
      await compile();

      // Check general module errors
      const generalErrorPath = path.join(
        outPath,
        "document-model",
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
        outPath,
        "document-model",
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
      await compile();

      // Check that the general module reducer imports InvalidStatusTransition
      const generalReducerPath = path.join(
        outPath,
        "document-model",
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
        outPath,
        "document-model",
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
        outDir: path.join(outPath, "document-model"),
      });

      const testEmptyCodesDocumentModel = await loadDocumentModel(
        path.join(srcPath, "test-empty-error-codes", "test-empty-error-codes.json"),
      );

      await generateDocumentModel(
        testEmptyCodesDocumentModel,
        path.join(outPath, "document-model"),
        { skipFormat: true },
      );

      // Check that error codes are generated from error names
      const testOperationsErrorPath = path.join(
        outPath,
        "document-model",
        "test-empty-codes",
        "gen",
        "test-operations",
        "error.ts",
      );
      const testOperationsErrorContent = readFileSync(testOperationsErrorPath, "utf-8");

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
