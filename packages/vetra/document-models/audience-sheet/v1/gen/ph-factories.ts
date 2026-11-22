/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 * Factory methods for creating AudienceSheetDocument instances
 */
import type { PHAuthState, PHBaseState, PHDocumentState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model";
import type {
  AudienceSheetDocument,
  AudienceSheetGlobalState,
  AudienceSheetLocalState,
  AudienceSheetPHState,
} from "./types.js";
import { utils } from "./utils.js";

export function defaultGlobalState(): AudienceSheetGlobalState {
  return {
    segments: [],
    agentFeedback: {
      readyForFeedback: false,
      suggestions: [],
    },
  };
}

export function defaultLocalState(): AudienceSheetLocalState {
  return {};
}

export function defaultPHState(): AudienceSheetPHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<AudienceSheetGlobalState>,
): AudienceSheetGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  };
}

export function createLocalState(
  state?: Partial<AudienceSheetLocalState>,
): AudienceSheetLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as AudienceSheetLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<AudienceSheetGlobalState>,
  localState?: Partial<AudienceSheetLocalState>,
): AudienceSheetPHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a AudienceSheetDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createAudienceSheetDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<AudienceSheetGlobalState>;
    local?: Partial<AudienceSheetLocalState>;
  }>,
): AudienceSheetDocument {
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
