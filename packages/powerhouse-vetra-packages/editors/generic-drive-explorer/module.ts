import type { EditorModule } from "document-model";
import { lazy } from "react";

export const GenericDriveExplorer: EditorModule = {
  Component: lazy(() => import("./editor.js")),
  config: {
    id: "GenericDriveExplorer",
    name: "Drive Explorer App",
  },
  documentTypes: ["powerhouse/document-drive"],
};
