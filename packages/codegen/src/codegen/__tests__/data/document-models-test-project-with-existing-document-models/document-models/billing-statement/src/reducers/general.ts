import { InvalidStatusTransition, StatusAlreadySet } from "../../gen/general/error.js";
import type { BillingStatementGeneralOperations } from "test/document-models/billing-statement";

export const billingStatementGeneralOperations: BillingStatementGeneralOperations = {
    editBillingStatementOperation(state, action) {
        // TODO: Implement "editBillingStatementOperation" reducer
        throw new Error('Reducer "editBillingStatementOperation" not yet implemented');
    },
    editContributorOperation(state, action) {
        // TODO: Implement "editContributorOperation" reducer
        throw new Error('Reducer "editContributorOperation" not yet implemented');
    },
    editStatusOperation(state, action) {
        if (state.status === 'PAID') { throw new InvalidStatusTransition('Cannot change status from PAID'); } if (state.status === action.input.status) { throw new StatusAlreadySet('Status already set'); } state.status = action.input.status;
    }
};
