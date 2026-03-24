import { type SignalDispatch } from "document-model";
import type { TestDocState } from "../types.js";
import type { SetTestIdAction, SetTestNameAction } from "./actions.js";

export interface TestDocBaseOperationsOperations {
  setTestIdOperation: (
    state: TestDocState,
    action: SetTestIdAction,
    dispatch?: SignalDispatch,
  ) => void;
  setTestNameOperation: (
    state: TestDocState,
    action: SetTestNameAction,
    dispatch?: SignalDispatch,
  ) => void;
}
