import "@powerhousedao/powerhouse-vetra-packages/editors/style.css";
import { GenericDriveExplorer } from "@powerhousedao/common/generic-drive-explorer";
import { DocumentModelEditor } from "@powerhousedao/powerhouse-vetra-packages/editors";
import type { VetraEditorModule } from "@powerhousedao/reactor-browser";
import { DEFAULT_DRIVE_EDITOR_ID } from "@powerhousedao/reactor-browser";

export function loadGenericDriveExplorerEditorModule(): VetraEditorModule {
  const name = "Generic Drive Explorer";
  const documentTypes = ["powerhouse/document-drive"];
  const Component = GenericDriveExplorer.Component;
  const vetraEditorModule: VetraEditorModule = {
    id: DEFAULT_DRIVE_EDITOR_ID,
    name,
    documentTypes,
    Component,
  };
  return vetraEditorModule;
}

export function loadDocumentModelEditor(): VetraEditorModule {
  const name = "Document Model Editor";
  const id = "document-model-editor-v2";
  const documentTypes = ["powerhouse/document-model"];
  const Component = DocumentModelEditor.Component;
  const vetraEditorModule: VetraEditorModule = {
    id,
    name,
    documentTypes,
    Component,
  };
  return vetraEditorModule;
}
