import { Editor } from "@powerhousedao/common";
import type { DriveEditorModule } from "@powerhousedao/reactor-browser";

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
