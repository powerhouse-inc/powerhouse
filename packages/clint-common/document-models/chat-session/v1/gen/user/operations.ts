/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { ChatSessionGlobalState } from "../types.js";
import type {
  AbortSessionAction,
  AddUserMessageAction,
  DeleteUserMessageAction,
  InterruptAgentAction,
  ResumeSessionAction,
  RetryTurnAction,
} from "./actions.js";

export interface ChatSessionUserOperations {
  addUserMessageOperation: (
    state: ChatSessionGlobalState,
    action: AddUserMessageAction,
    dispatch?: SignalDispatch,
  ) => void;
  deleteUserMessageOperation: (
    state: ChatSessionGlobalState,
    action: DeleteUserMessageAction,
    dispatch?: SignalDispatch,
  ) => void;
  abortSessionOperation: (
    state: ChatSessionGlobalState,
    action: AbortSessionAction,
    dispatch?: SignalDispatch,
  ) => void;
  interruptAgentOperation: (
    state: ChatSessionGlobalState,
    action: InterruptAgentAction,
    dispatch?: SignalDispatch,
  ) => void;
  retryTurnOperation: (
    state: ChatSessionGlobalState,
    action: RetryTurnAction,
    dispatch?: SignalDispatch,
  ) => void;
  resumeSessionOperation: (
    state: ChatSessionGlobalState,
    action: ResumeSessionAction,
    dispatch?: SignalDispatch,
  ) => void;
}
