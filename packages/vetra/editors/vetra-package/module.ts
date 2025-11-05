import type { EditorModule } from "document-model";
import { lazy } from "react";
import { type EditorProps } from "./editor.js";

export const VetraDriveApp: EditorModule<EditorProps> = {
  Component: lazy(() => import("./editor.js")),
  documentTypes: ["powerhouse/package"],
  config: {
    id: "vetra-package-editor",
    name: "Vetra Package Editor",
  },
};

export default module;
