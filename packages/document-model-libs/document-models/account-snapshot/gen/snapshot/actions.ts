import { BaseAction } from "document-model";
import { SetIdInput, SetOwnerIdInput, SetOwnerTypeInput, SetPeriodInput, SetStartInput, SetEndInput } from "../schema/types.js";

export type SetIdAction = BaseAction<"SET_ID", SetIdInput, "global">;
export type SetOwnerIdAction = BaseAction<
  "SET_OWNER_ID",
  SetOwnerIdInput,
  "global"
>;
export type SetOwnerTypeAction = BaseAction<
  "SET_OWNER_TYPE",
  SetOwnerTypeInput,
  "global"
>;
export type SetPeriodAction = BaseAction<"SET_PERIOD", SetPeriodInput, "global">;
export type SetStartAction = BaseAction<"SET_START", SetStartInput, "global">;
export type SetEndAction = BaseAction<"SET_END", SetEndInput, "global">;

export type AccountSnapshotSnapshotAction =
  | SetIdAction
  | SetOwnerIdAction
  | SetOwnerTypeAction
  | SetPeriodAction
  | SetStartAction
  | SetEndAction;
