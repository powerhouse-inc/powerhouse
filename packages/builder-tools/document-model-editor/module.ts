import type { EditorModule } from "document-model";
import { lazy } from "react";

export const documentModelEditorModule: EditorModule = {
  config: {
    id: "document-model-editor-v2",
    name: "Document Model Editor",
  },
  documentTypes: ["powerhouse/document-model"],
  Component: lazy(() =>
    import("./editor.js").then((m) => ({ default: m.DocumentModelEditor })),
  ),
};
