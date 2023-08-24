import { isBaseAction } from "../../document/actions/types";
import { createReducer } from "../../document/utils";
import { ImmutableStateReducer } from "../../document/types";
import { BudgetStatementState, z } from './schema';
import { BudgetStatementAction } from './actions';

import { reducer as AccountReducer } from '../custom/reducers/account';
import { reducer as LineItemReducer } from '../custom/reducers/line-item';
import { reducer as BaseReducer } from '../custom/reducers/base';
import { reducer as AuditReducer } from '../custom/reducers/audit';
import { reducer as CommentReducer } from '../custom/reducers/comment';
import { reducer as VestingReducer } from '../custom/reducers/vesting';


const stateReducer: ImmutableStateReducer<BudgetStatementState, BudgetStatementAction> =
    (state, action) => {
        if (isBaseAction(action)) {
            return state;
        }

        switch (action.type) {
            case "ADD_ACCOUNT":
                z.AddAccountInputSchema().parse(action.input);
                AccountReducer.addAccountOperation(state, action);
                break;

            case "UPDATE_ACCOUNT":
                z.UpdateAccountInputSchema().parse(action.input);
                AccountReducer.updateAccountOperation(state, action);
                break;

            case "DELETE_ACCOUNT":
                z.DeleteAccountInputSchema().parse(action.input);
                AccountReducer.deleteAccountOperation(state, action);
                break;

            case "SORT_ACCOUNTS":
                z.SortAccountsInputSchema().parse(action.input);
                AccountReducer.sortAccountsOperation(state, action);
                break;

            case "ADD_LINE_ITEM":
                z.AddLineItemInputSchema().parse(action.input);
                LineItemReducer.addLineItemOperation(state, action);
                break;

            case "UPDATE_LINE_ITEM":
                z.UpdateLineItemInputSchema().parse(action.input);
                LineItemReducer.updateLineItemOperation(state, action);
                break;

            case "DELETE_LINE_ITEM":
                z.DeleteLineItemInputSchema().parse(action.input);
                LineItemReducer.deleteLineItemOperation(state, action);
                break;

            case "SORT_LINE_ITEMS":
                z.SortLineItemsInputSchema().parse(action.input);
                LineItemReducer.sortLineItemsOperation(state, action);
                break;

            case "SET_OWNER":
                z.SetOwnerInputSchema().parse(action.input);
                BaseReducer.setOwnerOperation(state, action);
                break;

            case "SET_MONTH":
                z.SetMonthInputSchema().parse(action.input);
                BaseReducer.setMonthOperation(state, action);
                break;

            case "SET_FTES":
                z.SetFtesInputSchema().parse(action.input);
                BaseReducer.setFtesOperation(state, action);
                break;

            case "SET_QUOTE_CURRENCY":
                z.SetQuoteCurrencyInputSchema().parse(action.input);
                BaseReducer.setQuoteCurrencyOperation(state, action);
                break;

            case "ADD_AUDIT_REPORT":
                z.AddAuditReportInputSchema().parse(action.input);
                AuditReducer.addAuditReportOperation(state, action);
                break;

            case "DELETE_AUDIT_REPORT":
                z.DeleteAuditReportInputSchema().parse(action.input);
                AuditReducer.deleteAuditReportOperation(state, action);
                break;

            case "ADD_COMMENT":
                z.AddCommentInputSchema().parse(action.input);
                CommentReducer.addCommentOperation(state, action);
                break;

            case "UPDATE_COMMENT":
                z.UpdateCommentInputSchema().parse(action.input);
                CommentReducer.updateCommentOperation(state, action);
                break;

            case "DELETE_COMMENT":
                z.DeleteCommentInputSchema().parse(action.input);
                CommentReducer.deleteCommentOperation(state, action);
                break;

            case "ADD_VESTING":
                z.AddVestingInputSchema().parse(action.input);
                VestingReducer.addVestingOperation(state, action);
                break;

            case "UPDATE_VESTING":
                z.UpdateVestingInputSchema().parse(action.input);
                VestingReducer.updateVestingOperation(state, action);
                break;

            case "DELETE_VESTING":
                z.DeleteVestingInputSchema().parse(action.input);
                VestingReducer.deleteVestingOperation(state, action);
                break;

            default:
                return state;
        }
    }

export const reducer = createReducer<BudgetStatementState, BudgetStatementAction>(stateReducer);
