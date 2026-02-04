import fs from "fs/promises";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  type TestContext,
} from "vitest";
import { TSMorphCodeGenerator } from "../../ts-morph-generator/index.js";
import { loadDocumentModel } from "../utils.js";
import { PURGE_AFTER_TEST } from "./config.js";
import {
  TEST_PACKAGE_NAME,
  TS_MORPH_GENERATOR_TEST_OUTPUT_DIR,
} from "./constants.js";
import { expectedProOperationsV3Content } from "./fixtures/expected-reducer-content-v3.js";
import {
  expectedBaseOperationsContent,
  expectedProOperationsContent,
} from "./fixtures/expected-reducer-content.js";
import {
  getTestDataDir,
  getTestOutDirPath,
  getTestOutputDir,
} from "./utils.js";

describe.skip("ts-morph generator", () => {
  const testDir = import.meta.dirname;
  const outDirName = getTestOutputDir(
    testDir,
    TS_MORPH_GENERATOR_TEST_OUTPUT_DIR,
  );
  let testOutDirPath = getTestOutDirPath("initial", outDirName);
  const testDataDir = getTestDataDir(testDir, "test-doc-versions");

  const srcTestDocumentPathV3 = path.join(
    testDataDir,
    "test-doc-v3",
    "test-doc.json",
  );

  const srcTestDocumentPathV4 = path.join(
    testDataDir,
    "test-doc-v4",
    "test-doc.json",
  );

  function setupTest(context: TestContext) {
    testOutDirPath = getTestOutDirPath(context.task.name, outDirName);
  }

  beforeAll(() => {
    try {
      rmSync(outDirName, { recursive: true, force: true });
      mkdirSync(outDirName, { recursive: true });
    } catch (error) {
      // Ignore error if folder doesn't exist
    }
  });

  afterAll(() => {
    if (PURGE_AFTER_TEST) {
      rmSync(outDirName, { recursive: true, force: true });
    }
  });

  it("should generate reducers", async (context) => {
    setupTest(context);
    const testDocDocumentModel = await loadDocumentModel(srcTestDocumentPathV4);
    const generator = new TSMorphCodeGenerator(
      testOutDirPath,
      [testDocDocumentModel],
      TEST_PACKAGE_NAME,
    );

    await generator.generateReducers();

    // Check base-operations.ts file exists and has correct content
    const baseOperationsPath = path.join(
      testOutDirPath,
      "document-model",
      "test-doc",
      "src",
      "reducers",
      "base-operations.ts",
    );
    const baseOperationsContent = await fs.readFile(
      baseOperationsPath,
      "utf-8",
    );

    expect(baseOperationsContent.trim()).toBe(
      expectedBaseOperationsContent.trim(),
    );

    // Check pro-operations.ts file exists and has correct content
    const proOperationsPath = path.join(
      testOutDirPath,
      "document-model",
      "test-doc",
      "src",
      "reducers",
      "pro-operations.ts",
    );
    const proOperationsContent = await fs.readFile(proOperationsPath, "utf-8");

    expect(proOperationsContent.trim()).toBe(
      expectedProOperationsContent.trim(),
    );
  });

  it("should update reducers when document version changes", async (context) => {
    setupTest(context);
    // First, generate reducers for v3 (only has setNameAndValueOperation)
    const testDocV3DocumentModel = await loadDocumentModel(
      srcTestDocumentPathV3,
    );
    const generatorV3 = new TSMorphCodeGenerator(
      testOutDirPath,
      [testDocV3DocumentModel],
      TEST_PACKAGE_NAME,
    );

    await generatorV3.generateReducers();

    // Verify v3 only has setNameAndValueOperation in pro-operations.ts
    const proOperationsPath = path.join(
      testOutDirPath,
      "document-model",
      "test-doc",
      "src",
      "reducers",
      "pro-operations.ts",
    );
    const proOperationsV3Content = await fs.readFile(
      proOperationsPath,
      "utf-8",
    );
    expect(proOperationsV3Content.trim()).toBe(
      expectedProOperationsV3Content.trim(),
    );

    // Now generate reducers for v4 (has both setNameAndValueOperation and setIdAndDescriptionOperation)
    const testDocV4DocumentModel = await loadDocumentModel(
      srcTestDocumentPathV4,
    );
    const generatorV4 = new TSMorphCodeGenerator(
      testOutDirPath,
      [testDocV4DocumentModel],
      TEST_PACKAGE_NAME,
    );

    await generatorV4.generateReducers();

    // Verify v4 has both reducers in pro-operations.ts
    const proOperationsV4Content = await fs.readFile(
      proOperationsPath,
      "utf-8",
    );
    expect(proOperationsV4Content.trim()).toBe(
      expectedProOperationsContent.trim(),
    );

    // Verify base operations are unchanged
    const baseOperationsPath = path.join(
      testOutDirPath,
      "document-model",
      "test-doc",
      "src",
      "reducers",
      "base-operations.ts",
    );
    const baseOperationsContent = await fs.readFile(
      baseOperationsPath,
      "utf-8",
    );
    expect(baseOperationsContent.trim()).toBe(
      expectedBaseOperationsContent.trim(),
    );
  });
});
