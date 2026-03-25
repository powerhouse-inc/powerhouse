import type { PHDocument, PHBaseState } from "document-model";
import type { BillingStatementAction } from "./actions.js";
import type { BillingStatementState as BillingStatementGlobalState } from "./schema/types.js";

type BillingStatementLocalState = Record<PropertyKey, never>;

type BillingStatementPHState = PHBaseState & {
  global: BillingStatementGlobalState;
  local: BillingStatementLocalState;
};
type BillingStatementDocument = PHDocument<BillingStatementPHState>;

export * from "./schema/types.js";

export type {
  BillingStatementGlobalState,
  BillingStatementLocalState,
  BillingStatementPHState,
  BillingStatementAction,
  BillingStatementDocument,
};
