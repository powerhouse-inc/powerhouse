import { createReducer } from '../../document';
import {
    ADD_ACCOUNT,
    ADD_AUDIT_REPORT,
    ADD_LINE_ITEM,
    APPROVE,
    DELETE_ACCOUNT,
    DELETE_AUDIT_REPORT,
    DELETE_LINE_ITEM,
    ESCALATE,
    INIT,
    REOPEN_TO_DRAFT,
    REOPEN_TO_REVIEW,
    REQUEST_TOPUP,
    SUBMIT_FOR_REVIEW,
    TRANSFER_TOPUP,
    UPDATE_ACCOUNT,
    UPDATE_LINE_ITEM,
} from '../gen';
import {
    addAccountOperation,
    addLineItemOperation,
    approveOperation,
    deleteAccountOperation,
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
import {
    addAuditReportOperation,
    deleteAuditReportOperation,
} from './actions/audit';
import { BudgetStatementAction, State } from './types';

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
