import type { EditorModule } from "document-model";
import { Editor } from "./editor.js";

/** Document editor module for the Todo List document type */
export const TestDocEditor: EditorModule = {
  Component: Editor,
  documentTypes: ["powerhouse/test-doc"],
  config: {
    id: "test-document-model-editor",
    name: "TestDocEditor",
  },
};
