import type { EditorModule } from "@powerhousedao/shared/document-model";
import { lazy } from "react";
import { type EditorProps } from "./editor.js";

export const VetraPackageEditor: EditorModule<EditorProps> = {
  Component: lazy(() => import("./editor.js")),
  documentTypes: ["powerhouse/package"],
  config: {
    id: "vetra-package-editor",
    name: "Vetra Package Editor",
  },
};
