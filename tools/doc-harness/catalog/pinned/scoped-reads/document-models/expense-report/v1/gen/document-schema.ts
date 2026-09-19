/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { expenseReportDocumentType } from "./document-type.js";
import { ExpenseReportStateSchema } from "./schema/zod.js";
import type { ExpenseReportDocument, ExpenseReportPHState } from "./types.js";

/** Schema for validating the header object of a ExpenseReport document */
export const ExpenseReportDocumentHeaderSchema =
  BaseDocumentHeaderSchema.extend({
    documentType: z.literal(expenseReportDocumentType),
  });

/** Schema for validating the state object of a ExpenseReport document */
export const ExpenseReportPHStateSchema = BaseDocumentStateSchema.extend({
  global: ExpenseReportStateSchema(),
});

export const ExpenseReportDocumentSchema = z.object({
  header: ExpenseReportDocumentHeaderSchema,
  state: ExpenseReportPHStateSchema,
  initialState: ExpenseReportPHStateSchema,
});

/** Simple helper function to check if a state object is a ExpenseReport document state object */
export function isExpenseReportState(
  state: unknown,
): state is ExpenseReportPHState {
  return ExpenseReportPHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a ExpenseReport document state object */
export function assertIsExpenseReportState(
  state: unknown,
): asserts state is ExpenseReportPHState {
  ExpenseReportPHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a ExpenseReport document */
export function isExpenseReportDocument(
  document: unknown,
): document is ExpenseReportDocument {
  return ExpenseReportDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a ExpenseReport document */
export function assertIsExpenseReportDocument(
  document: unknown,
): asserts document is ExpenseReportDocument {
  ExpenseReportDocumentSchema.parse(document);
}
