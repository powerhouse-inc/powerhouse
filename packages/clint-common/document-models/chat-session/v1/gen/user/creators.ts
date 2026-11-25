/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  AbortSessionInputSchema,
  AddUserMessageInputSchema,
  DeleteUserMessageInputSchema,
  InterruptAgentInputSchema,
  ResumeSessionInputSchema,
  RetryTurnInputSchema,
} from "../schema/zod.js";
import type {
  AbortSessionInput,
  AddUserMessageInput,
  DeleteUserMessageInput,
  InterruptAgentInput,
  ResumeSessionInput,
  RetryTurnInput,
} from "../types.js";
import type {
  AbortSessionAction,
  AddUserMessageAction,
  DeleteUserMessageAction,
  InterruptAgentAction,
  ResumeSessionAction,
  RetryTurnAction,
} from "./actions.js";

export const addUserMessage = (input: AddUserMessageInput) =>
  createAction<AddUserMessageAction>(
    "ADD_USER_MESSAGE",
    { ...input },
    undefined,
    AddUserMessageInputSchema,
    "global",
  );

export const deleteUserMessage = (input: DeleteUserMessageInput) =>
  createAction<DeleteUserMessageAction>(
    "DELETE_USER_MESSAGE",
    { ...input },
    undefined,
    DeleteUserMessageInputSchema,
    "global",
  );

export const abortSession = (input: AbortSessionInput) =>
  createAction<AbortSessionAction>(
    "ABORT_SESSION",
    { ...input },
    undefined,
    AbortSessionInputSchema,
    "global",
  );

export const interruptAgent = (input: InterruptAgentInput) =>
  createAction<InterruptAgentAction>(
    "INTERRUPT_AGENT",
    { ...input },
    undefined,
    InterruptAgentInputSchema,
    "global",
  );

export const retryTurn = (input: RetryTurnInput) =>
  createAction<RetryTurnAction>(
    "RETRY_TURN",
    { ...input },
    undefined,
    RetryTurnInputSchema,
    "global",
  );

export const resumeSession = (input: ResumeSessionInput) =>
  createAction<ResumeSessionAction>(
    "RESUME_SESSION",
    { ...input },
    undefined,
    ResumeSessionInputSchema,
    "global",
  );
