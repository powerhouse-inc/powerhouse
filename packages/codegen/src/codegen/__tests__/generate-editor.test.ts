import { type PowerhouseConfig } from "@powerhousedao/config/powerhouse";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { generateSchemas } from "../graphql.js";
import { generateDocumentModel } from "../hygen.js";
import { generateEditor } from "../index.js";
import { loadDocumentModel } from "../utils.js";
import { compile } from "./fixtures/typecheck.js";
import {
  EXPECTED_EDITOR_CONTENT,
  EXPECTED_EDITOR_CONTENT_NO_DOCUMENT_TYPES,
  EXPECTED_HOOK_CONTENT,
  EXPECTED_INDEX_CONTENT,
  EXPECTED_INDEX_CONTENT_NO_DOCUMENT_TYPES,
  EXPECTED_MAIN_INDEX_CONTENT,
  EXPECTED_MAIN_INDEX_CONTENT_NO_DOCUMENT_TYPES,
} from "./generate-editor.expected.js";

// Set this to false to keep the generated files for inspection
const CLEANUP_AFTER_TESTS = true;

const BillingStatementSrcPath = path.join(
  process.cwd(),
  "src",
  "codegen",
  "__tests__",
  "data",
  "document-models",
  "billing-statement",
  "billing-statement.json",
);

describe("generateEditor", () => {
  let testDir: string;
  const config: PowerhouseConfig = {
    editorsDir: "",
    documentModelsDir: "",
    processorsDir: "",
    subgraphsDir: "",
    importScriptsDir: "",
    skipFormat: true,
    logLevel: "info",
  };

  beforeEach(() => {
    testDir = path.join(__dirname, "temp", "document-editor");
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    config.editorsDir = path.join(testDir, "editors");
    config.documentModelsDir = path.join(testDir, "document-models");

    fs.mkdirSync(config.editorsDir, { recursive: true });
    fs.mkdirSync(config.documentModelsDir, { recursive: true });
  });

  afterAll(() => {
    if (CLEANUP_AFTER_TESTS && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should generate a generic document editor", async () => {
    const name = "GenericDocumentEditor";
    await generateEditor(name, [], config, "test-generic-document-editor");

    await compile("tsconfig.document-editor.test.json");

    const editorDir = path.join(config.editorsDir, "generic-document-editor");
    expect(fs.existsSync(editorDir)).toBe(true);

    const indexPath = path.join(editorDir, "index.ts");
    const editorPath = path.join(editorDir, "editor.tsx");
    const hooksPath = path.join(editorDir, "hooks");

    expect(fs.existsSync(editorPath)).toBe(true);
    expect(fs.existsSync(indexPath)).toBe(true);
    expect(fs.existsSync(hooksPath)).toBe(false);

    const indexContent = fs.readFileSync(indexPath, "utf-8").trim();
    expect(indexContent).toBe(EXPECTED_INDEX_CONTENT_NO_DOCUMENT_TYPES.trim());

    const editorContent = fs.readFileSync(editorPath, "utf-8").trim();
    expect(editorContent).toBe(
      EXPECTED_EDITOR_CONTENT_NO_DOCUMENT_TYPES.trim(),
    );

    const mainIndexPath = path.join(config.editorsDir, "index.ts");
    const mainIndexContent = fs
      .readFileSync(mainIndexPath, "utf-8")
      .replace(/\s+$/, "");
    expect(mainIndexContent).toStrictEqual(
      EXPECTED_MAIN_INDEX_CONTENT_NO_DOCUMENT_TYPES,
    );
  });

  it("should generate a Document Model editor", async () => {
    console.log(path.join(BillingStatementSrcPath, "../.."));
    await generateSchemas(path.join(BillingStatementSrcPath, "../../"), {
      skipFormat: true,
      outDir: config.documentModelsDir,
    });

    const billingStatementDocumentModel = await loadDocumentModel(
      BillingStatementSrcPath,
    );

    await generateDocumentModel(
      billingStatementDocumentModel,
      config.documentModelsDir,
      { skipFormat: true },
    );

    fs.copyFileSync(
      BillingStatementSrcPath,
      path.join(
        config.documentModelsDir,
        "billing-statement",
        "billing-statement.json",
      ),
    );
    fs.copyFileSync(
      path.join(BillingStatementSrcPath, "..", "schema.graphql"),
      path.join(
        config.documentModelsDir,
        "billing-statement",
        "schema.graphql",
      ),
    );
    const editorDir = path.join(config.editorsDir, "billing-statement-editor");
    const indexPath = path.join(editorDir, "index.ts");
    const editorPath = path.join(editorDir, "editor.tsx");
    const hookPath = path.join(
      editorDir,
      "../hooks/useBillingStatementDocument.ts",
    );

    const name = "BillingStatementEditor";
    await generateEditor(
      name,
      ["powerhouse/billing-statement"],
      config,
      "billing-statement-editor",
      "",
    );

    await compile("tsconfig.document-editor.test.json");

    expect(fs.existsSync(editorDir)).toBe(true);
    expect(fs.existsSync(editorPath)).toBe(true);
    expect(fs.existsSync(indexPath)).toBe(true);
    expect(fs.existsSync(hookPath)).toBe(true);

    const indexContent = fs.readFileSync(indexPath, "utf-8").trim();
    expect(indexContent).toBe(EXPECTED_INDEX_CONTENT.trim());

    const editorContent = fs.readFileSync(editorPath, "utf-8").trim();
    expect(editorContent).toBe(EXPECTED_EDITOR_CONTENT(testDir).trim());

    const hookContent = fs.readFileSync(hookPath, "utf-8").trim();
    expect(hookContent).toBe(EXPECTED_HOOK_CONTENT(testDir).trim());

    const mainIndexPath = path.join(config.editorsDir, "index.ts");
    const mainIndexContent = fs
      .readFileSync(mainIndexPath, "utf-8")
      .replace(/\s+$/, "");
    expect(mainIndexContent).toStrictEqual(EXPECTED_MAIN_INDEX_CONTENT);
  });
});
