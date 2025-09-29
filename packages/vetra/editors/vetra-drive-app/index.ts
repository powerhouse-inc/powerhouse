import type { DriveEditorModule } from "@powerhousedao/reactor-browser";
import { Editor } from "./editor.js";

export const module: DriveEditorModule = {
  Component: Editor,
  documentTypes: ["powerhouse/document-drive"],
  config: {
    id: "vetra-drive-app",
    name: "Vetra Drive App",
    disableExternalControls: true,
    documentToolbarEnabled: true,
    showSwitchboardLink: true,
    documentTypes: [
      "powerhouse/document-model",
      "powerhouse/app",
      "powerhouse/document-editor",
      "powerhouse/processor",
      "powerhouse/subgraph",
      "powerhouse/package",
    ],
    dragAndDrop: {
      enabled: true,
    },
  },
};

export default module;
