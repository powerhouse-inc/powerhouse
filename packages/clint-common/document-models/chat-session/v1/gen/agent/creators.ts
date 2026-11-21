/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  AddAssistantMessageInputSchema,
  AppendAssistantContentInputSchema,
  ClearRetryRequestInputSchema,
  FailTurnInputSchema,
  FinishAssistantMessageInputSchema,
  MarkMessagePickedUpInputSchema,
  SetMessageUsageInputSchema,
  UpdateAssistantContentInputSchema,
} from "../schema/zod.js";
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

export const addAssistantMessage = (input: AddAssistantMessageInput) =>
  createAction<AddAssistantMessageAction>(
    "ADD_ASSISTANT_MESSAGE",
    { ...input },
    undefined,
    AddAssistantMessageInputSchema,
    "global",
  );

export const appendAssistantContent = (input: AppendAssistantContentInput) =>
  createAction<AppendAssistantContentAction>(
    "APPEND_ASSISTANT_CONTENT",
    { ...input },
    undefined,
    AppendAssistantContentInputSchema,
    "global",
  );

export const updateAssistantContent = (input: UpdateAssistantContentInput) =>
  createAction<UpdateAssistantContentAction>(
    "UPDATE_ASSISTANT_CONTENT",
    { ...input },
    undefined,
    UpdateAssistantContentInputSchema,
    "global",
  );

export const setMessageUsage = (input: SetMessageUsageInput) =>
  createAction<SetMessageUsageAction>(
    "SET_MESSAGE_USAGE",
    { ...input },
    undefined,
    SetMessageUsageInputSchema,
    "global",
  );

export const finishAssistantMessage = (input: FinishAssistantMessageInput) =>
  createAction<FinishAssistantMessageAction>(
    "FINISH_ASSISTANT_MESSAGE",
    { ...input },
    undefined,
    FinishAssistantMessageInputSchema,
    "global",
  );

export const markMessagePickedUp = (input: MarkMessagePickedUpInput) =>
  createAction<MarkMessagePickedUpAction>(
    "MARK_MESSAGE_PICKED_UP",
    { ...input },
    undefined,
    MarkMessagePickedUpInputSchema,
    "global",
  );

export const failTurn = (input: FailTurnInput) =>
  createAction<FailTurnAction>(
    "FAIL_TURN",
    { ...input },
    undefined,
    FailTurnInputSchema,
    "global",
  );

export const clearRetryRequest = (input: ClearRetryRequestInput) =>
  createAction<ClearRetryRequestAction>(
    "CLEAR_RETRY_REQUEST",
    { ...input },
    undefined,
    ClearRetryRequestInputSchema,
    "global",
  );
