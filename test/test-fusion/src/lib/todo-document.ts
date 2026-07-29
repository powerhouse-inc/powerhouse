import {
  baseCreateDocument,
  createAction,
  createBaseState,
  generateId,
  type Action,
  type PHBaseState,
  type PHDocument,
} from "document-model";

// The `todo` model the local switchboard loads from `test/versioned-documents`
// (`document-models/todo/todo.json`), at its current version.
export const TODO_DOCUMENT_TYPE = "test/todo";
const TODO_DOCUMENT_VERSION = 2;

export type TodoItem = {
  id: string;
  title: string;
  completed: boolean;
};

export type TodoGlobalState = {
  title: string;
  todos: TodoItem[];
};

export type TodoPHState = PHBaseState & {
  global: TodoGlobalState;
  local: Record<string, never>;
};

// The demo deliberately keeps its own tiny mirror of the model instead of
// importing the generated module: the point of the light client is that a web
// app needs no reducer, no document-model module and no reactor in its bundle.
// The switchboard owns the model and rejects anything that does not match it.
function createTodoState(state?: Partial<TodoPHState>): TodoPHState {
  return {
    ...createBaseState(state?.auth, {
      version: TODO_DOCUMENT_VERSION,
      ...state?.document,
    }),
    global: { title: "", todos: [], ...state?.global },
    local: {},
  };
}

/** Builds an unsigned, empty todo document ready for `client.create`. */
export function createTodoDocument(): PHDocument<TodoPHState> {
  return baseCreateDocument<TodoPHState>(
    createTodoState,
    undefined,
    TODO_DOCUMENT_TYPE,
  );
}

/** The `ADD_TODO` action of the todo model's `todo_operations` module. */
export function addTodo(title: string): Action {
  return createAction(
    "ADD_TODO",
    { id: generateId(), title, completed: false },
    undefined,
    undefined,
    "global",
  );
}

/** Reads the todo list off a document whose state shape is not known statically. */
export function readTodos(document: PHDocument | undefined): TodoItem[] {
  const state = document?.state as Partial<TodoPHState> | undefined;
  return state?.global?.todos ?? [];
}
