import "@powerhousedao/builder-tools/style.css";
import type { VetraEditorModule } from "@powerhousedao/reactor-browser";
import { DEFAULT_DRIVE_EDITOR_ID } from "@powerhousedao/reactor-browser";

export async function loadGenericDriveExplorerEditorModule(): Promise<VetraEditorModule> {
  const name = "Generic Drive Explorer";
  const editorImport = await import(
    "@powerhousedao/common/generic-drive-explorer"
  );
  const { GenericDriveExplorer } = editorImport;
  const documentTypes = GenericDriveExplorer.documentTypes;
  const Component = GenericDriveExplorer.Component;
  const vetraEditorModule: VetraEditorModule = {
    id: DEFAULT_DRIVE_EDITOR_ID,
    name,
    documentTypes,
    Component,
  };
  return vetraEditorModule;
}

export async function loadDocumentModelEditor(): Promise<VetraEditorModule> {
  const name = "Document Model Editor";
  const id = "document-model-editor-v2";
  const editorImport = await import("@powerhousedao/builder-tools/editor");
  const { documentModelEditorModule } = editorImport;
  const documentTypes = documentModelEditorModule.documentTypes;
  const Component = documentModelEditorModule.Component;
  const vetraEditorModule: VetraEditorModule = {
    id,
    name,
    documentTypes,
    Component,
  };
  return vetraEditorModule;
}
