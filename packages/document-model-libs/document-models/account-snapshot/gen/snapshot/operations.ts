import { SignalDispatch } from "document-model/document";
import {
  SetIdAction,
  SetOwnerIdAction,
  SetOwnerTypeAction,
  SetPeriodAction,
  SetStartAction,
  SetEndAction,
} from "./actions";
import { AccountSnapshotState } from "../types";

export interface AccountSnapshotSnapshotOperations {
  setIdOperation: (
    state: AccountSnapshotState,
    action: SetIdAction,
    dispatch?: SignalDispatch,
  ) => void;
  setOwnerIdOperation: (
    state: AccountSnapshotState,
    action: SetOwnerIdAction,
    dispatch?: SignalDispatch,
  ) => void;
  setOwnerTypeOperation: (
    state: AccountSnapshotState,
    action: SetOwnerTypeAction,
    dispatch?: SignalDispatch,
  ) => void;
  setPeriodOperation: (
    state: AccountSnapshotState,
    action: SetPeriodAction,
    dispatch?: SignalDispatch,
  ) => void;
  setStartOperation: (
    state: AccountSnapshotState,
    action: SetStartAction,
    dispatch?: SignalDispatch,
  ) => void;
  setEndOperation: (
    state: AccountSnapshotState,
    action: SetEndAction,
    dispatch?: SignalDispatch,
  ) => void;
}
