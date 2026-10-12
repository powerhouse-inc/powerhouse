/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  RemoveConfigValueInput,
  RemoveSecretRefInput,
  SetConfigInput,
  SetConfigValueInput,
  SetSecretRefInput,
} from "../types.js";

export type SetConfigAction = Action & {
  type: "SET_CONFIG";
  input: SetConfigInput;
};
export type SetConfigValueAction = Action & {
  type: "SET_CONFIG_VALUE";
  input: SetConfigValueInput;
};
export type RemoveConfigValueAction = Action & {
  type: "REMOVE_CONFIG_VALUE";
  input: RemoveConfigValueInput;
};
export type SetSecretRefAction = Action & {
  type: "SET_SECRET_REF";
  input: SetSecretRefInput;
};
export type RemoveSecretRefAction = Action & {
  type: "REMOVE_SECRET_REF";
  input: RemoveSecretRefInput;
};

export type ConnectionConfigAction =
  | SetConfigAction
  | SetConfigValueAction
  | RemoveConfigValueAction
  | SetSecretRefAction
  | RemoveSecretRefAction;
