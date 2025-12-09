import { DuplicateLineItem } from "../../gen/line-items/error.js";
import type { BillingStatementLineItemsOperations } from "test/document-models/billing-statement/v1";

export const billingStatementLineItemsOperations: BillingStatementLineItemsOperations =
  {
    addLineItemOperation(state, action) {
      const existingItem = state.lineItems.find(
        (item) => item.id === action.input.id,
      );
      if (existingItem) {
        throw new DuplicateLineItem("Line item already exists");
      }
      state.lineItems.push({ ...action.input, lineItemTag: [] });
    },
    editLineItemOperation(state, action) {
      // TODO: Implement "editLineItemOperation" reducer
      throw new Error('Reducer "editLineItemOperation" not yet implemented');
    },
  };
