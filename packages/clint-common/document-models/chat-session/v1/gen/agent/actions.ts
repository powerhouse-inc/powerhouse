/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  AddAssistantMessageInput,
  AppendAssistantContentInput,
  ClearRetryRequestInput,
  FailTurnInput,
  FinishAssistantMessageInput,
  MarkMessagePickedUpInput,
  SetMessageUsageInput,
  UpdateAssistantContentInput,
} from "../types.js";

export type AddAssistantMessageAction = Action & {
  type: "ADD_ASSISTANT_MESSAGE";
  input: AddAssistantMessageInput;
};
export type AppendAssistantContentAction = Action & {
  type: "APPEND_ASSISTANT_CONTENT";
  input: AppendAssistantContentInput;
};
export type UpdateAssistantContentAction = Action & {
  type: "UPDATE_ASSISTANT_CONTENT";
  input: UpdateAssistantContentInput;
};
export type SetMessageUsageAction = Action & {
  type: "SET_MESSAGE_USAGE";
  input: SetMessageUsageInput;
};
export type FinishAssistantMessageAction = Action & {
  type: "FINISH_ASSISTANT_MESSAGE";
  input: FinishAssistantMessageInput;
};
export type MarkMessagePickedUpAction = Action & {
  type: "MARK_MESSAGE_PICKED_UP";
  input: MarkMessagePickedUpInput;
};
export type FailTurnAction = Action & {
  type: "FAIL_TURN";
  input: FailTurnInput;
};
export type ClearRetryRequestAction = Action & {
  type: "CLEAR_RETRY_REQUEST";
  input: ClearRetryRequestInput;
};

export type ChatSessionAgentAction =
  | AddAssistantMessageAction
  | AppendAssistantContentAction
  | UpdateAssistantContentAction
  | SetMessageUsageAction
  | FinishAssistantMessageAction
  | MarkMessagePickedUpAction
  | FailTurnAction
  | ClearRetryRequestAction;
