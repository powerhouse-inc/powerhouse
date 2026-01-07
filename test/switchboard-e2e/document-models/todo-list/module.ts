import type { DocumentModelModule } from "document-model";
import type { TodoListPHState } from "./gen/types.js";
import {
  actions,
  documentModel,
  reducer,
  utils,
  createTodoListDocument,
} from "./index.js";

/** Document model module for the Todo List document type */
export const TodoList: DocumentModelModule<TodoListPHState> = {
  reducer,
  actions,
  utils,
  documentModel: createTodoListDocument(),
};
