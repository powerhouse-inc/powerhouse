import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { createState, defaultBaseState } from "@powerhousedao/shared/document-model";
import type { TodoPHState } from "document-models/todo/v2";
import {
  actions,
  documentModel,
  reducer,
  utils,
} from "document-models/todo/v2";

/** Document model module for the Todo List document type */
export const Todo: DocumentModelModule<TodoPHState> = {
  version: 2,
  reducer,
  actions,
  utils,
  documentModel: createState(defaultBaseState(), documentModel),
};
