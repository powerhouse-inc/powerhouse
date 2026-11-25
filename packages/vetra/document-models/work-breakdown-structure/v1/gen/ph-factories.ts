/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 * Factory methods for creating WorkBreakdownStructureDocument instances
 */
import type { PHAuthState, PHBaseState, PHDocumentState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model";
import type {
  WorkBreakdownStructureDocument,
  WorkBreakdownStructureGlobalState,
  WorkBreakdownStructureLocalState,
  WorkBreakdownStructurePHState,
} from "./types.js";
import { utils } from "./utils.js";

export function defaultGlobalState(): WorkBreakdownStructureGlobalState {
  return {
    feature: null,
    name: null,
    description: null,
    packages: [],
    tasks: [],
    status: "DRAFT",
  };
}

export function defaultLocalState(): WorkBreakdownStructureLocalState {
  return {};
}

export function defaultPHState(): WorkBreakdownStructurePHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<WorkBreakdownStructureGlobalState>,
): WorkBreakdownStructureGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  };
}

export function createLocalState(
  state?: Partial<WorkBreakdownStructureLocalState>,
): WorkBreakdownStructureLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as WorkBreakdownStructureLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<WorkBreakdownStructureGlobalState>,
  localState?: Partial<WorkBreakdownStructureLocalState>,
): WorkBreakdownStructurePHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a WorkBreakdownStructureDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createWorkBreakdownStructureDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<WorkBreakdownStructureGlobalState>;
    local?: Partial<WorkBreakdownStructureLocalState>;
  }>,
): WorkBreakdownStructureDocument {
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
