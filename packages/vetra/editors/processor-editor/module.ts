import type { EditorModule } from "document-model";
import { Editor } from "./editor.js";

export const ProcessorEditor: EditorModule = {
  Component: Editor,
  documentTypes: ["powerhouse/processor"],
  config: {
    id: "processor-module-editor",
    name: "Processor Module Editor",
  },
};
