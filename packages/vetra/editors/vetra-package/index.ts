import type { EditorModule } from "document-model";
import Editor from "./editor.js";

export const module: EditorModule = {
  Component: Editor,
  documentTypes: ["powerhouse/package"],
  config: {
    id: "vetra-package-editor",
    disableExternalControls: true,
    documentToolbarEnabled: true,
    showSwitchboardLink: true,
  },
};

export default module;
