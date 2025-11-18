import { generateDriveEditor } from "@powerhousedao/codegen";
import type { PowerhouseConfig } from "@powerhousedao/config";
import fs, { existsSync, rmSync } from "node:fs";
import path from "node:path";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  type TestContext,
} from "vitest";
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
  }

  beforeAll(() => {
    resetDirForTest(outDirName);
  });

  afterAll(() => {
    purgeDirAfterTest(outDirName);
  });

  it(
    "should generate a drive editor with the correct files and content",
    {
      timeout: 15000,
    },
    async (context) => {
      await setupTest(context);
      const name = "Atlas Drive Explorer";

      await generateDriveEditor({
        name,
        config,
        appId: "AtlasDriveExplorer",
        allowedDocumentTypes: "powerhouse/test-doc",
      });

      const editorsDir = path.join(testOutDirPath, "editors");
      expect(existsSync(editorsDir)).toBe(true);

      const editorsFilePath = path.join(editorsDir, "editors.ts");
      expect(existsSync(editorsFilePath)).toBe(true);
      const editorsContent = fs.readFileSync(editorsFilePath, "utf-8");
      expect(editorsContent).toContain(`export const editors: EditorModule[]`);
      expect(editorsContent).toContain(`AtlasDriveExplorer`);

      const editorDir = path.join(editorsDir, "atlas-drive-explorer");
      expect(existsSync(editorDir)).toBe(true);

      const moduleFilePath = path.join(editorDir, "module.ts");
      expect(existsSync(moduleFilePath)).toBe(true);
      const moduleContent = fs.readFileSync(moduleFilePath, "utf-8");
      expect(moduleContent).toContain(
        `export const AtlasDriveExplorer: EditorModule`,
      );
      expect(moduleContent).toContain(
        `documentTypes: ["powerhouse/document-drive"]`,
      );
      expect(moduleContent).toContain(`id: "AtlasDriveExplorer"`);
      expect(moduleContent).toContain(`name: "Atlas Drive Explorer"`);

      const configFilePath = path.join(editorDir, "config.ts");
      expect(existsSync(configFilePath)).toBe(true);
      const configContent = fs.readFileSync(configFilePath, "utf-8");
      expect(configContent).toContain(
        `export const editorConfig: PHDriveEditorConfig`,
      );
      expect(configContent).toContain(
        `allowedDocumentTypes: ["powerhouse/test-doc"]`,
      );

      const editorFilePath = path.join(editorDir, "editor.tsx");
      expect(existsSync(editorFilePath)).toBe(true);
      const editorContent = fs.readFileSync(editorFilePath, "utf-8");
      expect(editorContent).toContain(
        `export default function Editor(props: EditorProps)`,
      );
      expect(editorContent).toContain(`<DriveExplorer {...props} />`);
      expect(editorContent).toContain(
        `useSetPHDriveEditorConfig(editorConfig)`,
      );

      const componentsDir = path.join(editorDir, "components");
      expect(existsSync(componentsDir)).toBe(true);

      const driveExplorerPath = path.join(componentsDir, "DriveExplorer.tsx");
      expect(existsSync(driveExplorerPath)).toBe(true);
      const driveExplorerContent = fs.readFileSync(driveExplorerPath, "utf-8");
      expect(driveExplorerContent).toContain(
        `export function DriveExplorer({ children }: EditorProps)`,
      );

      const createDocumentPath = path.join(componentsDir, "CreateDocument.tsx");
      expect(existsSync(createDocumentPath)).toBe(true);
      const createDocumentContent = fs.readFileSync(
        createDocumentPath,
        "utf-8",
      );
      expect(createDocumentContent).toContain(
        `export function CreateDocument()`,
      );

      const folderTreePath = path.join(componentsDir, "FolderTree.tsx");
      expect(existsSync(folderTreePath)).toBe(true);
      const folderTreeContent = fs.readFileSync(folderTreePath, "utf-8");
      expect(folderTreeContent).toContain(`export function FolderTree()`);

      const driveContentsPath = path.join(componentsDir, "DriveContents.tsx");
      expect(existsSync(driveContentsPath)).toBe(true);
      const driveContentsContent = fs.readFileSync(driveContentsPath, "utf-8");
      expect(driveContentsContent).toContain(`export function DriveContents()`);

      const filesPath = path.join(componentsDir, "Files.tsx");
      expect(existsSync(filesPath)).toBe(true);
      const filesContent = fs.readFileSync(filesPath, "utf-8");
      expect(filesContent).toContain(`export function Files()`);

      const foldersPath = path.join(componentsDir, "Folders.tsx");
      expect(existsSync(foldersPath)).toBe(true);
      const foldersContent = fs.readFileSync(foldersPath, "utf-8");
      expect(foldersContent).toContain(`export function Folders()`);

      const emptyStatePath = path.join(componentsDir, "EmptyState.tsx");
      expect(existsSync(emptyStatePath)).toBe(true);
      const emptyStateContent = fs.readFileSync(emptyStatePath, "utf-8");
      expect(emptyStateContent).toContain(`export function EmptyState()`);

      const navigationBreadcrumbsPath = path.join(
        componentsDir,
        "NavigationBreadcrumbs.tsx",
      );
      expect(existsSync(navigationBreadcrumbsPath)).toBe(true);
      const navigationBreadcrumbsContent = fs.readFileSync(
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
      timeout: 15000,
    },
    async (context) => {
      await setupTest(
        context,
        getTestDataDir(testDir, EDITORS_TEST_PROJECT_WITH_EXISTING_EDITOR),
      );
      const name = "TestApp";
      await generateDriveEditor({ name, config }); // No appId provided

      const editorsDir = path.join(testOutDirPath, "editors");
      const editorDir = path.join(editorsDir, "test-app");
      const moduleFilePath = path.join(editorDir, "module.ts");
      const moduleContent = fs.readFileSync(moduleFilePath, "utf-8");
      expect(moduleContent).toContain(`id: "test-app"`);

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
      const name = "Atlas Drive Explorer";

      await generateDriveEditor({
        name,
        config,
        appId: "AtlasDriveExplorer",
        allowedDocumentTypes: "powerhouse/test-doc",
      });

      const editorsDir = path.join(testOutDirPath, "editors");
      const editorsFilePath = path.join(editorsDir, "editors.ts");
      const editorsContent = fs.readFileSync(editorsFilePath, "utf-8");
      expect(editorsContent).toContain(`export const editors: EditorModule[]`);
      expect(editorsContent).toContain(`AtlasDriveExplorer`);
      expect(editorsContent).toContain(`TestDocEditor`);
    },
  );
  it(
    "should create the editors.ts file if it does not exist",
    {
      timeout: 15000,
    },
    async (context) => {
      await setupTest(context);
      const name = "Atlas Drive Explorer";
      const editorsDir = path.join(testOutDirPath, "editors");
      const editorsFilePath = path.join(editorsDir, "editors.ts");
      rmSync(editorsFilePath, { force: true });
      await generateDriveEditor({ name, config });
      await compile(testOutDirPath);
      const editorsContent = fs.readFileSync(editorsFilePath, "utf-8");
      expect(editorsContent).toContain(`export const editors: EditorModule[]`);
      expect(editorsContent).toContain(`AtlasDriveExplorer`);
    },
  );
});
