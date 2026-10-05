/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { ConnectionGlobalState } from "../types.js";
import type { RecordCheckResultAction } from "./actions.js";

export interface ConnectionHealthOperations {
  recordCheckResultOperation: (
    state: ConnectionGlobalState,
    action: RecordCheckResultAction,
    dispatch?: SignalDispatch,
  ) => void;
}
