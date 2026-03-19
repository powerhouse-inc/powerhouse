import type { DocumentEditorPHState } from "@powerhousedao/vetra/document-models/document-editor";
import {
  actions,
  documentModel,
  reducer,
  utils,
} from "@powerhousedao/vetra/document-models/document-editor";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { createState, defaultBaseState } from "@powerhousedao/shared/document-model";

/** Document model module for the Todo List document type */
export const DocumentEditor: DocumentModelModule<DocumentEditorPHState> = {
  version: 1,
  reducer,
  actions,
  utils,
  documentModel: createState(defaultBaseState(), documentModel),
};
