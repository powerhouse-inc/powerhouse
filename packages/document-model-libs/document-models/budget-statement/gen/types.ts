import type { Document, ExtendedState } from "document-model";
import type { BudgetStatementState } from "./schema/types";
import type { BudgetStatementLocalState } from "./schema/types";
import type { BudgetStatementAction } from "./actions.js";

export { z } from "./schema";
export type * from "./schema/types";
export type ExtendedBudgetStatementState = ExtendedState<
  BudgetStatementState,
  BudgetStatementLocalState
>;
export type BudgetStatementDocument = Document<
  BudgetStatementState,
  BudgetStatementAction,
  BudgetStatementLocalState
>;
export {
  BudgetStatementState,
  BudgetStatementLocalState,
  BudgetStatementAction,
};
