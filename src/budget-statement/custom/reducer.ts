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
