/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  SetAccountLabelInput,
  SetConnectionNameInput,
  SetConnectorInput,
} from "../types.js";

export type SetConnectionNameAction = Action & {
  type: "SET_CONNECTION_NAME";
  input: SetConnectionNameInput;
};
export type SetConnectorAction = Action & {
  type: "SET_CONNECTOR";
  input: SetConnectorInput;
};
export type SetAccountLabelAction = Action & {
  type: "SET_ACCOUNT_LABEL";
  input: SetAccountLabelInput;
};

export type ConnectionConnectionAction =
  | SetConnectionNameAction
  | SetConnectorAction
  | SetAccountLabelAction;
