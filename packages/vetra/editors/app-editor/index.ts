import type { EditorModule } from "document-model";
import type { AppModuleDocument } from "../../document-models/app-module/index.js";
import Editor from "./editor.js";

export const module: EditorModule<AppModuleDocument> = {
  Component: Editor,
  documentTypes: ["powerhouse/app"],
  config: {
    id: "app-module-editor",
    disableExternalControls: true,
    documentToolbarEnabled: true,
    showSwitchboardLink: true,
  },
};

export default module;
