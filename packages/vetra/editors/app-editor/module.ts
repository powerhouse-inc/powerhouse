import type { EditorModule } from "document-model";
import { Editor } from "./editor.js";

/** Document editor module for the Todo List document type */
export const AppEditor: EditorModule = {
  Component: Editor,
  documentTypes: ["powerhouse/app"],
  config: {
    id: "app-editor",
    name: "AppEditor",
  },
};
