/**
 * Factory methods for creating TodoListDocument instances
 */
import type { PHAuthState, PHDocumentState, PHBaseState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model/core";
import type {
  TodoListDocument,
  TodoListLocalState,
  TodoListGlobalState,
  TodoListPHState,
} from "./types.js";
import { createDocument } from "./utils.js";

export function defaultGlobalState(): TodoListGlobalState {
  return {
    items: [],
  };
}

export function defaultLocalState(): TodoListLocalState {
  return {};
}

export function defaultPHState(): TodoListPHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<TodoListGlobalState>,
): TodoListGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  } as TodoListGlobalState;
}

export function createLocalState(
  state?: Partial<TodoListLocalState>,
): TodoListLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as TodoListLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<TodoListGlobalState>,
  localState?: Partial<TodoListLocalState>,
): TodoListPHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a TodoListDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createTodoListDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<TodoListGlobalState>;
    local?: Partial<TodoListLocalState>;
  }>,
): TodoListDocument {
  const document = createDocument(
    state
      ? createState(
          createBaseState(state.auth, state.document),
          state.global,
          state.local,
        )
      : undefined,
  );

  return document;
}
