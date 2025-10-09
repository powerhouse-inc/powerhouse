import type { EditorModule } from "document-model";
import { Editor } from "./editor.js";

export const module: EditorModule = {
  Component: Editor,
  id: "vetra-package-editor",
  name: "Vetra Package Editor",
  documentTypes: ["powerhouse/package"],
};

export default module;
