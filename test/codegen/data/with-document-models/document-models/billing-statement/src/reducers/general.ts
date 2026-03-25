import {
  InvalidStatusTransition,
  StatusAlreadySet,
} from "../../gen/general/error.js";
import type { BillingStatementGeneralOperations } from "document-models/billing-statement";

export const billingStatementGeneralOperations: BillingStatementGeneralOperations =
  {
    editBillingStatementOperation(state, action) {
      // TODO: implement editBillingStatementOperation reducer
      throw new Error(
        "Reducer for 'editBillingStatementOperation' not implemented.",
      );
    },
    editContributorOperation(state, action) {
      // TODO: implement editContributorOperation reducer
      throw new Error(
        "Reducer for 'editContributorOperation' not implemented.",
      );
    },
    editStatusOperation(state, action) {
      if (state.status === "PAID") {
        throw new InvalidStatusTransition("Cannot change status from PAID");
      }
      if (state.status === action.input.status) {
        throw new StatusAlreadySet("Status already set");
      }
      state.status = action.input.status;
    },
  };
