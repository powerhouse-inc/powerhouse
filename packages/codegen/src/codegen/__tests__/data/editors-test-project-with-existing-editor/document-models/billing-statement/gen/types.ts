import type {
    PHBaseState,
    PHDocument,
} from "document-model";
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
    BillingStatementAction,
    BillingStatementDocument, BillingStatementGlobalState,
    BillingStatementLocalState,
    BillingStatementPHState
};

