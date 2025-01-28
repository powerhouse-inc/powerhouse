import { Action } from "document-model/document";
import {
  SetIdInput,
  SetOwnerIdInput,
  SetOwnerTypeInput,
  SetPeriodInput,
  SetStartInput,
  SetEndInput,
} from "../types";

export type SetIdAction = Action<"SET_ID", SetIdInput, "global">;
export type SetOwnerIdAction = Action<
  "SET_OWNER_ID",
  SetOwnerIdInput,
  "global"
>;
export type SetOwnerTypeAction = Action<
  "SET_OWNER_TYPE",
  SetOwnerTypeInput,
  "global"
>;
export type SetPeriodAction = Action<"SET_PERIOD", SetPeriodInput, "global">;
export type SetStartAction = Action<"SET_START", SetStartInput, "global">;
export type SetEndAction = Action<"SET_END", SetEndInput, "global">;

export type AccountSnapshotSnapshotAction =
  | SetIdAction
  | SetOwnerIdAction
  | SetOwnerTypeAction
  | SetPeriodAction
  | SetStartAction
  | SetEndAction;
