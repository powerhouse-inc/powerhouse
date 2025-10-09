import type { EditorModule } from "document-model";
import { Editor } from "./editor.js";

export const module: EditorModule = {
  Component: Editor,
  id: "processor-module-editor",
  name: "Processor Module Editor",
  documentTypes: ["powerhouse/processor"],
};

export default module;
