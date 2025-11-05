import type { EditorModule } from "document-model";
import { lazy } from "react";

export const ProcessorEditor: EditorModule = {
  Component: lazy(() => import("./editor.js")),
  documentTypes: ["powerhouse/processor"],
  config: {
    id: "processor-module-editor",
    name: "Processor Module Editor",
  },
};
