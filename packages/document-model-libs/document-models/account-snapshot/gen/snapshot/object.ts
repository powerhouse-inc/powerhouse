import { AccountSnapshotAction } from "../actions.js";
import { SetIdInput, SetOwnerIdInput, SetOwnerTypeInput, SetPeriodInput, SetStartInput, SetEndInput } from "../schema/types.js";
import { AccountSnapshotState, AccountSnapshotLocalState } from "../types.js";
import { setId, setOwnerId, setOwnerType, setPeriod, setStart, setEnd } from "./creators.js";

export default class AccountSnapshot_Snapshot extends BaseDocument<
  AccountSnapshotState,
  AccountSnapshotAction,
  AccountSnapshotLocalState
> {
  public setId(input: SetIdInput) {
    return this.dispatch(setId(input));
  }

  public setOwnerId(input: SetOwnerIdInput) {
    return this.dispatch(setOwnerId(input));
  }

  public setOwnerType(input: SetOwnerTypeInput) {
    return this.dispatch(setOwnerType(input));
  }

  public setPeriod(input: SetPeriodInput) {
    return this.dispatch(setPeriod(input));
  }

  public setStart(input: SetStartInput) {
    return this.dispatch(setStart(input));
  }

  public setEnd(input: SetEndInput) {
    return this.dispatch(setEnd(input));
  }
}
