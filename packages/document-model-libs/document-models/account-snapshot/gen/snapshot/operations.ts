import { SignalDispatch } from "document-model";
import {
  SetIdAction,
  SetOwnerIdAction,
  SetOwnerTypeAction,
  SetPeriodAction,
  SetStartAction,
  SetEndAction,
} from "./actions.js";
import { AccountSnapshotAction, AccountSnapshotLocalState, AccountSnapshotState } from "../types.js";

export interface AccountSnapshotSnapshotOperations {
  setIdOperation: (
    state: AccountSnapshotState,
    action: SetIdAction,
    dispatch?: SignalDispatch<AccountSnapshotState, AccountSnapshotLocalState, AccountSnapshotAction>,
  ) => void;
  setOwnerIdOperation: (
    state: AccountSnapshotState,
    action: SetOwnerIdAction,
    dispatch?: SignalDispatch<AccountSnapshotState, AccountSnapshotLocalState, AccountSnapshotAction>,
  ) => void;
  setOwnerTypeOperation: (
    state: AccountSnapshotState,
    action: SetOwnerTypeAction,
    dispatch?: SignalDispatch<AccountSnapshotState, AccountSnapshotLocalState, AccountSnapshotAction>,
  ) => void;
  setPeriodOperation: (
    state: AccountSnapshotState,
    action: SetPeriodAction,
    dispatch?: SignalDispatch<AccountSnapshotState, AccountSnapshotLocalState, AccountSnapshotAction>,
  ) => void;
  setStartOperation: (
    state: AccountSnapshotState,
    action: SetStartAction,
    dispatch?: SignalDispatch<AccountSnapshotState, AccountSnapshotLocalState, AccountSnapshotAction>,
  ) => void;
  setEndOperation: (
    state: AccountSnapshotState,
    action: SetEndAction,
    dispatch?: SignalDispatch<AccountSnapshotState, AccountSnapshotLocalState, AccountSnapshotAction>,
  ) => void;
}
