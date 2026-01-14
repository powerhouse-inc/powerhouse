import type { PHDocument, PHBaseState } from "document-model";
import type { TodoListAction } from "./actions.js";
import type { TodoListState as TodoListGlobalState } from "./schema/types.js";

type TodoListLocalState = Record<PropertyKey, never>;

type TodoListPHState = PHBaseState & {
  global: TodoListGlobalState;
  local: TodoListLocalState;
};
type TodoListDocument = PHDocument<TodoListPHState>;

export * from "./schema/types.js";

export type {
  TodoListGlobalState,
  TodoListLocalState,
  TodoListPHState,
  TodoListAction,
  TodoListDocument,
};
