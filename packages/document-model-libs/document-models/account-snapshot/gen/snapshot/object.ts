import { BaseDocument } from "document-model/document";
import {
  SetIdInput,
  SetOwnerIdInput,
  SetOwnerTypeInput,
  SetPeriodInput,
  SetStartInput,
  SetEndInput,
  AccountSnapshotState,
  AccountSnapshotLocalState,
} from "../types";
import {
  setId,
  setOwnerId,
  setOwnerType,
  setPeriod,
  setStart,
  setEnd,
} from "./creators";
import { AccountSnapshotAction } from "../actions";

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
