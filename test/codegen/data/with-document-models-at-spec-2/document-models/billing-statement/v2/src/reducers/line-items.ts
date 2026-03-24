import { DuplicateLineItem } from "../../gen/line-items/error.js";
import type { BillingStatementLineItemsOperations } from "document-models/billing-statement/v2";

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
      // TODO: implement editLineItemOperation reducer
      throw new Error("Reducer for 'editLineItemOperation' not implemented.");
    },
  };
