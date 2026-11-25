/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  AbortSessionInput,
  AddUserMessageInput,
  DeleteUserMessageInput,
  InterruptAgentInput,
  ResumeSessionInput,
  RetryTurnInput,
} from "../types.js";

export type AddUserMessageAction = Action & {
  type: "ADD_USER_MESSAGE";
  input: AddUserMessageInput;
};
export type DeleteUserMessageAction = Action & {
  type: "DELETE_USER_MESSAGE";
  input: DeleteUserMessageInput;
};
export type AbortSessionAction = Action & {
  type: "ABORT_SESSION";
  input: AbortSessionInput;
};
export type InterruptAgentAction = Action & {
  type: "INTERRUPT_AGENT";
  input: InterruptAgentInput;
};
export type RetryTurnAction = Action & {
  type: "RETRY_TURN";
  input: RetryTurnInput;
};
export type ResumeSessionAction = Action & {
  type: "RESUME_SESSION";
  input: ResumeSessionInput;
};

export type ChatSessionUserAction =
  | AddUserMessageAction
  | DeleteUserMessageAction
  | AbortSessionAction
  | InterruptAgentAction
  | RetryTurnAction
  | ResumeSessionAction;
