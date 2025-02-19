import { BudgetStatementAction } from "../actions";
import {
  AddLineItemInput,
  BudgetStatementLocalState,
  BudgetStatementState,
  DeleteLineItemInput,
  SortLineItemsInput,
  UpdateLineItemInput,
} from "../types.js";
import {
  addLineItem,
  deleteLineItem,
  sortLineItems,
  updateLineItem,
} from "./creators";

export default class BudgetStatement_LineItem extends BaseDocument<
  BudgetStatementState,
  BudgetStatementAction,
  BudgetStatementLocalState
> {
  public addLineItem(input: AddLineItemInput) {
    return this.dispatch(addLineItem(input));
  }

  public updateLineItem(input: UpdateLineItemInput) {
    return this.dispatch(updateLineItem(input));
  }

  public deleteLineItem(input: DeleteLineItemInput) {
    return this.dispatch(deleteLineItem(input));
  }

  public sortLineItems(input: SortLineItemsInput) {
    return this.dispatch(sortLineItems(input));
  }
}
