import { type DriveEditorModule } from "@powerhousedao/reactor-browser";
import Editor from "./editor.js";

export const module: DriveEditorModule = {
  Component: Editor,
  documentTypes: ["powerhouse/document-drive"],
  config: {
    id: "DRIVE_EDITOR_ID",
    disableExternalControls: true,
    documentToolbarEnabled: true,
    showSwitchboardLink: true,
  },
};

export default module;
