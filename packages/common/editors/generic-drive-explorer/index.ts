import type { DriveEditorModule } from "@powerhousedao/reactor-browser";
import Editor from "./editor.js";

export const GenericDriveExplorer: DriveEditorModule = {
  Component: Editor,
  documentTypes: ["powerhouse/document-drive"],
  config: {
    id: "GenericDriveExplorer",
    name: "Drive Explorer App",
    disableExternalControls: true,
    documentToolbarEnabled: true,
    showSwitchboardLink: true,
  },
};
