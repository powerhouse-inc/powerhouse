import { BudgetStatementAction } from "../actions.js";
import { AddCommentInput, UpdateCommentInput, DeleteCommentInput } from "../schema/types.js";
import { BudgetStatementState, BudgetStatementLocalState } from "../types.js";
import { addComment, updateComment, deleteComment } from "./creators.js";

export default class BudgetStatement_Comment extends BaseDocument<
  BudgetStatementState,
  BudgetStatementAction,
  BudgetStatementLocalState
> {
  public addComment(input: AddCommentInput) {
    return this.dispatch(addComment(input));
  }

  public updateComment(input: UpdateCommentInput) {
    return this.dispatch(updateComment(input));
  }

  public deleteComment(input: DeleteCommentInput) {
    return this.dispatch(deleteComment(input));
  }
}
