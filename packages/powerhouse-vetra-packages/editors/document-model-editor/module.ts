import type {
  DocumentModelAction,
  DocumentModelDocument,
  EditorModule,
} from "@powerhousedao/shared/document-model";
import { lazy } from "react";

export const DocumentModelEditor: EditorModule<
  DocumentModelDocument,
  DocumentModelAction
> = {
  config: {
    id: "document-model-editor-v2",
    name: "Document Model Editor",
  },
  documentTypes: ["powerhouse/document-model"],
  Component: lazy(() => import("./editor.js")),
};
