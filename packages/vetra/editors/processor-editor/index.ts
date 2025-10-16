import type { EditorModule } from "document-model";
import { Editor } from "./editor.js";

export const module: EditorModule = {
  Component: Editor,
  documentTypes: ["powerhouse/processor"],
  config: {
    id: "processor-module-editor",
    name: "Processor Module Editor",
  },
};

export default module;
