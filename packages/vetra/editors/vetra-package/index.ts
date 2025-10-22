import type { EditorModule } from "document-model";
import { Editor, type EditorProps } from "./editor.js";

export const module: EditorModule<EditorProps> = {
  Component: Editor,
  documentTypes: ["powerhouse/package"],
  config: {
    id: "vetra-package-editor",
    name: "Vetra Package Editor",
  },
};

export default module;
