import { createReducer } from '../document';
import { BudgetStatementAction, State } from './types';
import {
    ADD_ACCOUNT,
    DELETE_ACCOUNT,
    UPDATE_ACCOUNT,
    addAccountOperation,
    deleteAccountOperation,
    updateAccountOperation,
} from './account';
import {
    ADD_LINE_ITEM,
    DELETE_LINE_ITEM,
    UPDATE_LINE_ITEM,
    addLineItemOperation,
    deleteLineItemOperation,
    updateLineItemOperation,
} from './line-item';
import {
    APPROVE,
    ESCALATE,
    REOPEN,
    SUBMIT_FOR_REVIEW,
    approveOperation,
    escalateOperation,
    reopenOperation,
    submitForReviewOperation,
} from './status';
import {
    REQUEST_TOPUP,
    TRANSFER_TOPUP,
    requestTopupOperation,
    transferTopupOperation,
} from './topup';

export const reducer = createReducer<State, BudgetStatementAction>(
    (state, action) => {
        switch (action.type) {
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
                return submitForReviewOperation(state, action);
            case ESCALATE:
                return escalateOperation(state, action);
            case APPROVE:
                return approveOperation(state, action);
            case REOPEN:
                return reopenOperation(state, action);
            case REQUEST_TOPUP:
                return requestTopupOperation(state, action);
            case TRANSFER_TOPUP:
                return transferTopupOperation(state, action);
            default:
                return state;
        }
    }
);
