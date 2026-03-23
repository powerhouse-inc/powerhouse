/**
 * Factory methods for creating TestDocDocument instances
 */
import type {
  PHAuthState,
  PHBaseState,
  PHDocumentState,
} from "@powerhousedao/shared/document-model";
import {
  createBaseState,
  defaultBaseState,
} from "@powerhousedao/shared/document-model";
import type {
  TestDocDocument,
  TestDocGlobalState,
  TestDocLocalState,
  TestDocPHState,
} from "./types.js";
import { utils } from "./utils.js";

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
  const document = utils.createDocument(
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
