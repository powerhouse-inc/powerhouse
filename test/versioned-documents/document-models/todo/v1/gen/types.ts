import type {
    PHBaseState,
    PHDocument,
} from "document-model";
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
    TodoAction,
    TodoDocument, TodoGlobalState,
    TodoLocalState,
    TodoPHState
};

