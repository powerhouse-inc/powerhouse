/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 * Factory methods for creating ExpenseReportDocument instances
 */
import type { PHAuthState, PHBaseState, PHDocumentState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model";
import type {
  ExpenseReportDocument,
  ExpenseReportGlobalState,
  ExpenseReportLocalState,
  ExpenseReportPHState,
} from "./types.js";
import { utils } from "./utils.js";

export function defaultGlobalState(): ExpenseReportGlobalState {
  return { expenses: [] };
}

export function defaultLocalState(): ExpenseReportLocalState {
  return { reviewNotes: [] };
}

export function defaultPHState(): ExpenseReportPHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<ExpenseReportGlobalState>,
): ExpenseReportGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  };
}

export function createLocalState(
  state?: Partial<ExpenseReportLocalState>,
): ExpenseReportLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as ExpenseReportLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<ExpenseReportGlobalState>,
  localState?: Partial<ExpenseReportLocalState>,
): ExpenseReportPHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a ExpenseReportDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createExpenseReportDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<ExpenseReportGlobalState>;
    local?: Partial<ExpenseReportLocalState>;
  }>,
): ExpenseReportDocument {
  const document = utils.createDocument(
    createState(
      createBaseState(state?.auth, { version: 1, ...state?.document }),
      state?.global,
      state?.local,
    ),
  );

  return document;
}
