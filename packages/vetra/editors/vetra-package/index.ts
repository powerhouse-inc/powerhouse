import type { EditorModule } from "document-model";
import { Editor } from "./editor.js";

export const module: EditorModule = {
  Component: Editor,
  documentTypes: ["powerhouse/package"],
  config: {
    id: "vetra-package-editor",
    name: "Vetra Package Editor",
  },
};

export default module;
