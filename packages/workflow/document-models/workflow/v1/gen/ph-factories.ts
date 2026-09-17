/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 * Factory methods for creating WorkflowDocument instances
 */
import type { PHAuthState, PHBaseState, PHDocumentState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model";
import type {
  WorkflowDocument,
  WorkflowGlobalState,
  WorkflowLocalState,
  WorkflowPHState,
} from "./types.js";
import { utils } from "./utils.js";

export function defaultGlobalState(): WorkflowGlobalState {
  return {
    name: "",
    description: null,
    status: "DRAFT",
    version: 0,
    trigger: null,
    steps: [],
    edges: [],
    variables: [],
    policy: {
      concurrency: "QUEUE",
      maxParallelRuns: null,
      runTimeoutSeconds: 3600,
      maxSuspensionDays: 30,
      defaultRetry: {
        maxAttempts: 1,
        backoff: "FIXED",
        initialDelaySeconds: 5,
        maxDelaySeconds: 300,
        retryOn: [],
      },
      onFailure: "PARK",
      retainRunsDays: 30,
      journalAsDocument: false,
    },
    lastRunAt: null,
    lastRunStatus: null,
  };
}

export function defaultLocalState(): WorkflowLocalState {
  return {};
}

export function defaultPHState(): WorkflowPHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<WorkflowGlobalState>,
): WorkflowGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  };
}

export function createLocalState(
  state?: Partial<WorkflowLocalState>,
): WorkflowLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as WorkflowLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<WorkflowGlobalState>,
  localState?: Partial<WorkflowLocalState>,
): WorkflowPHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a WorkflowDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createWorkflowDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<WorkflowGlobalState>;
    local?: Partial<WorkflowLocalState>;
  }>,
): WorkflowDocument {
  const document = utils.createDocument(
    createState(
      createBaseState(state?.auth, { version: 1, ...state?.document }),
      state?.global,
      state?.local,
    ),
  );

  return document;
}
