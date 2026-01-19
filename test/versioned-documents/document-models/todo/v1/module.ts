import type { DocumentModelModule } from "document-model";
import { createState } from "document-model";
import { defaultBaseState } from "document-model/core";
import type { TodoPHState } from "versioned-documents/document-models/todo/v1";
import {
  actions,
  documentModel,
  reducer,
  utils,
} from "versioned-documents/document-models/todo/v1";

/** Document model module for the Todo List document type */
export const Todo: DocumentModelModule<TodoPHState> = {
  version: 1,
  reducer,
  actions,
  utils,
  documentModel: createState(defaultBaseState(), documentModel),
};
