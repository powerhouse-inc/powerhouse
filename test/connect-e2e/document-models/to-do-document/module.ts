import type { DocumentModelModule } from "document-model";
import { createState } from "document-model";
import { defaultBaseState } from "document-model/core";
import type { ToDoDocumentPHState } from "connect-e2e/document-models/to-do-document";
import {
  actions,
  documentModel,
  reducer,
  utils,
} from "connect-e2e/document-models/to-do-document";

/** Document model module for the Todo List document type */
export const ToDoDocument: DocumentModelModule<ToDoDocumentPHState> = {
  reducer,
  actions,
  utils,
  documentModel: createState(defaultBaseState(), documentModel),
};
