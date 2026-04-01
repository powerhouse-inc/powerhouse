import { DocumentModelEditor } from "@powerhousedao/powerhouse-vetra-packages/editors";
import type { EditorModule } from "document-model";
export function loadGenericDriveExplorerEditorModule() {}

export function loadDocumentModelEditor(): EditorModule {
  return DocumentModelEditor;
}
