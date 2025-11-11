import "@powerhousedao/builder-tools/style.css";
import DriveExplorerEditor from "@powerhousedao/common/generic-drive-explorer/editor-component";
import DocumentModelEditor from "@powerhousedao/builder-tools/editor-component";
import type { VetraEditorModule } from "@powerhousedao/reactor-browser";
import { DEFAULT_DRIVE_EDITOR_ID } from "@powerhousedao/reactor-browser";
import { lazy } from "react";

export function loadGenericDriveExplorerEditorModule(): VetraEditorModule {
  const name = "Generic Drive Explorer";
  const documentTypes = ["powerhouse/document-drive"];
  const Component = DriveExplorerEditor;
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
  const Component = DocumentModelEditor;
  const vetraEditorModule: VetraEditorModule = {
    id,
    name,
    documentTypes,
    Component,
  };
  return vetraEditorModule;
}
