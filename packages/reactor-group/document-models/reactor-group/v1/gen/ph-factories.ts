/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 * Factory methods for creating ReactorGroupDocument instances
 */
import type { PHAuthState, PHBaseState, PHDocumentState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model";
import type {
  ReactorGroupDocument,
  ReactorGroupGlobalState,
  ReactorGroupLocalState,
  ReactorGroupPHState,
} from "./types.js";
import { utils } from "./utils.js";

export function defaultGlobalState(): ReactorGroupGlobalState {
  return {
    name: "",
    description: "",
    members: [],
  };
}

export function defaultLocalState(): ReactorGroupLocalState {
  return {};
}

export function defaultPHState(): ReactorGroupPHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<ReactorGroupGlobalState>,
): ReactorGroupGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  };
}

export function createLocalState(
  state?: Partial<ReactorGroupLocalState>,
): ReactorGroupLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as ReactorGroupLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<ReactorGroupGlobalState>,
  localState?: Partial<ReactorGroupLocalState>,
): ReactorGroupPHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a ReactorGroupDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createReactorGroupDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<ReactorGroupGlobalState>;
    local?: Partial<ReactorGroupLocalState>;
  }>,
): ReactorGroupDocument {
  const document = utils.createDocument(
    createState(
      createBaseState(state?.auth, { version: 1, ...state?.document }),
      state?.global,
      state?.local,
    ),
  );

  return document;
}
