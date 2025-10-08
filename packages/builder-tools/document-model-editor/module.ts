import { DocumentModelEditor } from "@powerhousedao/builder-tools/editor";
import type { EditorModule } from "document-model";
import { editorDocumentTypes, editorId, editorName } from "./constants.js";

export const documentModelEditorModule: EditorModule = {
  id: editorId,
  name: editorName,
  documentTypes: editorDocumentTypes,
  Component: DocumentModelEditor,
};
