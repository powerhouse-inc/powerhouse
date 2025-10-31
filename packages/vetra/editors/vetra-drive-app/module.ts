import type { EditorModule } from "document-model";
import { Editor } from "./editor.js";

export const VetraDriveApp: EditorModule = {
  Component: Editor,
  documentTypes: ["powerhouse/document-drive"],
  config: {
    id: "vetra-drive-app",
    name: "Vetra Drive App",
  },
};
