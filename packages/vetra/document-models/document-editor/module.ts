import type { DocumentModelModule } from "document-model";
import { createState } from "document-model";
import { defaultBaseState } from "document-model/core";
import type { DocumentEditorPHState } from "@powerhousedao/vetra/document-models/document-editor";
import {
  actions,
  documentModel,
  reducer,
  utils,
} from "@powerhousedao/vetra/document-models/document-editor";

/** Document model module for the Todo List document type */
export const DocumentEditor: DocumentModelModule<DocumentEditorPHState> = {
  version: 1,
  reducer,
  actions,
  utils,
  documentModel: createState(defaultBaseState(), documentModel),
};
