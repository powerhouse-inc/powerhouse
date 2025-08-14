import { type Action } from "document-model";
import type { SetAppNameInput, SetAppStatusInput } from "../types.js";

export type SetAppNameAction = Action & {
  type: "SET_APP_NAME";
  input: SetAppNameInput;
};
export type SetAppStatusAction = Action & {
  type: "SET_APP_STATUS";
  input: SetAppStatusInput;
};

export type AppModuleBaseOperationsAction =
  | SetAppNameAction
  | SetAppStatusAction;
