/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { TestDocGlobalState } from "../types.js";
import type {
  SetTestIdAction,
  SetTestIdButDifferentAction,
  SetTestNameAction,
} from "./actions.js";

export interface TestDocBaseOperationsOperations {
  setTestIdOperation: (
    state: TestDocGlobalState,
    action: SetTestIdAction,
    dispatch?: SignalDispatch,
  ) => void;
  setTestIdButDifferentOperation: (
    state: TestDocGlobalState,
    action: SetTestIdButDifferentAction,
    dispatch?: SignalDispatch,
  ) => void;
  setTestNameOperation: (
    state: TestDocGlobalState,
    action: SetTestNameAction,
    dispatch?: SignalDispatch,
  ) => void;
}
