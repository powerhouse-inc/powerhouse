import type { EditorModule } from "document-model";
import { lazy } from "react";

export const SubgraphEditor: EditorModule = {
  Component: lazy(() => import("./editor.js")),
  documentTypes: ["powerhouse/subgraph"],
  config: {
    id: "subgraph-module-editor",
    name: "Subgraph Module Editor",
  },
};
