import fs from "fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { TSMorphCodeGenerator } from "../../ts-morph-generator/index.js";
import { loadDocumentModel } from "../utils.js";
import { 
  expectedBaseOperationsContent, 
  expectedProOperationsContent 
} from "./fixtures/expected-reducer-content.js";

describe("ts-morph generator", () => {
  const srcPath = path.join(
    process.cwd(),
    "src",
    "codegen",
    "__tests__",
    ".test-project",
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
});
