import { generateDriveEditor } from "@powerhousedao/codegen";
import { directoryExists, fileExists } from "@powerhousedao/shared/clis";
import { $ } from "bun";
import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DATA,
  TEST_OUTPUT,
  WITH_DOCUMENT_MODELS,
  WITH_EDITORS,
} from "../constants.js";
import { cpForce, rmForce } from "../utils.js";

type GenerateDriveEditorOptions = Parameters<typeof generateDriveEditor>[0];

const parentOutDir = join(process.cwd(), TEST_OUTPUT);
const dataDir = join(process.cwd(), DATA);

describe("generateDriveEditor", () => {
  const driveEditorName = "Atlas Drive Explorer";
  const driveEditorId = "AtlasDriveExplorer";
  const allowedDocumentTypes = ["powerhouse/test-doc"];

  const options: GenerateDriveEditorOptions = {
    driveEditorId,
    driveEditorName,
    allowedDocumentTypes,
    specifiedPackageName: undefined,
    driveEditorDirName: undefined,
    useTsMorph: true,
    isDragAndDropEnabled: true,
    skipFormat: false,
  };

  it("should generate a drive editor with the correct files and content", async () => {
    const outDir = join(parentOutDir, "generate-new-drive-editor");
    await rmForce(outDir);
    await cpForce(join(dataDir, WITH_DOCUMENT_MODELS), outDir);
    process.chdir(outDir);
    await generateDriveEditor({
      ...options,
    });
    const editorsDir = join(outDir, "editors");
    expect(await directoryExists(editorsDir)).toBe(true);

    const editorsFilePath = join(editorsDir, "editors.ts");
    expect(await fileExists(editorsFilePath)).toBe(true);
    const editorsContent = await readFile(editorsFilePath, "utf-8");
    expect(editorsContent).toContain(`export const editors: EditorModule[]`);
    expect(editorsContent).toContain(`AtlasDriveExplorer`);

    const editorDir = join(editorsDir, "atlas-drive-explorer");
    expect(await directoryExists(editorDir)).toBe(true);

    const moduleFilePath = join(editorDir, "module.ts");
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

    const configFilePath = join(editorDir, "config.ts");
    expect(await fileExists(configFilePath)).toBe(true);
    const configContent = await readFile(configFilePath, "utf-8");
    expect(configContent).toContain(
      `export const editorConfig: PHDriveEditorConfig`,
    );
    expect(configContent).toContain(
      `allowedDocumentTypes: ["powerhouse/test-doc"]`,
    );

    const editorFilePath = join(editorDir, "editor.tsx");
    expect(await fileExists(editorFilePath)).toBe(true);
    const editorContent = await readFile(editorFilePath, "utf-8");
    expect(editorContent).toContain(
      `export default function Editor(props: EditorProps)`,
    );
    expect(editorContent).toContain(`<DriveExplorer {...props}`);
    expect(editorContent).toContain(`useSetPHDriveEditorConfig(editorConfig)`);

    const componentsDir = join(editorDir, "components");
    expect(await directoryExists(componentsDir)).toBe(true);

    const driveExplorerPath = join(componentsDir, "DriveExplorer.tsx");
    expect(await fileExists(driveExplorerPath)).toBe(true);
    const driveExplorerContent = await readFile(driveExplorerPath, "utf-8");
    expect(driveExplorerContent).toContain(
      `export function DriveExplorer({ children }: EditorProps)`,
    );

    const createDocumentPath = join(componentsDir, "CreateDocument.tsx");
    expect(await fileExists(createDocumentPath)).toBe(true);
    const createDocumentContent = await readFile(createDocumentPath, "utf-8");
    expect(createDocumentContent).toContain(`export function CreateDocument()`);

    const folderTreePath = join(componentsDir, "FolderTree.tsx");
    expect(await fileExists(folderTreePath)).toBe(true);
    const folderTreeContent = await readFile(folderTreePath, "utf-8");
    expect(folderTreeContent).toContain(`export function FolderTree()`);

    const driveContentsPath = join(componentsDir, "DriveContents.tsx");
    expect(await fileExists(driveContentsPath)).toBe(true);
    const driveContentsContent = await readFile(driveContentsPath, "utf-8");
    expect(driveContentsContent).toContain(`export function DriveContents()`);

    const filesPath = join(componentsDir, "Files.tsx");
    expect(await fileExists(filesPath)).toBe(true);
    const filesContent = await readFile(filesPath, "utf-8");
    expect(filesContent).toContain(`export function Files()`);

    const foldersPath = join(componentsDir, "Folders.tsx");
    expect(await fileExists(foldersPath)).toBe(true);
    const foldersContent = await readFile(foldersPath, "utf-8");
    expect(foldersContent).toContain(`export function Folders()`);

    const emptyStatePath = join(componentsDir, "EmptyState.tsx");
    expect(await fileExists(emptyStatePath)).toBe(true);
    const emptyStateContent = await readFile(emptyStatePath, "utf-8");
    expect(emptyStateContent).toContain(`export function EmptyState()`);

    const navigationBreadcrumbsPath = join(
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

    await $`bun run --cwd ${outDir} tsc --noEmit`;
  });

  it("should append new exports to existing editors.ts file", async () => {
    const outDir = join(parentOutDir, "append-exports-to-existing-editors");
    await cpForce(join(dataDir, WITH_EDITORS), outDir);
    process.chdir(outDir);
    await generateDriveEditor({
      ...options,
    });
    const editorsDir = join(outDir, "editors");
    const editorsFilePath = join(editorsDir, "editors.ts");
    const editorsContent = await readFile(editorsFilePath, "utf-8");
    expect(editorsContent).toContain(`export const editors: EditorModule[]`);
    expect(editorsContent).toContain(`AtlasDriveExplorer`);
    expect(editorsContent).toContain(`ExistingDocumentEditor`);
    expect(editorsContent).toContain(`ExistingDriveEditor`);

    await $`bun run --cwd ${outDir} tsc --noEmit`;
  });
});
