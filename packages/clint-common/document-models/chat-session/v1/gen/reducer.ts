/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { Reducer, StateReducer } from "document-model";
import { createReducer, isDocumentAction } from "document-model";
import type { ChatSessionPHState } from "document-models/chat-session/v1";

import { chatSessionAgentOperations } from "../src/reducers/agent.js";
import { chatSessionSystemOperations } from "../src/reducers/system.js";
import { chatSessionToolOperations } from "../src/reducers/tool.js";
import { chatSessionUserOperations } from "../src/reducers/user.js";

import {
  AbortSessionInputSchema,
  AddAssistantMessageInputSchema,
  AddSystemMessageInputSchema,
  AddToolOutputInputSchema,
  AddToolResultInputSchema,
  AddUserMessageInputSchema,
  AppendAssistantContentInputSchema,
  ClearRetryRequestInputSchema,
  DeleteUserMessageInputSchema,
  EndSessionInputSchema,
  FailTurnInputSchema,
  FinishAssistantMessageInputSchema,
  InterruptAgentInputSchema,
  MarkMessagePickedUpInputSchema,
  ResumeSessionInputSchema,
  RetryTurnInputSchema,
  SetAgentDescriptionInputSchema,
  SetAgentImageInputSchema,
  SetAgentInfoInputSchema,
  SetMessageUsageInputSchema,
  StartSessionInputSchema,
  UpdateAssistantContentInputSchema,
  UpdateUsageSummaryInputSchema,
} from "./schema/zod.js";

const schemaMemo = new Map<() => unknown, unknown>();

function memoizedSchema<T>(makeSchema: () => T): T {
  let schema = schemaMemo.get(makeSchema) as T | undefined;
  if (schema === undefined) {
    schema = makeSchema();
    schemaMemo.set(makeSchema, schema);
  }
  return schema;
}

const stateReducer: StateReducer<ChatSessionPHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "START_SESSION": {
      memoizedSchema(StartSessionInputSchema).parse(action.input);

      chatSessionSystemOperations.startSessionOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_AGENT_INFO": {
      memoizedSchema(SetAgentInfoInputSchema).parse(action.input);

      chatSessionSystemOperations.setAgentInfoOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "END_SESSION": {
      memoizedSchema(EndSessionInputSchema).parse(action.input);

      chatSessionSystemOperations.endSessionOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_USAGE_SUMMARY": {
      memoizedSchema(UpdateUsageSummaryInputSchema).parse(action.input);

      chatSessionSystemOperations.updateUsageSummaryOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_SYSTEM_MESSAGE": {
      memoizedSchema(AddSystemMessageInputSchema).parse(action.input);

      chatSessionSystemOperations.addSystemMessageOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_AGENT_IMAGE": {
      memoizedSchema(SetAgentImageInputSchema).parse(action.input);

      chatSessionSystemOperations.setAgentImageOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_AGENT_DESCRIPTION": {
      memoizedSchema(SetAgentDescriptionInputSchema).parse(action.input);

      chatSessionSystemOperations.setAgentDescriptionOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_USER_MESSAGE": {
      memoizedSchema(AddUserMessageInputSchema).parse(action.input);

      chatSessionUserOperations.addUserMessageOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "DELETE_USER_MESSAGE": {
      memoizedSchema(DeleteUserMessageInputSchema).parse(action.input);

      chatSessionUserOperations.deleteUserMessageOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ABORT_SESSION": {
      memoizedSchema(AbortSessionInputSchema).parse(action.input);

      chatSessionUserOperations.abortSessionOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "INTERRUPT_AGENT": {
      memoizedSchema(InterruptAgentInputSchema).parse(action.input);

      chatSessionUserOperations.interruptAgentOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "RETRY_TURN": {
      memoizedSchema(RetryTurnInputSchema).parse(action.input);

      chatSessionUserOperations.retryTurnOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "RESUME_SESSION": {
      memoizedSchema(ResumeSessionInputSchema).parse(action.input);

      chatSessionUserOperations.resumeSessionOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_ASSISTANT_MESSAGE": {
      memoizedSchema(AddAssistantMessageInputSchema).parse(action.input);

      chatSessionAgentOperations.addAssistantMessageOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "APPEND_ASSISTANT_CONTENT": {
      memoizedSchema(AppendAssistantContentInputSchema).parse(action.input);

      chatSessionAgentOperations.appendAssistantContentOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "UPDATE_ASSISTANT_CONTENT": {
      memoizedSchema(UpdateAssistantContentInputSchema).parse(action.input);

      chatSessionAgentOperations.updateAssistantContentOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_MESSAGE_USAGE": {
      memoizedSchema(SetMessageUsageInputSchema).parse(action.input);

      chatSessionAgentOperations.setMessageUsageOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "FINISH_ASSISTANT_MESSAGE": {
      memoizedSchema(FinishAssistantMessageInputSchema).parse(action.input);

      chatSessionAgentOperations.finishAssistantMessageOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "MARK_MESSAGE_PICKED_UP": {
      memoizedSchema(MarkMessagePickedUpInputSchema).parse(action.input);

      chatSessionAgentOperations.markMessagePickedUpOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "FAIL_TURN": {
      memoizedSchema(FailTurnInputSchema).parse(action.input);

      chatSessionAgentOperations.failTurnOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "CLEAR_RETRY_REQUEST": {
      memoizedSchema(ClearRetryRequestInputSchema).parse(action.input);

      chatSessionAgentOperations.clearRetryRequestOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_TOOL_RESULT": {
      memoizedSchema(AddToolResultInputSchema).parse(action.input);

      chatSessionToolOperations.addToolResultOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_TOOL_OUTPUT": {
      memoizedSchema(AddToolOutputInputSchema).parse(action.input);

      chatSessionToolOperations.addToolOutputOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    default:
      return state;
  }
};

export const reducer: Reducer<ChatSessionPHState> = createReducer(stateReducer);
