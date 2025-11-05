import { type PowerhouseConfig } from "@powerhousedao/config";
import fs, { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  type TestContext,
} from "vitest";
import { generateEditor } from "../index.js";
import { PURGE_AFTER_TEST } from "./config.js";
import {
  EDITORS_TEST_PROJECT,
  EDITORS_TEST_PROJECT_WITH_EXISTING_EDITOR,
  GENERATE_EDITOR_TEST_OUTPUT_DIR,
  TEST_PACKAGE_NAME,
} from "./constants.js";
import { compile } from "./fixtures/typecheck.js";
import {
  copyAllFiles,
  getTestDataDir,
  getTestOutDirPath,
  getTestOutputDir,
} from "./utils.js";

describe("generateEditor", () => {
  const testDir = import.meta.dirname;
  const outDirName = getTestOutputDir(testDir, GENERATE_EDITOR_TEST_OUTPUT_DIR);
  const testDataDir = getTestDataDir(testDir, EDITORS_TEST_PROJECT);
  let testOutDirPath = getTestOutDirPath("initial", outDirName);
  const config: PowerhouseConfig = {
    editorsDir: "",
    documentModelsDir: "",
    processorsDir: "",
    subgraphsDir: "",
    importScriptsDir: "",
    skipFormat: true,
    logLevel: "info",
  };
  async function setupTest(
    context: TestContext,
    testDataDirOverride = testDataDir,
  ) {
    testOutDirPath = getTestOutDirPath(context.task.name, outDirName);

    await copyAllFiles(testDataDirOverride, testOutDirPath);

    config.editorsDir = path.join(testOutDirPath, "editors");
    config.documentModelsDir = path.join(testOutDirPath, "document-models");
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

  it(
    "should generate a Document Model editor",
    {
      timeout: 15000,
    },
    async (context) => {
      await setupTest(context);

      const name = "TestDocEditor";
      await generateEditor(
        name,
        ["powerhouse/test-doc"],
        config,
        "test-document-model-editor",
        TEST_PACKAGE_NAME,
      );

      const editorsDir = path.join(testOutDirPath, "editors");
      const editorsFilePath = path.join(editorsDir, "editors.ts");
      expect(fs.existsSync(editorsFilePath)).toBe(true);
      const editorsContent = fs.readFileSync(editorsFilePath, "utf-8");
      expect(editorsContent).toContain(
        `import { TestDocEditor } from "./test-doc-editor/module.js";`,
      );
      expect(editorsContent).toContain(`export const editors: EditorModule[]`);
      expect(editorsContent).toContain(`TestDocEditor`);

      const editorDir = path.join(editorsDir, "test-doc-editor");
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
      expect(moduleContent).toContain(
        `export const TestDocEditor: EditorModule`,
      );
      expect(moduleContent).toContain(`documentTypes: ["powerhouse/test-doc`);
      expect(moduleContent).toContain(`id: "test-document-model-editor"`);
      expect(moduleContent).toContain(`name: "TestDocEditor"`);

      const componentsDir = path.join(editorDir, "components");

      const editNamePath = path.join(componentsDir, "EditName.tsx");
      expect(fs.existsSync(editNamePath)).toBe(true);

      await compile(testOutDirPath);
    },
  );

  it(
    "should append new exports to existing editors.ts file",
    {
      timeout: 15000,
    },
    async (context) => {
      await setupTest(
        context,
        getTestDataDir(testDir, EDITORS_TEST_PROJECT_WITH_EXISTING_EDITOR),
      );

      const name = "TestDocEditorTwo";
      await generateEditor(
        name,
        ["powerhouse/test-doc"],
        config,
        "test-document-model-editor-two",
        TEST_PACKAGE_NAME,
      );
      const editorsDir = path.join(testOutDirPath, "editors");
      const editorsFilePath = path.join(editorsDir, "editors.ts");
      const editorsContent = fs.readFileSync(editorsFilePath, "utf-8");
      expect(editorsContent).toContain(`export const editors: EditorModule[]`);
      expect(editorsContent).toContain(`TestDocEditorTwo`);
      expect(editorsContent).toContain(`TestDocEditor`);
    },
  );
  it(
    "should create the editors.ts file if it doesn't exist",
    {
      timeout: 15000,
    },
    async (context) => {
      await setupTest(
        context,
        getTestDataDir(testDir, EDITORS_TEST_PROJECT_WITH_EXISTING_EDITOR),
      );

      const editorsFilePath = path.join(
        testOutDirPath,
        "editors",
        "editors.ts",
      );
      rmSync(editorsFilePath, { force: true });
      await generateEditor(
        "TestDocEditor",
        ["powerhouse/test-doc"],
        config,
        "test-document-model-editor",
        TEST_PACKAGE_NAME,
      );
      await compile(testOutDirPath);
      const editorsContent = fs.readFileSync(editorsFilePath, "utf-8");
      expect(editorsContent).toContain(`export const editors: EditorModule[]`);
      expect(editorsContent).toContain(`TestDocEditor`);
    },
  );
});
