import type { EditorModule } from "document-model";
import { Editor } from "./editor.js";

export const DocumentEditor: EditorModule = {
  Component: Editor,
  documentTypes: ["powerhouse/document-editor"],
  config: {
    id: "document-editor-editor",
    name: "Document Editor Editor",
  },
};
