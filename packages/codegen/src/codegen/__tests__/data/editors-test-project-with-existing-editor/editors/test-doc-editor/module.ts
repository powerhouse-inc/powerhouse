import type { EditorModule } from "document-model";
import { lazy } from "react";

/** Document editor module for the Todo List document type */
export const TestDocEditor: EditorModule = {
  Component: lazy(() => import("./editor.js")),
  documentTypes: ["powerhouse/test-doc"],
  config: {
    id: "test-document-model-editor",
    name: "TestDocEditor",
  },
};
