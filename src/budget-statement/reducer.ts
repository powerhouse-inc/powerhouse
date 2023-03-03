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
import { ADD_LINE_ITEM } from './line-item';

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
                return state;
            default:
                return state;
        }
    }
);
