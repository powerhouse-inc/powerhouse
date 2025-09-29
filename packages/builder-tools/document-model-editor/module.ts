import type { EditorModule } from "document-model";
import { DocumentModelEditor } from "@powerhousedao/builder-tools/editor";

export const documentModelEditorModule: EditorModule = {
  Component: DocumentModelEditor,
  documentTypes: ["powerhouse/document-model"],
  config: {
    id: "document-model-editor-v2",
    disableExternalControls: true,
    documentToolbarEnabled: true,
    timelineEnabled: true,
  },
};
