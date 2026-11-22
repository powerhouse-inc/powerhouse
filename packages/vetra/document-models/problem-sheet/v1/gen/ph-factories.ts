/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 * Factory methods for creating ProblemSheetDocument instances
 */
import type { PHAuthState, PHBaseState, PHDocumentState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model";
import type {
  ProblemSheetDocument,
  ProblemSheetGlobalState,
  ProblemSheetLocalState,
  ProblemSheetPHState,
} from "./types.js";
import { utils } from "./utils.js";

export function defaultGlobalState(): ProblemSheetGlobalState {
  return {
    context: null,
    coreJob: null,
    coreJobSteps: [],
    roles: [],
    outcomes: [],
    constraints: [],
    agentFeedback: {
      readyForFeedback: false,
      suggestions: [],
    },
  };
}

export function defaultLocalState(): ProblemSheetLocalState {
  return {};
}

export function defaultPHState(): ProblemSheetPHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<ProblemSheetGlobalState>,
): ProblemSheetGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  };
}

export function createLocalState(
  state?: Partial<ProblemSheetLocalState>,
): ProblemSheetLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as ProblemSheetLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<ProblemSheetGlobalState>,
  localState?: Partial<ProblemSheetLocalState>,
): ProblemSheetPHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a ProblemSheetDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createProblemSheetDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<ProblemSheetGlobalState>;
    local?: Partial<ProblemSheetLocalState>;
  }>,
): ProblemSheetDocument {
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
