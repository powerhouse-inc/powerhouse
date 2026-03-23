import type { EditorModule } from "@powerhousedao/shared/document-model";
import { lazy } from "react";

export const VetraDriveApp: EditorModule = {
  Component: lazy(() => import("./editor.js")),
  documentTypes: ["powerhouse/document-drive"],
  config: {
    id: "vetra-drive-app",
    name: "Vetra Drive App",
  },
};
