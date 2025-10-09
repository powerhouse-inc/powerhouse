import type { EditorModule } from "document-model";
import { Editor } from "./editor.js";

export const module: EditorModule = {
  Component: Editor,
  id: "document-editor-editor",
  name: "Document Editor",
  documentTypes: ["powerhouse/document-editor"],
};

export default module;
