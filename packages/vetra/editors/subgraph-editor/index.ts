import type { EditorModule } from "document-model";
import type { SubgraphModuleDocument } from "../../document-models/subgraph-module/index.js";
import Editor from "./editor.js";

export const module: EditorModule<SubgraphModuleDocument> = {
  Component: Editor,
  documentTypes: ["powerhouse/subgraph"],
  config: {
    id: "subgraph-module-editor",
    disableExternalControls: true,
    documentToolbarEnabled: true,
    showSwitchboardLink: true,
  },
};

export default module;
