import type { EditorModule } from "document-model";
import { lazy } from "react";

/** Document editor module for the "powerhouse/app" document type */
export const AppEditor: EditorModule = {
  Component: lazy(() => import("./editor.js")),
  documentTypes: ["powerhouse/app"],
  config: {
    id: "app-editor",
    name: "AppEditor",
  },
};
