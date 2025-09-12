import { documentModelEditorModule } from "@powerhousedao/builder-tools/editor";
import { GenericDriveExplorer as genericDriveExplorerEditorModule } from "@powerhousedao/common";
import type { VetraEditorModule } from "@powerhousedao/reactor-browser";
import { DEFAULT_DRIVE_EDITOR_ID } from "@powerhousedao/reactor-browser";
export async function loadGenericDriveExplorerEditorModule(): Promise<VetraEditorModule> {
  const name = "Generic Drive Explorer";
  const documentTypes = genericDriveExplorerEditorModule.documentTypes;
  const Component = genericDriveExplorerEditorModule.Component;
  const config = genericDriveExplorerEditorModule.config;
  const vetraEditorModule: VetraEditorModule = {
    id: DEFAULT_DRIVE_EDITOR_ID,
    name,
    documentTypes,
    Component,
    config,
  };
  return vetraEditorModule;
}

export async function loadDocumentModelEditor(): Promise<VetraEditorModule> {
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
