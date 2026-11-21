/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { ChatSessionGlobalState } from "../types.js";
import type { AddToolOutputAction, AddToolResultAction } from "./actions.js";

export interface ChatSessionToolOperations {
  addToolResultOperation: (
    state: ChatSessionGlobalState,
    action: AddToolResultAction,
    dispatch?: SignalDispatch,
  ) => void;
  addToolOutputOperation: (
    state: ChatSessionGlobalState,
    action: AddToolOutputAction,
    dispatch?: SignalDispatch,
  ) => void;
}
