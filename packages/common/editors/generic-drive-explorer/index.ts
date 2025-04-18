import { type DriveEditorModule } from "@powerhousedao/reactor-browser";
import { type DocumentDriveDocument } from "document-drive";
import Editor from "./editor.js";

export const GenericDriveExplorer: DriveEditorModule<DocumentDriveDocument> = {
  Component: Editor,
  documentTypes: ["powerhouse/document-drive"],
  config: {
    id: "GenericDriveExplorer",
    disableExternalControls: true,
    documentToolbarEnabled: true,
    showSwitchboardLink: true,
  },
};
