import { Editor } from "@powerhousedao/common";
import type { EditorModule } from "document-model";

export const GenericDriveExplorer: EditorModule = {
  Component: Editor,
  config: {
    id: "GenericDriveExplorer",
    name: "Drive Explorer App",
  },
  documentTypes: ["powerhouse/document-drive"],
};
