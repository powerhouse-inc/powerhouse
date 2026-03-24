import type { DocumentModelModule } from "document-model";
import {
    createState,
    defaultBaseState,
} from "document-model";
import type { TodoPHState } from "document-models/todo/v1";
import {
    actions,
    documentModel,
    reducer,
    utils,
} from "document-models/todo/v1";

/** Document model module for the Todo List document type */
export const Todo: DocumentModelModule<TodoPHState> = {
  version: 1,
  reducer,
  actions,
  utils,
  documentModel: createState(defaultBaseState(), documentModel),
};
