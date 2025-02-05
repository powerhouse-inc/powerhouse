import { ImmutableStateReducer, utils } from "document-model";
import { BudgetStatementState, BudgetStatementLocalState } from "./types";
import { BudgetStatementAction } from "./actions.js";

import { reducer as AccountReducer } from "../src/reducers/account";
import { reducer as LineItemReducer } from "../src/reducers/line-item";
import { reducer as BaseReducer } from "../src/reducers/base";
import { reducer as AuditReducer } from "../src/reducers/audit";
import { reducer as CommentReducer } from "../src/reducers/comment";
import { reducer as VestingReducer } from "../src/reducers/vesting";

const stateReducer: ImmutableStateReducer<
  BudgetStatementState,
  BudgetStatementAction,
  BudgetStatementLocalState
> = (state, action, dispatch) => {
  if (utils.isBaseAction(action)) {
    return state;
  }

  switch (action.type) {
    case "ADD_ACCOUNT":
      AddAccountInputSchema().parse(action.input);
      AccountReducer.addAccountOperation(state[action.scope], action, dispatch);
      break;

    case "UPDATE_ACCOUNT":
      UpdateAccountInputSchema().parse(action.input);
      AccountReducer.updateAccountOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "DELETE_ACCOUNT":
      DeleteAccountInputSchema().parse(action.input);
      AccountReducer.deleteAccountOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "SORT_ACCOUNTS":
      SortAccountsInputSchema().parse(action.input);
      AccountReducer.sortAccountsOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "ADD_LINE_ITEM":
      AddLineItemInputSchema().parse(action.input);
      LineItemReducer.addLineItemOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "UPDATE_LINE_ITEM":
      UpdateLineItemInputSchema().parse(action.input);
      LineItemReducer.updateLineItemOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "DELETE_LINE_ITEM":
      DeleteLineItemInputSchema().parse(action.input);
      LineItemReducer.deleteLineItemOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "SORT_LINE_ITEMS":
      SortLineItemsInputSchema().parse(action.input);
      LineItemReducer.sortLineItemsOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "SET_OWNER":
      SetOwnerInputSchema().parse(action.input);
      BaseReducer.setOwnerOperation(state[action.scope], action, dispatch);
      break;

    case "SET_MONTH":
      SetMonthInputSchema().parse(action.input);
      BaseReducer.setMonthOperation(state[action.scope], action, dispatch);
      break;

    case "SET_FTES":
      SetFtesInputSchema().parse(action.input);
      BaseReducer.setFtesOperation(state[action.scope], action, dispatch);
      break;

    case "SET_QUOTE_CURRENCY":
      SetQuoteCurrencyInputSchema().parse(action.input);
      BaseReducer.setQuoteCurrencyOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "ADD_AUDIT_REPORT":
      AddAuditReportInputSchema().parse(action.input);
      AuditReducer.addAuditReportOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "DELETE_AUDIT_REPORT":
      DeleteAuditReportInputSchema().parse(action.input);
      AuditReducer.deleteAuditReportOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "ADD_COMMENT":
      AddCommentInputSchema().parse(action.input);
      CommentReducer.addCommentOperation(state[action.scope], action, dispatch);
      break;

    case "UPDATE_COMMENT":
      UpdateCommentInputSchema().parse(action.input);
      CommentReducer.updateCommentOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "DELETE_COMMENT":
      DeleteCommentInputSchema().parse(action.input);
      CommentReducer.deleteCommentOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "ADD_VESTING":
      AddVestingInputSchema().parse(action.input);
      VestingReducer.addVestingOperation(state[action.scope], action, dispatch);
      break;

    case "UPDATE_VESTING":
      UpdateVestingInputSchema().parse(action.input);
      VestingReducer.updateVestingOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "DELETE_VESTING":
      DeleteVestingInputSchema().parse(action.input);
      VestingReducer.deleteVestingOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    default:
      return state;
  }
};

export const reducer = utils.createReducer<
  BudgetStatementState,
  BudgetStatementAction,
  BudgetStatementLocalState
>(stateReducer);
