import type { Action } from "document-model";
import type {
  SetTestIdInput,
  SetTestIdButDifferentInput,
  SetTestNameInput,
} from "../types.js";

export type SetTestIdAction = Action & {
  type: "SET_TEST_ID";
  input: SetTestIdInput;
};
export type SetTestIdButDifferentAction = Action & {
  type: "SET_TEST_ID_BUT_DIFFERENT";
  input: SetTestIdButDifferentInput;
};
export type SetTestNameAction = Action & {
  type: "SET_TEST_NAME";
  input: SetTestNameInput;
};

export type TestDocBaseOperationsAction =
  | SetTestIdAction
  | SetTestIdButDifferentAction
  | SetTestNameAction;
