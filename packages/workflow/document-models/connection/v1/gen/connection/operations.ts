/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { ConnectionGlobalState } from "../types.js";
import type {
  SetAccountLabelAction,
  SetConnectionNameAction,
  SetConnectorAction,
} from "./actions.js";

export interface ConnectionConnectionOperations {
  setConnectionNameOperation: (
    state: ConnectionGlobalState,
    action: SetConnectionNameAction,
    dispatch?: SignalDispatch,
  ) => void;
  setConnectorOperation: (
    state: ConnectionGlobalState,
    action: SetConnectorAction,
    dispatch?: SignalDispatch,
  ) => void;
  setAccountLabelOperation: (
    state: ConnectionGlobalState,
    action: SetAccountLabelAction,
    dispatch?: SignalDispatch,
  ) => void;
}
