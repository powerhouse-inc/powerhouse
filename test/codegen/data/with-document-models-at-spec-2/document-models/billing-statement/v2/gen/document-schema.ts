import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { billingStatementDocumentType } from "./document-type.js";
import { BillingStatementStateSchema } from "./schema/zod.js";
import type {
  BillingStatementDocument,
  BillingStatementPHState,
} from "./types.js";

/** Schema for validating the header object of a BillingStatement document */
export const BillingStatementDocumentHeaderSchema =
  BaseDocumentHeaderSchema.extend({
    documentType: z.literal(billingStatementDocumentType),
  });

/** Schema for validating the state object of a BillingStatement document */
export const BillingStatementPHStateSchema = BaseDocumentStateSchema.extend({
  global: BillingStatementStateSchema(),
});

export const BillingStatementDocumentSchema = z.object({
  header: BillingStatementDocumentHeaderSchema,
  state: BillingStatementPHStateSchema,
  initialState: BillingStatementPHStateSchema,
});

/** Simple helper function to check if a state object is a BillingStatement document state object */
export function isBillingStatementState(
  state: unknown,
): state is BillingStatementPHState {
  return BillingStatementPHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a BillingStatement document state object */
export function assertIsBillingStatementState(
  state: unknown,
): asserts state is BillingStatementPHState {
  BillingStatementPHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a BillingStatement document */
export function isBillingStatementDocument(
  document: unknown,
): document is BillingStatementDocument {
  return BillingStatementDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a BillingStatement document */
export function assertIsBillingStatementDocument(
  document: unknown,
): asserts document is BillingStatementDocument {
  BillingStatementDocumentSchema.parse(document);
}
