import type { PHDocument, PHBaseState } from "document-model";
import type { TodoAction } from "./actions.js";
import type { TodoState as TodoGlobalState } from "./schema/types.js";

type TodoLocalState = Record<PropertyKey, never>;

type TodoPHState = PHBaseState & {
  global: TodoGlobalState;
  local: TodoLocalState;
};
type TodoDocument = PHDocument<TodoPHState>;

export * from "./schema/types.js";

export type {
  TodoGlobalState,
  TodoLocalState,
  TodoPHState,
  TodoAction,
  TodoDocument,
};
