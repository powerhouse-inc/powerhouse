import type { EditorModule } from "document-model";
import type { ProcessorModuleDocument } from "../../document-models/processor-module/index.js";
import Editor from "./editor.js";

export const module: EditorModule<ProcessorModuleDocument> = {
  Component: Editor,
  documentTypes: ["powerhouse/processor"],
  config: {
    id: "processor-module-editor",
    disableExternalControls: true,
    documentToolbarEnabled: true,
    showSwitchboardLink: true,
  },
};

export default module;
