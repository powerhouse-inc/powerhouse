import type { EditorModule } from "document-model";
import { lazy } from "react";

export const DocumentEditor: EditorModule = {
  Component: lazy(() => import("./editor.js")),
  documentTypes: ["powerhouse/document-editor"],
  config: {
    id: "document-editor-editor",
    name: "Document Editor Editor",
  },
};
