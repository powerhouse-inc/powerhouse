/**
 * Factory methods for creating BillingStatementDocument instances
 */
import type { PHAuthState, PHDocumentState, PHBaseState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model/core";
import type {
  BillingStatementDocument,
  BillingStatementLocalState,
  BillingStatementGlobalState,
  BillingStatementPHState,
} from "./types.js";
import { createDocument } from "./utils.js";

export function defaultGlobalState(): BillingStatementGlobalState {
  return {
    contributor: "",
    dateIssued: "2025-06-10T15:42:17.873Z",
    dateDue: "2025-06-10T15:42:17.873Z",
    lineItems: [],
    status: "DRAFT",
    currency: "",
    totalCash: 0,
    totalPowt: 0,
    notes: "",
  };
}

export function defaultLocalState(): BillingStatementLocalState {
  return {};
}

export function defaultPHState(): BillingStatementPHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<BillingStatementGlobalState>,
): BillingStatementGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  } as BillingStatementGlobalState;
}

export function createLocalState(
  state?: Partial<BillingStatementLocalState>,
): BillingStatementLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as BillingStatementLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<BillingStatementGlobalState>,
  localState?: Partial<BillingStatementLocalState>,
): BillingStatementPHState {
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
export function createBillingStatementDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<BillingStatementGlobalState>;
    local?: Partial<BillingStatementLocalState>;
  }>,
): BillingStatementDocument {
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
