import { type SignalDispatch } from "document-model";
import type { TestDocState } from "../types.js";
import type {
    SetTestIdAction,
    SetTestIdButDifferentAction,
    SetTestNameAction,
} from "./actions.js";

export interface TestDocBaseOperationsOperations {
  setTestIdOperation: (
    state: TestDocState,
    action: SetTestIdAction,
    dispatch?: SignalDispatch,
  ) => void;
  setTestIdButDifferentOperation: (
    state: TestDocState,
    action: SetTestIdButDifferentAction,
    dispatch?: SignalDispatch,
  ) => void;
  setTestNameOperation: (
    state: TestDocState,
    action: SetTestNameAction,
    dispatch?: SignalDispatch,
  ) => void;
}
