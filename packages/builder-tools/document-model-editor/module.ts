import type { DocumentModelDocument } from "document-model";
import { EditorModule } from "document-model";
import { DocumentModelEditor } from "./editor.js";

export const documentModelEditorModule: EditorModule<DocumentModelDocument> = {
  Component: DocumentModelEditor,
  documentTypes: ["powerhouse/document-model"],
  config: {
    id: "document-model-editor-v2",
    disableExternalControls: true,
    documentToolbarEnabled: true,
  },
};
