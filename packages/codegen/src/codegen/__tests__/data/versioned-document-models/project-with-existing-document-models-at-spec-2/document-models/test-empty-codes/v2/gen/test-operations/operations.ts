import { type SignalDispatch } from "document-model";
import type { SetValueAction } from "./actions.js";
import type { TestEmptyCodesState } from "../types.js";

export interface TestEmptyCodesTestOperationsOperations {
  setValueOperation: (
    state: TestEmptyCodesState,
    action: SetValueAction,
    dispatch?: SignalDispatch,
  ) => void;
}
