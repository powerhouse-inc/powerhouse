import type { EditorModule } from "document-model";
import { Editor } from "./editor.js";

export const module: EditorModule = {
  Component: Editor,
  id: "vetra-drive-app",
  name: "Vetra Drive App",
  documentTypes: ["powerhouse/document-drive"],
};

export default module;
