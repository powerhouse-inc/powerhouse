/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { ConnectionGlobalState } from "../types.js";
import type {
  RemoveConfigValueAction,
  RemoveSecretRefAction,
  SetConfigAction,
  SetConfigValueAction,
  SetSecretRefAction,
} from "./actions.js";

export interface ConnectionConfigOperations {
  setConfigOperation: (
    state: ConnectionGlobalState,
    action: SetConfigAction,
    dispatch?: SignalDispatch,
  ) => void;
  setConfigValueOperation: (
    state: ConnectionGlobalState,
    action: SetConfigValueAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeConfigValueOperation: (
    state: ConnectionGlobalState,
    action: RemoveConfigValueAction,
    dispatch?: SignalDispatch,
  ) => void;
  setSecretRefOperation: (
    state: ConnectionGlobalState,
    action: SetSecretRefAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeSecretRefOperation: (
    state: ConnectionGlobalState,
    action: RemoveSecretRefAction,
    dispatch?: SignalDispatch,
  ) => void;
}
