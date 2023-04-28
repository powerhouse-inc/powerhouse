import { z } from 'document-model-graphql/budget-statement';
import { isBaseAction } from '../../document/actions/types';
import { createReducer } from '../../document/utils';
import {
    ADD_ACCOUNT,
    DELETE_ACCOUNT,
    UPDATE_ACCOUNT,
} from '../gen/account/types';
import { ADD_AUDIT_REPORT, DELETE_AUDIT_REPORT } from '../gen/audit/types';
import {
    ADD_COMMENT,
    DELETE_COMMENT,
    UPDATE_COMMENT,
} from '../gen/comment/types';
import { INIT } from '../gen/init/types';
import {
    ADD_LINE_ITEM,
    DELETE_LINE_ITEM,
    UPDATE_LINE_ITEM,
} from '../gen/line-item/types';
import {
    ADD_VESTING,
    DELETE_VESTING,
    UPDATE_VESTING,
} from '../gen/vesting/types';
import {
    addAccountOperation,
    addAuditReportOperation,
    addLineItemOperation,
    deleteAccountOperation,
    deleteAuditReportOperation,
    deleteLineItemOperation,
    initOperation,
    updateAccountOperation,
    updateLineItemOperation,
} from './actions';
import {
    addCommentOperation,
    deleteCommentOperation,
    updateCommentOperation,
} from './actions/comment';
import {
    addVestingOperation,
    deleteVestingOperation,
    updateVestingOperation,
} from './actions/vesting';
import { BudgetStatementAction, State } from './types';

/**
 * Reducer for the BudgetStatement module, which handles operations related to budget statements.
 * @remarks
 * This reducer handles the following actions:
 * - `INIT`: initializes the state of the module.
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
 * - `ADD_AUDIT_REPORT`: adds an audit report to an account in the state.
 * - `DELETE_AUDIT_REPORT`: removes an audit report from an account in the state.
 * @param state - The current state of the module.
 * @param action - The action to be performed on the state.
 * @returns The new state after applying the action.
 */
export const reducer = createReducer<State, BudgetStatementAction>(
    (state, action) => {
        if (isBaseAction(action)) {
            return state;
        }

        z.BudgetStatementActionSchema().parse(action);

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
            case ADD_AUDIT_REPORT:
                return addAuditReportOperation(state, action);
            case DELETE_AUDIT_REPORT:
                return deleteAuditReportOperation(state, action);
            case ADD_VESTING:
                return addVestingOperation(state, action);
            case UPDATE_VESTING:
                return updateVestingOperation(state, action);
            case DELETE_VESTING:
                return deleteVestingOperation(state, action);
            case ADD_COMMENT:
                return addCommentOperation(state, action);
            case UPDATE_COMMENT:
                return updateCommentOperation(state, action);
            case DELETE_COMMENT:
                return deleteCommentOperation(state, action);
            default:
                return state;
        }
    }
);
