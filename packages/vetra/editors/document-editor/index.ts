import type { EditorModule } from "document-model";
import type { DocumentEditorDocument } from "../../document-models/document-editor/index.js";
import Editor from "./editor.js";

export const module: EditorModule<DocumentEditorDocument> = {
  Component: Editor,
  documentTypes: ["powerhouse/document-editor"],
  config: {
    id: "document-editor-editor",
    disableExternalControls: true,
    documentToolbarEnabled: true,
    showSwitchboardLink: true,
  },
};

export default module;
