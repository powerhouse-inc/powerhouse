import { type PowerhouseConfig } from "@powerhousedao/config";
import fs, { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateEditor } from "../index.js";
import { compile } from "./fixtures/typecheck.js";
import { copyAllFiles } from "./utils.js";

const PURGE_AFTER_TEST = false;

const testDir = import.meta.dirname;
const testProjectDirName = "editors-test-project";
const testProjectSrcPath = path.join(testDir, "data", testProjectDirName);
const testPackageName = "test";
const outDirName = path.join(testDir, ".generate-editors-test-output");
let testOutDirCount = 0;
let testOutDirName = `test-${testOutDirCount}`;
let testOutDirPath = path.join(outDirName, testOutDirName);

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

  it("should generate a Document Model editor", async () => {
    try {
      rmSync(outDirName, { recursive: true });
    } catch (error) {
      // Ignore error if folder doesn't exist
    }
    mkdirSync(outDirName, { recursive: true });
    testOutDirCount++;
    testOutDirName = `test-${testOutDirCount}`;
    testOutDirPath = path.join(outDirName, testOutDirName);
    testDir = path.join(testOutDirPath, "editors");
    await copyAllFiles(testProjectSrcPath, testOutDirPath);
    fs.mkdirSync(testDir, { recursive: true });
    config.editorsDir = testDir;
    config.documentModelsDir = path.join(testOutDirPath, "document-models");
    const name = "TestDocEditor";
    await generateEditor(
      name,
      ["powerhouse/test-doc"],
      config,
      "test-document-model-editor",
      testPackageName,
    );

    const editorsFilePath = path.join(testDir, "editors.ts");
    expect(fs.existsSync(editorsFilePath)).toBe(true);
    const editorsContent = fs.readFileSync(editorsFilePath, "utf-8");
    expect(editorsContent).toContain(
      `import { TestDocEditor } from "./test-doc-editor/module.js";`,
    );
    expect(editorsContent).toContain(`export const editors: EditorModule[]`);
    expect(editorsContent).toContain(`TestDocEditor`);

    const editorDir = path.join(testDir, "test-doc-editor");
    expect(fs.existsSync(editorDir)).toBe(true);

    const editorPath = path.join(editorDir, "editor.tsx");
    expect(fs.existsSync(editorPath)).toBe(true);
    const editorContent = fs.readFileSync(editorPath, "utf-8");
    expect(editorContent).toContain(
      `import { EditTestDocName } from "./components/EditName.js";`,
    );
    expect(editorContent).toContain(`export function Editor()`);
    expect(editorContent).toContain(`<EditTestDocName />`);

    const modulePath = path.join(editorDir, "module.ts");
    expect(fs.existsSync(modulePath)).toBe(true);
    const moduleContent = fs.readFileSync(modulePath, "utf-8");
    expect(moduleContent).toContain(`export const TestDocEditor: EditorModule`);
    expect(moduleContent).toContain(`documentTypes: ["powerhouse/test-doc`);
    expect(moduleContent).toContain(`id: "test-document-model-editor"`);
    expect(moduleContent).toContain(`name: "TestDocEditor"`);

    const componentsDir = path.join(editorDir, "components");

    const editNamePath = path.join(componentsDir, "EditName.tsx");
    expect(fs.existsSync(editNamePath)).toBe(true);

    await compile(testOutDirPath);

    if (PURGE_AFTER_TEST) {
      try {
        rmSync(outDirName, { recursive: true });
      } catch (error) {
        // Ignore error if folder doesn't exist
      }
    }
  });
});
