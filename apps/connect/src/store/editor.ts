import type { VetraEditorModule } from "@powerhousedao/reactor-browser";
import { DEFAULT_DRIVE_EDITOR_ID } from "@powerhousedao/reactor-browser";
import type { EditorProps } from "document-model";
import type { FC } from "react";

export async function loadGenericDriveExplorerEditorModule(): Promise<VetraEditorModule> {
  const { GenericDriveExplorer: genericDriveExplorerEditorModule } =
    await import("@powerhousedao/common/editors/generic-drive-explorer/index");
  const name = "Generic Drive Explorer";
  const documentTypes = genericDriveExplorerEditorModule.documentTypes;
  const Component = genericDriveExplorerEditorModule.Component;
  const config = genericDriveExplorerEditorModule.config;
  const vetraEditorModule: VetraEditorModule = {
    id: DEFAULT_DRIVE_EDITOR_ID,
    name,
    documentTypes,
    Component: Component as FC<EditorProps>,
    config,
  };
  return vetraEditorModule;
}

async function loadDocumentModelEditorModule() {
  // Import styles dynamically when the editor is loaded
  await import("@powerhousedao/builder-tools/style.css");

  const { documentModelEditorModule } = await import(
    "@powerhousedao/builder-tools/document-model-editor"
  );

  return documentModelEditorModule;
}

export async function loadDocumentModelEditor(): Promise<VetraEditorModule> {
  const documentModelEditorModule = await loadDocumentModelEditorModule();
  const config = documentModelEditorModule.config;
  const unsafeIdFromConfig = config.id;
  const name = "Document Model Editor";
  const documentTypes = documentModelEditorModule.documentTypes;
  const Component = documentModelEditorModule.Component;
  const vetraEditorModule: VetraEditorModule = {
    id: unsafeIdFromConfig,
    name,
    documentTypes,
    Component,
    config,
  };
  return vetraEditorModule;
}
