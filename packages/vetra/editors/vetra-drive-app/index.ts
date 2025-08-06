import { type DriveEditorModule } from "@powerhousedao/reactor-browser";
import { type DocumentDriveDocument } from "document-drive";
import Editor from "./editor.js";

export const module: DriveEditorModule<DocumentDriveDocument> = {
  Component: Editor,
  documentTypes: ["powerhouse/document-drive"],
  config: {
    id: "vetra-drive-app",
    disableExternalControls: true,
    documentToolbarEnabled: true,
    showSwitchboardLink: true,
  },
};

export default module;
