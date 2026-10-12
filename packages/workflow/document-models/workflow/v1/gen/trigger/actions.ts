/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  ClearTriggerInput,
  SetTriggerConfigInput,
  SetTriggerConnectionInput,
  SetTriggerInput,
  SetTriggerPieceVersionInput,
} from "../types.js";

export type SetTriggerAction = Action & {
  type: "SET_TRIGGER";
  input: SetTriggerInput;
};
export type ClearTriggerAction = Action & {
  type: "CLEAR_TRIGGER";
  input: ClearTriggerInput;
};
export type SetTriggerConfigAction = Action & {
  type: "SET_TRIGGER_CONFIG";
  input: SetTriggerConfigInput;
};
export type SetTriggerConnectionAction = Action & {
  type: "SET_TRIGGER_CONNECTION";
  input: SetTriggerConnectionInput;
};
export type SetTriggerPieceVersionAction = Action & {
  type: "SET_TRIGGER_PIECE_VERSION";
  input: SetTriggerPieceVersionInput;
};

export type WorkflowTriggerAction =
  | SetTriggerAction
  | ClearTriggerAction
  | SetTriggerConfigAction
  | SetTriggerConnectionAction
  | SetTriggerPieceVersionAction;
