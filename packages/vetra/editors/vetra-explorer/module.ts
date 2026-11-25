import type {
  DocumentDriveAction,
  DocumentDriveDocument,
} from "@powerhousedao/shared/document-drive";
import type { EditorModule } from "@powerhousedao/shared/document-model";
import { lazy } from "react";

export const VetraExplorerApp: EditorModule<
  DocumentDriveDocument,
  DocumentDriveAction
> = {
  Component: lazy(() => import("./editor.js")),
  documentTypes: ["powerhouse/document-drive"],
  config: {
    id: "vetra-explorer",
    name: "Vetra Explorer",
  },
};
