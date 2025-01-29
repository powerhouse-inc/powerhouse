import { BaseDocument } from "document-model/document";
import {
  AddLineItemInput,
  UpdateLineItemInput,
  DeleteLineItemInput,
  SortLineItemsInput,
  BudgetStatementState,
  BudgetStatementLocalState,
} from "../types";
import {
  addLineItem,
  updateLineItem,
  deleteLineItem,
  sortLineItems,
} from "./creators";
import { BudgetStatementAction } from "../actions";

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
