import { createReducer } from '../../document/utils';
import {
    ADD_ACCOUNT,
    DELETE_ACCOUNT,
    UPDATE_ACCOUNT,
} from '../gen/account/types';
import { ADD_AUDIT_REPORT, DELETE_AUDIT_REPORT } from '../gen/audit/types';
import { INIT } from '../gen/init/types';
import {
    ADD_LINE_ITEM,
    DELETE_LINE_ITEM,
    UPDATE_LINE_ITEM,
} from '../gen/line-item/types';
import {
    APPROVE,
    ESCALATE,
    REOPEN_TO_DRAFT,
    REOPEN_TO_REVIEW,
    SUBMIT_FOR_REVIEW,
} from '../gen/status/types';
import { REQUEST_TOPUP, TRANSFER_TOPUP } from '../gen/topup/types';
import {
    addAccountOperation,
    addAuditReportOperation,
    addLineItemOperation,
    approveOperation,
    deleteAccountOperation,
    deleteAuditReportOperation,
    deleteLineItemOperation,
    escalateOperation,
    initOperation,
    reopenToDraftOperation,
    reopenToReviewOperation,
    requestTopupOperation,
    submitForReviewOperation,
    transferTopupOperation,
    updateAccountOperation,
    updateLineItemOperation,
} from './actions';
import { BudgetStatementAction, State } from './types';

/**
 * Reducer for the BudgetStatement module, which handles operations related to budget statements.
 * @remarks
 * This reducer handles the following actions:
 * - `INIT: initializes the state of the module.
 * - `ADD_ACCOUNT`: adds an account to the state.
 * - `UPDATE_ACCOUNT`: updates an account in the state.
 * - `DELETE_ACCOUNT`: removes an account from the state.
 * - `ADD_LINE_ITEM`: adds a line item to an account in the state.
 * - `UPDATE_LINE_ITEM`: updates a line item in an account in the state.
 * - `DELETE_LINE_ITEM`: removes a line item from an account in the state.
 * - `SUBMIT_FOR_REVIEW`: updates the status of the budget statement to "Under Review".
 * - `ESCALATE`: escalates the budget statement to a higher authority.
 * - `APPROVE`: approves the budget statement.
 * - `REOPEN_TO_DRAFT`: changes the status of the budget statement to "Draft".
 * - `REOPEN_TO_REVIEW`: changes the status of the budget statement to "Under Review".
 * - `REQUEST_TOPUP`: requests a top-up of an account.
 * - `TRANSFER_TOPUP`: transfers a top-up to an account.
 * - `ADD_AUDIT_REPORT`: adds an audit report to an account in the state.
 * - `DELETE_AUDIT_REPORT`: removes an audit report from an account in the state.
 * @param state - The current state of the module.
 * @param action - The action to be performed on the state.
 * @returns The new state after applying the action.
 */
export const reducer = createReducer<State, BudgetStatementAction>(
    (state, action) => {
        switch (action.type) {
            case INIT:
                return initOperation(state, action);
            case ADD_ACCOUNT:
                return addAccountOperation(state, action);
            case UPDATE_ACCOUNT:
                return updateAccountOperation(state, action);
            case DELETE_ACCOUNT:
                return deleteAccountOperation(state, action);
            case ADD_LINE_ITEM:
                return addLineItemOperation(state, action);
            case UPDATE_LINE_ITEM:
                return updateLineItemOperation(state, action);
            case DELETE_LINE_ITEM:
                return deleteLineItemOperation(state, action);
            case SUBMIT_FOR_REVIEW:
                return submitForReviewOperation(state);
            case ESCALATE:
                return escalateOperation(state);
            case APPROVE:
                return approveOperation(state);
            case REOPEN_TO_DRAFT:
                return reopenToDraftOperation(state);
            case REOPEN_TO_REVIEW:
                return reopenToReviewOperation(state);
            case REQUEST_TOPUP:
                return requestTopupOperation(state, action);
            case TRANSFER_TOPUP:
                return transferTopupOperation(state, action);
            case ADD_AUDIT_REPORT:
                return addAuditReportOperation(state, action);
            case DELETE_AUDIT_REPORT:
                return deleteAuditReportOperation(state, action);
            default:
                return state;
        }
    }
);
