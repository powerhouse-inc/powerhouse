import { BudgetStatementAction } from "../actions";
import {
  AddVestingInput,
  BudgetStatementLocalState,
  BudgetStatementState,
  DeleteVestingInput,
  UpdateVestingInput,
} from "../types.js";
import { addVesting, deleteVesting, updateVesting } from "./creators";

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
