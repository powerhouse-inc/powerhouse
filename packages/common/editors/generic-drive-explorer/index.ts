import { DocumentDriveDocument } from "document-drive";
import { EditorModule } from "document-model";
import Editor from "./editor.js";

export const GenericDriveExplorer: EditorModule<DocumentDriveDocument> = {
  Component: Editor,
  documentTypes: ["powerhouse/document-drive"],
  config: {
    id: "GenericDriveExplorer",
    disableExternalControls: true,
    documentToolbarEnabled: true,
    showSwitchboardLink: true,
  },
};
