import { generateDriveEditor } from "@powerhousedao/codegen";
import { directoryExists, fileExists } from "@powerhousedao/common/clis";
import type { PowerhouseConfig } from "@powerhousedao/config";
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
import { USE_TS_MORPH } from "./config.js";
import {
  EDITORS_TEST_PROJECT,
  EDITORS_TEST_PROJECT_WITH_EXISTING_EDITOR,
  GENERATE_DRIVE_EDITOR_TEST_OUTPUT_DIR,
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

describe("generateDriveEditor", () => {
  const testDir = import.meta.dirname;
  const outDirName = getTestOutputDir(
    testDir,
    GENERATE_DRIVE_EDITOR_TEST_OUTPUT_DIR,
  );
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
    "should generate a drive editor with the correct files and content",
    {
      timeout: 100000,
    },
    async (context) => {
      await setupTest(context);
      const name = "Atlas Drive Explorer";

      await generateDriveEditor({
        ...config,
        driveEditorName: name,
        driveEditorId: "AtlasDriveExplorer",
        allowedDocumentTypes: ["powerhouse/test-doc"],
        useTsMorph: USE_TS_MORPH,
        specifiedPackageName: undefined,
        driveEditorDirName: undefined,
        isDragAndDropEnabled: true,
      });

      const editorsDir = path.join(testOutDirPath, "editors");
      expect(await directoryExists(editorsDir)).toBe(true);

      const editorsFilePath = path.join(editorsDir, "editors.ts");
      expect(await fileExists(editorsFilePath)).toBe(true);
      const editorsContent = await readFile(editorsFilePath, "utf-8");
      expect(editorsContent).toContain(`export const editors: EditorModule[]`);
      expect(editorsContent).toContain(`AtlasDriveExplorer`);

      const editorDir = path.join(editorsDir, "atlas-drive-explorer");
      expect(await directoryExists(editorDir)).toBe(true);

      const moduleFilePath = path.join(editorDir, "module.ts");
      expect(await fileExists(moduleFilePath)).toBe(true);
      const moduleContent = await readFile(moduleFilePath, "utf-8");
      expect(moduleContent).toContain(
        `export const AtlasDriveExplorer: EditorModule`,
      );
      expect(moduleContent).toContain(
        `documentTypes: ["powerhouse/document-drive"]`,
      );
      expect(moduleContent).toContain(`id: "AtlasDriveExplorer"`);
      expect(moduleContent).toContain(`name: "Atlas Drive Explorer"`);

      const configFilePath = path.join(editorDir, "config.ts");
      expect(await fileExists(configFilePath)).toBe(true);
      const configContent = await readFile(configFilePath, "utf-8");
      expect(configContent).toContain(
        `export const editorConfig: PHDriveEditorConfig`,
      );
      expect(configContent).toContain(
        `allowedDocumentTypes: ["powerhouse/test-doc"]`,
      );

      const editorFilePath = path.join(editorDir, "editor.tsx");
      expect(await fileExists(editorFilePath)).toBe(true);
      const editorContent = await readFile(editorFilePath, "utf-8");
      expect(editorContent).toContain(
        `export default function Editor(props: EditorProps)`,
      );
      expect(editorContent).toContain(`<DriveExplorer {...props}`);
      expect(editorContent).toContain(
        `useSetPHDriveEditorConfig(editorConfig)`,
      );

      const componentsDir = path.join(editorDir, "components");
      expect(await directoryExists(componentsDir)).toBe(true);

      const driveExplorerPath = path.join(componentsDir, "DriveExplorer.tsx");
      expect(await fileExists(driveExplorerPath)).toBe(true);
      const driveExplorerContent = await readFile(driveExplorerPath, "utf-8");
      expect(driveExplorerContent).toContain(
        `export function DriveExplorer({ children }: EditorProps)`,
      );

      const createDocumentPath = path.join(componentsDir, "CreateDocument.tsx");
      expect(await fileExists(createDocumentPath)).toBe(true);
      const createDocumentContent = await readFile(createDocumentPath, "utf-8");
      expect(createDocumentContent).toContain(
        `export function CreateDocument()`,
      );

      const folderTreePath = path.join(componentsDir, "FolderTree.tsx");
      expect(await fileExists(folderTreePath)).toBe(true);
      const folderTreeContent = await readFile(folderTreePath, "utf-8");
      expect(folderTreeContent).toContain(`export function FolderTree()`);

      const driveContentsPath = path.join(componentsDir, "DriveContents.tsx");
      expect(await fileExists(driveContentsPath)).toBe(true);
      const driveContentsContent = await readFile(driveContentsPath, "utf-8");
      expect(driveContentsContent).toContain(`export function DriveContents()`);

      const filesPath = path.join(componentsDir, "Files.tsx");
      expect(await fileExists(filesPath)).toBe(true);
      const filesContent = await readFile(filesPath, "utf-8");
      expect(filesContent).toContain(`export function Files()`);

      const foldersPath = path.join(componentsDir, "Folders.tsx");
      expect(await fileExists(foldersPath)).toBe(true);
      const foldersContent = await readFile(foldersPath, "utf-8");
      expect(foldersContent).toContain(`export function Folders()`);

      const emptyStatePath = path.join(componentsDir, "EmptyState.tsx");
      expect(await fileExists(emptyStatePath)).toBe(true);
      const emptyStateContent = await readFile(emptyStatePath, "utf-8");
      expect(emptyStateContent).toContain(`export function EmptyState()`);

      const navigationBreadcrumbsPath = path.join(
        componentsDir,
        "NavigationBreadcrumbs.tsx",
      );
      expect(await fileExists(navigationBreadcrumbsPath)).toBe(true);
      const navigationBreadcrumbsContent = await readFile(
        navigationBreadcrumbsPath,
        "utf-8",
      );
      expect(navigationBreadcrumbsContent).toContain(
        `export function NavigationBreadcrumbs()`,
      );
    },
  );

  it(
    "should generate a drive editor with default id when no appId is provided",
    {
      timeout: 100000,
    },
    async (context) => {
      await setupTest(
        context,
        getTestDataDir(testDir, EDITORS_TEST_PROJECT_WITH_EXISTING_EDITOR),
      );
      const name = "TestApp";
      await generateDriveEditor({
        ...config,
        driveEditorName: name,
        useTsMorph: USE_TS_MORPH,
        driveEditorId: undefined,
        specifiedPackageName: undefined,
        driveEditorDirName: undefined,
        isDragAndDropEnabled: true,
        allowedDocumentTypes: [],
      }); // No appId provided

      const editorsDir = path.join(testOutDirPath, "editors");
      const editorDir = path.join(editorsDir, "test-app");
      const moduleFilePath = path.join(editorDir, "module.ts");
      const moduleContent = await readFile(moduleFilePath, "utf-8");
      expect(moduleContent).toContain(`id: "test-app"`);

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
      const name = "Atlas Drive Explorer";

      await generateDriveEditor({
        ...config,
        driveEditorName: name,
        driveEditorId: "AtlasDriveExplorer",
        allowedDocumentTypes: ["powerhouse/test-doc"],
        useTsMorph: USE_TS_MORPH,
        specifiedPackageName: undefined,
        driveEditorDirName: undefined,
        isDragAndDropEnabled: true,
      });

      const editorsDir = path.join(testOutDirPath, "editors");
      const editorsFilePath = path.join(editorsDir, "editors.ts");
      const editorsContent = await readFile(editorsFilePath, "utf-8");
      expect(editorsContent).toContain(`export const editors: EditorModule[]`);
      expect(editorsContent).toContain(`AtlasDriveExplorer`);
      expect(editorsContent).toContain(`TestDocEditor`);
    },
  );
  it(
    "should create the editors.ts file if it does not exist",
    {
      timeout: 100000,
    },
    async (context) => {
      await setupTest(context);
      const name = "Atlas Drive Explorer";
      const editorsDir = path.join(testOutDirPath, "editors");
      const editorsFilePath = path.join(editorsDir, "editors.ts");
      await rm(editorsFilePath, { force: true });
      await generateDriveEditor({
        ...config,
        driveEditorName: name,
        useTsMorph: USE_TS_MORPH,
        allowedDocumentTypes: [],
        driveEditorId: undefined,
        specifiedPackageName: undefined,
        driveEditorDirName: undefined,
        isDragAndDropEnabled: true,
      });
      await compile(testOutDirPath);
      const editorsContent = await readFile(editorsFilePath, "utf-8");
      expect(editorsContent).toContain(`export const editors: EditorModule[]`);
      expect(editorsContent).toContain(`AtlasDriveExplorer`);
    },
  );
});
