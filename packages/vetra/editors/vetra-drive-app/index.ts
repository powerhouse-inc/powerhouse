import type { DriveEditorModule } from "@powerhousedao/reactor-browser";
import Editor from "./editor.js";

export const module: DriveEditorModule = {
  Component: Editor,
  documentTypes: ["powerhouse/document-drive"],
  config: {
    id: "vetra-drive-app",
    name: "Vetra Drive App",
    disableExternalControls: true,
    documentToolbarEnabled: true,
    showSwitchboardLink: true,
  },
};

export default module;
