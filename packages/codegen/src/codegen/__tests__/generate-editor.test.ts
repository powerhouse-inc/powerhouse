import { directoryExists, fileExists } from "@powerhousedao/common/clis";
import { type PowerhouseConfig } from "@powerhousedao/config";
import { readFile, rm } from "node:fs/promises";
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
import { USE_TS_MORPH } from "./config.js";
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

    process.chdir(testOutDirPath);
  }

  beforeAll(async () => {
    await resetDirForTest(outDirName);
  });

  afterAll(async () => {
    await purgeDirAfterTest(outDirName);
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
        ...config,
        editorName: name,
        editorDirName: undefined,
        documentTypes: ["powerhouse/test-doc"],
        editorId: "test-document-model-editor",
        specifiedPackageName: TEST_PACKAGE_NAME,
        useTsMorph: USE_TS_MORPH,
      });

      const editorsDir = path.join(testOutDirPath, "editors");
      const editorsFilePath = path.join(editorsDir, "editors.ts");
      expect(await fileExists(editorsFilePath)).toBe(true);
      const editorsContent = await readFile(editorsFilePath, "utf-8");
      expect(editorsContent).toContain(
        `import { TestDocEditor } from "./test-doc-editor/module.js";`,
      );
      expect(editorsContent).toContain(`export const editors: EditorModule[]`);
      expect(editorsContent).toContain(`TestDocEditor`);

      const editorDir = path.join(editorsDir, "test-doc-editor");
      expect(await directoryExists(editorDir)).toBe(true);

      const editorPath = path.join(editorDir, "editor.tsx");
      expect(await fileExists(editorPath)).toBe(true);
      const editorContent = await readFile(editorPath, "utf-8");
      expect(editorContent).toContain(`DocumentStateViewer`);
      expect(editorContent).toContain(`export default function Editor()`);
      expect(editorContent).toContain(`<DocumentToolbar />`);
      expect(editorContent).toContain(`dispatch(actions.setName(name));`);

      const modulePath = path.join(editorDir, "module.ts");
      expect(await fileExists(modulePath)).toBe(true);
      const moduleContent = await readFile(modulePath, "utf-8");
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
        ...config,
        editorName: name,
        documentTypes: ["powerhouse/test-doc"],
        editorId: "test-document-model-editor-two",
        specifiedPackageName: TEST_PACKAGE_NAME,
        useTsMorph: USE_TS_MORPH,
        editorDirName: undefined,
      });
      const editorsDir = path.join(testOutDirPath, "editors");
      const editorsFilePath = path.join(editorsDir, "editors.ts");
      const editorsContent = await readFile(editorsFilePath, "utf-8");
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
      await rm(editorsFilePath, { force: true });
      await generateEditor({
        ...config,
        editorName: "TestDocEditor2",
        documentTypes: ["powerhouse/test-doc"],
        editorId: "test-doc-editor-2",
        specifiedPackageName: TEST_PACKAGE_NAME,
        useTsMorph: USE_TS_MORPH,
        editorDirName: undefined,
      });
      await compile(testOutDirPath);
      const editorsContent = await readFile(editorsFilePath, "utf-8");
      expect(editorsContent).toContain(`export const editors: EditorModule[]`);
      expect(editorsContent).toContain(`TestDocEditor`);
    },
  );
});
