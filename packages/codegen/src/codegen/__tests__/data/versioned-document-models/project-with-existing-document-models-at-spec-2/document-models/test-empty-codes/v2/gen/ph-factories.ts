/**
 * Factory methods for creating TestEmptyCodesDocument instances
 */
import type { PHAuthState, PHDocumentState, PHBaseState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model/core";
import type {
  TestEmptyCodesDocument,
  TestEmptyCodesLocalState,
  TestEmptyCodesGlobalState,
  TestEmptyCodesPHState,
} from "./types.js";
import { createDocument } from "./utils.js";

export function defaultGlobalState(): TestEmptyCodesGlobalState {
  return { value: "" };
}

export function defaultLocalState(): TestEmptyCodesLocalState {
  return {};
}

export function defaultPHState(): TestEmptyCodesPHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<TestEmptyCodesGlobalState>,
): TestEmptyCodesGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  } as TestEmptyCodesGlobalState;
}

export function createLocalState(
  state?: Partial<TestEmptyCodesLocalState>,
): TestEmptyCodesLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as TestEmptyCodesLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<TestEmptyCodesGlobalState>,
  localState?: Partial<TestEmptyCodesLocalState>,
): TestEmptyCodesPHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a TestEmptyCodesDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createTestEmptyCodesDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<TestEmptyCodesGlobalState>;
    local?: Partial<TestEmptyCodesLocalState>;
  }>,
): TestEmptyCodesDocument {
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
