import type { EditorModule } from "document-model";
import type { VetraPackageDocument } from "../../document-models/vetra-package/index.js";
import Editor from "./editor.js";

export const module: EditorModule<VetraPackageDocument> = {
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
