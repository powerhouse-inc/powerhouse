import { createReducer } from '../../document';
import {
    ADD_ACCOUNT,
    UPDATE_ACCOUNT,
    DELETE_ACCOUNT,
    ADD_LINE_ITEM,
    UPDATE_LINE_ITEM,
    DELETE_LINE_ITEM,
    SUBMIT_FOR_REVIEW,
    ESCALATE,
    APPROVE,
    REOPEN,
    REQUEST_TOPUP,
    TRANSFER_TOPUP,
} from '../gen';
import {
    addAccountOperation,
    updateAccountOperation,
    deleteAccountOperation,
    addLineItemOperation,
    updateLineItemOperation,
    deleteLineItemOperation,
    submitForReviewOperation,
    escalateOperation,
    approveOperation,
    reopenOperation,
    requestTopupOperation,
    transferTopupOperation,
} from './actions';
import { State, BudgetStatementAction } from './types';

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
