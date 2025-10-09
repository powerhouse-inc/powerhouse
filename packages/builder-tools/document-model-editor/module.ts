import { DocumentModelEditor } from "@powerhousedao/builder-tools/editor";
import type { EditorModule } from "document-model";

export const documentModelEditorModule: EditorModule = {
  config: {
    id: "document-model-editor-v2",
    name: "Document Model Editor",
  },
  documentTypes: ["powerhouse/document-model"],
  Component: DocumentModelEditor,
};
