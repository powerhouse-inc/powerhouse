import type { Action } from "document-model";
import type { SetValueInput } from "../types.js";

export type SetValueAction = Action & {
  type: "SET_VALUE";
  input: SetValueInput;
};

export type TestEmptyCodesTestOperationsAction = SetValueAction;
