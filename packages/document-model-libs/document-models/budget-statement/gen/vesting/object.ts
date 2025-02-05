import { BaseDocument } from "document-model";
import {
    AddVestingInput,
    UpdateVestingInput,
    DeleteVestingInput,
    BudgetStatementState,
    BudgetStatementLocalState,
} from "../types.js";
import { addVesting, updateVesting, deleteVesting } from "./creators";
import { BudgetStatementAction } from "../actions";

export default class BudgetStatement_Vesting extends BaseDocument<
  BudgetStatementState,
  BudgetStatementAction,
  BudgetStatementLocalState
> {
  public addVesting(input: AddVestingInput) {
    return this.dispatch(addVesting(input));
  }

  public updateVesting(input: UpdateVestingInput) {
    return this.dispatch(updateVesting(input));
  }

  public deleteVesting(input: DeleteVestingInput) {
    return this.dispatch(deleteVesting(input));
  }
}
