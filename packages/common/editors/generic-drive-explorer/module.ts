import { type DriveEditorModule } from "../../state/types.js";
import { Editor } from "./editor.js";

export const GenericDriveExplorer: DriveEditorModule = {
  Component: Editor,
  documentTypes: ["powerhouse/document-drive"],
  config: {
    id: "GenericDriveExplorer",
    disableExternalControls: true,
    documentToolbarEnabled: true,
    showSwitchboardLink: true,
  },
};
