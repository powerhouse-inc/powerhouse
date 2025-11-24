import { type PowerhouseConfig } from "@powerhousedao/config";
import fs, { rmSync } from "node:fs";
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
  purgeDirAfterTest,
  resetDirForTest,
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
    resetDirForTest(outDirName);
  });

  afterAll(() => {
    purgeDirAfterTest(outDirName);
  });

  it(
    "should generate a Document Model editor",
    {
      timeout: 100000,
    },
    async (context) => {
      await setupTest(context);

      const name = "TestDocEditor";
      await generateEditor({
        name: name,
        documentTypes: ["powerhouse/test-doc"],
        config: config,
        editorId: "test-document-model-editor",
        specifiedPackageName: TEST_PACKAGE_NAME,
      });

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
        `import { EditTestDocDocumentName } from "./components/EditName.js";`,
      );
      expect(editorContent).toContain(`export default function Editor()`);
      expect(editorContent).toContain(`<EditTestDocDocumentName />`);

      const modulePath = path.join(editorDir, "module.ts");
      expect(fs.existsSync(modulePath)).toBe(true);
      const moduleContent = fs.readFileSync(modulePath, "utf-8");
      expect(moduleContent).toContain(
        `export const TestDocEditor: EditorModule`,
      );
      expect(moduleContent).toContain(`documentTypes: ["powerhouse/test-doc`);
      expect(moduleContent).toContain(`id: "test-document-model-editor"`);
      expect(moduleContent).toContain(`name: "TestDocEditor"`);

      await compile(testOutDirPath);
    },
  );

  it(
    "should append new exports to existing editors.ts file",
    {
      timeout: 100000,
    },
    async (context) => {
      await setupTest(
        context,
        getTestDataDir(testDir, EDITORS_TEST_PROJECT_WITH_EXISTING_EDITOR),
      );

      const name = "TestDocEditorTwo";
      await generateEditor({
        name: name,
        documentTypes: ["powerhouse/test-doc"],
        config: config,
        editorId: "test-document-model-editor-two",
        specifiedPackageName: TEST_PACKAGE_NAME,
      });
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
      timeout: 100000,
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
      await generateEditor({
        name: "TestDocEditor2",
        documentTypes: ["powerhouse/test-doc"],
        config: config,
        editorId: "test-doc-editor-2",
        specifiedPackageName: TEST_PACKAGE_NAME,
      });
      await compile(testOutDirPath);
      const editorsContent = fs.readFileSync(editorsFilePath, "utf-8");
      expect(editorsContent).toContain(`export const editors: EditorModule[]`);
      expect(editorsContent).toContain(`TestDocEditor`);
    },
  );
});
