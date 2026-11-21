/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { ChatSessionGlobalState } from "../types.js";
import type {
  AddAssistantMessageAction,
  AppendAssistantContentAction,
  ClearRetryRequestAction,
  FailTurnAction,
  FinishAssistantMessageAction,
  MarkMessagePickedUpAction,
  SetMessageUsageAction,
  UpdateAssistantContentAction,
} from "./actions.js";

export interface ChatSessionAgentOperations {
  addAssistantMessageOperation: (
    state: ChatSessionGlobalState,
    action: AddAssistantMessageAction,
    dispatch?: SignalDispatch,
  ) => void;
  appendAssistantContentOperation: (
    state: ChatSessionGlobalState,
    action: AppendAssistantContentAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateAssistantContentOperation: (
    state: ChatSessionGlobalState,
    action: UpdateAssistantContentAction,
    dispatch?: SignalDispatch,
  ) => void;
  setMessageUsageOperation: (
    state: ChatSessionGlobalState,
    action: SetMessageUsageAction,
    dispatch?: SignalDispatch,
  ) => void;
  finishAssistantMessageOperation: (
    state: ChatSessionGlobalState,
    action: FinishAssistantMessageAction,
    dispatch?: SignalDispatch,
  ) => void;
  markMessagePickedUpOperation: (
    state: ChatSessionGlobalState,
    action: MarkMessagePickedUpAction,
    dispatch?: SignalDispatch,
  ) => void;
  failTurnOperation: (
    state: ChatSessionGlobalState,
    action: FailTurnAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearRetryRequestOperation: (
    state: ChatSessionGlobalState,
    action: ClearRetryRequestAction,
    dispatch?: SignalDispatch,
  ) => void;
}
