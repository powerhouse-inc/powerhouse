import fs from "fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { TSMorphCodeGenerator } from "../../ts-morph-generator/index.js";
import { loadDocumentModel } from "../utils.js";
import {
  expectedBaseOperationsContent,
  expectedProOperationsContent
} from "./fixtures/expected-reducer-content.js";
import { expectedProOperationsV3Content } from "./fixtures/expected-reducer-content-v3.js";

describe("ts-morph generator", () => {
  const srcPath = path.join(
    process.cwd(),
    "src",
    "codegen",
    "__tests__",
    ".test-project",
  );

  const srcTestDocumentPathV3 = path.join(
    process.cwd(),
    "src",
    "codegen",
    "__tests__",
    "data",
    "test-doc-versions",
    "test-doc-v3",
    "test-doc.json",
  );

  const srcTestDocumentPathV4 = path.join(
    process.cwd(),
    "src",
    "codegen",
    "__tests__",
    "data",
    "test-doc-versions",
    "test-doc-v4",
    "test-doc.json",
  );

  beforeEach(async () => {
    // Clean up .test-project folder before each test
    try {
      await fs.rm(srcPath, { recursive: true });
    } catch (error) {
      // Ignore error if folder doesn't exist
    }
  });

  it("should generate reducers", async () => {
    const testDocDocumentModel = await loadDocumentModel(srcTestDocumentPathV4);

    const generator = new TSMorphCodeGenerator(srcPath, [testDocDocumentModel]);

    await generator.generateReducers();

    // Check base-operations.ts file exists and has correct content
    const baseOperationsPath = path.join(
      srcPath,
      "document-model",
      "test-doc",
      "src",
      "reducers",
      "base-operations.ts",
    );
    const baseOperationsContent = await fs.readFile(baseOperationsPath, "utf-8");
    
    expect(baseOperationsContent.trim()).toBe(expectedBaseOperationsContent.trim());

    // Check pro-operations.ts file exists and has correct content
    const proOperationsPath = path.join(
      srcPath,
      "document-model",
      "test-doc",
      "src",
      "reducers",
      "pro-operations.ts",
    );
    const proOperationsContent = await fs.readFile(proOperationsPath, "utf-8");
    
    expect(proOperationsContent.trim()).toBe(expectedProOperationsContent.trim());
  });

  it("should update reducers when document version changes", async () => {
    // First, generate reducers for v3 (only has setNameAndValueOperation)
    const testDocV3DocumentModel = await loadDocumentModel(srcTestDocumentPathV3);
    const generatorV3 = new TSMorphCodeGenerator(srcPath, [testDocV3DocumentModel]);
    
    await generatorV3.generateReducers();

    // Verify v3 only has setNameAndValueOperation in pro-operations.ts
    const proOperationsPath = path.join(
      srcPath,
      "document-model",
      "test-doc",
      "src",
      "reducers",
      "pro-operations.ts",
    );
    const proOperationsV3Content = await fs.readFile(proOperationsPath, "utf-8");
    expect(proOperationsV3Content.trim()).toBe(expectedProOperationsV3Content.trim());

    // Now generate reducers for v4 (has both setNameAndValueOperation and setIdAndDescriptionOperation)
    const testDocV4DocumentModel = await loadDocumentModel(srcTestDocumentPathV4);
    const generatorV4 = new TSMorphCodeGenerator(srcPath, [testDocV4DocumentModel]);
    
    await generatorV4.generateReducers();

    // Verify v4 has both reducers in pro-operations.ts
    const proOperationsV4Content = await fs.readFile(proOperationsPath, "utf-8");
    expect(proOperationsV4Content.trim()).toBe(expectedProOperationsContent.trim());

    // Verify base operations are unchanged
    const baseOperationsPath = path.join(
      srcPath,
      "document-model",
      "test-doc",
      "src",
      "reducers",
      "base-operations.ts",
    );
    const baseOperationsContent = await fs.readFile(baseOperationsPath, "utf-8");
    expect(baseOperationsContent.trim()).toBe(expectedBaseOperationsContent.trim());
  });
});
