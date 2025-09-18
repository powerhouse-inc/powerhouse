/**
 * Factory methods for creating DocumentModelGlobalState instances
 */

// this was hand-edited to add relative imports
import {
  createBaseState,
  defaultBaseState,
} from "../../document/ph-factories.js";
// this was hand-edited to add relative imports
import type { PHBaseState, PHDocument } from "../../document/types.js";
import type {
  DocumentModelGlobalState,
  DocumentModelLocalState,
  DocumentModelPHState,
} from "./types.js";
import { documentModelCreateDocument } from "./utils.js";

export function defaultGlobalState(): DocumentModelGlobalState {
  return {
    ...defaultBaseState(),
    author: {
      name: "",
      website: "",
    },
    description: "",
    extension: "",
    id: "",
    name: "",
    specifications: [],
  };
}

export function defaultLocalState(): DocumentModelLocalState {
  return {};
}

export function defaultPHState(): DocumentModelPHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<DocumentModelGlobalState>,
): DocumentModelGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  } as DocumentModelGlobalState;
}

export function createLocalState(
  state?: Partial<DocumentModelLocalState>,
): DocumentModelLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as DocumentModelLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<DocumentModelGlobalState>,
  localState?: Partial<DocumentModelLocalState>,
): DocumentModelPHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a BillingStatementDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createDocumentModelDocument(
  state?: Partial<DocumentModelPHState>,
): PHDocument<DocumentModelPHState> {
  const document = documentModelCreateDocument(
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
