/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { PHBaseState, PHDocument } from "document-model";
import type { ExpenseReportAction } from "./actions.js";
import type {
  ExpenseReportState as ExpenseReportGlobalState,
  ExpenseReportLocalState,
} from "./schema/types.js";

type ExpenseReportPHState = PHBaseState & {
  global: ExpenseReportGlobalState;
  local: ExpenseReportLocalState;
};
type ExpenseReportDocument = PHDocument<ExpenseReportPHState>;

export * from "./schema/types.js";

export type {
  ExpenseReportAction,
  ExpenseReportDocument,
  ExpenseReportGlobalState,
  ExpenseReportLocalState,
  ExpenseReportPHState,
};
