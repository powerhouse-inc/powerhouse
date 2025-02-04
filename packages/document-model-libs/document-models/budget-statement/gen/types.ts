import type { Document, ExtendedState } from "document-model/document";
import type { BudgetStatementState } from "./schema/types";
import type { BudgetStatementLocalState } from "./schema/types";
import type { BudgetStatementAction } from "./actions";

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
