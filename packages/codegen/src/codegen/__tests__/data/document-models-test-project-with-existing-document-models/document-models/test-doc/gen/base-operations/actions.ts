import { type Action } from "document-model";
import type { SetTestIdInput, SetTestNameInput } from "../types.js";

export type SetTestIdAction = Action & {
  type: "SET_TEST_ID";
  input: SetTestIdInput;
};
export type SetTestNameAction = Action & {
  type: "SET_TEST_NAME";
  input: SetTestNameInput;
};

export type TestDocBaseOperationsAction = SetTestIdAction | SetTestNameAction;
