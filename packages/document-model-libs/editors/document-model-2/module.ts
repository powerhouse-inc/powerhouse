import type {
  DocumentModelAction,
  DocumentModelState,
  DocumentModelLocalState,
} from "document-model";
import { EditorModule } from "document-model";
import { DocumentModelEditor } from "./editor.js";

export const editorModule: EditorModule<
  DocumentModelState,
  DocumentModelLocalState,
  DocumentModelAction
> = {
  Component: DocumentModelEditor,
  documentTypes: ["powerhouse/document-model"],
  config: {
    id: "document-model-editor-v2",
    disableExternalControls: true,
    documentToolbarEnabled: true,
  },
};
