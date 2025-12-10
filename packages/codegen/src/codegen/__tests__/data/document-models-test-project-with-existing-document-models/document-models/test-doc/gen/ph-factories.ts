/**
 * Factory methods for creating TestDocDocument instances
 */
import type { PHAuthState, PHDocumentState, PHBaseState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model/core";
import type {
  TestDocDocument,
  TestDocLocalState,
  TestDocGlobalState,
  TestDocPHState,
} from "./types.js";
import { createDocument } from "./utils.js";

export function defaultGlobalState(): TestDocGlobalState {
  return {
    id: 0,
    name: "",
    description: null,
    value: "",
  };
}

export function defaultLocalState(): TestDocLocalState {
  return {};
}

export function defaultPHState(): TestDocPHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<TestDocGlobalState>,
): TestDocGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  } as TestDocGlobalState;
}

export function createLocalState(
  state?: Partial<TestDocLocalState>,
): TestDocLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as TestDocLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<TestDocGlobalState>,
  localState?: Partial<TestDocLocalState>,
): TestDocPHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a TestDocDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createTestDocDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<TestDocGlobalState>;
    local?: Partial<TestDocLocalState>;
  }>,
): TestDocDocument {
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
