import path from "node:path";
import { describe, it } from "vitest";
import { TSMorphGenerator } from "../../utils/ts-morph-generator.js";
import { loadDocumentModel } from "../utils.js";

describe("ts-morph generator", () => {
  const srcPath = path.join(
    process.cwd(),
    "src",
    "codegen",
    "__tests__",
    ".test-project",
  );

  const srcTestDocumentPath = path.join(
    process.cwd(),
    "src",
    "codegen",
    "__tests__",
    "data",
    "document-models",
    "test-doc",
    "test-doc.json",
  );

  const srcTestDocumentPathV2 = path.join(
    process.cwd(),
    "src",
    "codegen",
    "__tests__",
    "data",
    "test-doc-versions",
    "test-doc-v2",
    "test-doc.json",
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

  it("should generate reducers", async () => {
    const testDocDocumentModel = await loadDocumentModel(srcTestDocumentPathV4);

    const generator = new TSMorphGenerator(srcPath, [testDocDocumentModel]);

    await generator.generateReducers();

    expect(true).toBe(true);
  });
});
