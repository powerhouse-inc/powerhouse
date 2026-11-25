import type { FieldDef } from "./OperationForm.js";
import type { ModuleName } from "./ModuleTabs.js";

export interface OperationDef {
  name: string;
  module: ModuleName;
  fields: FieldDef[];
}

export const OPERATIONS: OperationDef[] = [
  // System module
  {
    name: "START_SESSION",
    module: "system",
    fields: [
      { name: "threadId", type: "string", required: true, label: "Thread ID" },
      {
        name: "resourceId",
        type: "string",
        required: true,
        label: "Resource ID",
      },
      { name: "agent", type: "agent-info", required: true, label: "Agent" },
      {
        name: "startedAt",
        type: "datetime",
        required: true,
        label: "Started At",
      },
    ],
  },
  {
    name: "SET_AGENT_INFO",
    module: "system",
    fields: [
      { name: "name", type: "string", label: "Name" },
      { name: "model", type: "string", label: "Model" },
      { name: "id", type: "string", label: "ID" },
      { name: "description", type: "text", label: "Description" },
    ],
  },
  {
    name: "SET_AGENT_IMAGE",
    module: "system",
    fields: [{ name: "_image", type: "image-file", label: "Agent Avatar" }],
  },
  {
    name: "SET_AGENT_DESCRIPTION",
    module: "system",
    fields: [
      {
        name: "description",
        type: "text",
        required: true,
        label: "Description",
      },
    ],
  },
  {
    name: "END_SESSION",
    module: "system",
    fields: [
      {
        name: "status",
        type: "enum",
        required: true,
        label: "Status",
        enumValues: ["COMPLETED", "ERROR", "ABORTED", "ACTIVE"],
      },
      { name: "endedAt", type: "datetime", required: true, label: "Ended At" },
    ],
  },
  {
    name: "UPDATE_USAGE_SUMMARY",
    module: "system",
    fields: [
      { name: "totalPromptTokens", type: "int", label: "Prompt Tokens" },
      {
        name: "totalCompletionTokens",
        type: "int",
        label: "Completion Tokens",
      },
      { name: "totalTokens", type: "int", label: "Total Tokens" },
      { name: "totalSteps", type: "int", label: "Steps" },
      { name: "totalMessages", type: "int", label: "Messages" },
      { name: "totalToolCalls", type: "int", label: "Tool Calls" },
    ],
  },
  {
    name: "ADD_SYSTEM_MESSAGE",
    module: "system",
    fields: [
      { name: "id", type: "oid", required: true, label: "Message ID" },
      { name: "text", type: "text", required: true, label: "System Prompt" },
      {
        name: "createdAt",
        type: "datetime",
        required: true,
        label: "Created At",
      },
    ],
  },

  // User module
  {
    name: "ADD_USER_MESSAGE",
    module: "user",
    fields: [
      { name: "id", type: "oid", required: true, label: "Message ID" },
      {
        name: "content",
        type: "content-parts",
        required: true,
        label: "Content Parts",
      },
      {
        name: "createdAt",
        type: "datetime",
        required: true,
        label: "Created At",
      },
    ],
  },
  {
    name: "DELETE_USER_MESSAGE",
    module: "user",
    fields: [
      {
        name: "messageId",
        type: "string",
        required: true,
        label: "Message ID",
      },
    ],
  },
  {
    name: "ABORT_SESSION",
    module: "user",
    fields: [
      { name: "endedAt", type: "datetime", required: true, label: "Ended At" },
    ],
  },
  {
    name: "RETRY_TURN",
    module: "user",
    fields: [
      {
        name: "userMessageId",
        type: "string",
        required: true,
        label: "User Message ID",
      },
      {
        name: "requestedAt",
        type: "datetime",
        required: true,
        label: "Requested At",
      },
    ],
  },
  {
    name: "RESUME_SESSION",
    module: "user",
    fields: [
      {
        name: "resumedAt",
        type: "datetime",
        required: true,
        label: "Resumed At",
      },
    ],
  },

  // Agent module
  {
    name: "ADD_ASSISTANT_MESSAGE",
    module: "agent",
    fields: [
      { name: "id", type: "oid", required: true, label: "Message ID" },
      {
        name: "content",
        type: "assistant-content-parts",
        required: true,
        label: "Content Parts",
      },
      { name: "stepIndex", type: "int", label: "Step Index" },
      {
        name: "createdAt",
        type: "datetime",
        required: true,
        label: "Created At",
      },
    ],
  },
  {
    name: "APPEND_ASSISTANT_CONTENT",
    module: "agent",
    fields: [
      {
        name: "messageId",
        type: "string",
        required: true,
        label: "Message ID",
      },
      {
        name: "part",
        type: "assistant-content-parts",
        required: true,
        label: "Content Part",
      },
    ],
  },
  {
    name: "UPDATE_ASSISTANT_CONTENT",
    module: "agent",
    fields: [
      {
        name: "messageId",
        type: "string",
        required: true,
        label: "Message ID",
      },
      { name: "partId", type: "string", required: true, label: "Part ID" },
      { name: "text", type: "text", label: "Text" },
      { name: "args", type: "text", label: "Args (JSON)" },
      { name: "error", type: "string", label: "Error" },
    ],
  },
  {
    name: "SET_MESSAGE_USAGE",
    module: "agent",
    fields: [
      {
        name: "messageId",
        type: "string",
        required: true,
        label: "Message ID",
      },
      { name: "promptTokens", type: "int", label: "Prompt Tokens" },
      { name: "completionTokens", type: "int", label: "Completion Tokens" },
      { name: "totalTokens", type: "int", label: "Total Tokens" },
    ],
  },
  {
    name: "MARK_MESSAGE_PICKED_UP",
    module: "agent",
    fields: [
      {
        name: "messageId",
        type: "string",
        required: true,
        label: "Message ID",
      },
      {
        name: "pickedUpAt",
        type: "datetime",
        required: true,
        label: "Picked Up At",
      },
    ],
  },
  {
    name: "FAIL_TURN",
    module: "agent",
    fields: [
      { name: "id", type: "oid", required: true, label: "Message ID" },
      {
        name: "userMessageId",
        type: "string",
        required: true,
        label: "User Message ID",
      },
      { name: "code", type: "string", required: true, label: "Code" },
      { name: "message", type: "text", required: true, label: "Message" },
      {
        name: "retryable",
        type: "boolean",
        required: true,
        label: "Retryable",
      },
      {
        name: "failedAt",
        type: "datetime",
        required: true,
        label: "Failed At",
      },
    ],
  },
  {
    name: "CLEAR_RETRY_REQUEST",
    module: "agent",
    fields: [],
  },

  // Tool module
  {
    name: "ADD_TOOL_RESULT",
    module: "tool",
    fields: [
      { name: "id", type: "oid", required: true, label: "Message ID" },
      {
        name: "content",
        type: "tool-result-parts",
        required: true,
        label: "Result Parts",
      },
      { name: "stepIndex", type: "int", label: "Step Index" },
      {
        name: "createdAt",
        type: "datetime",
        required: true,
        label: "Created At",
      },
    ],
  },
  {
    name: "ADD_TOOL_OUTPUT",
    module: "tool",
    fields: [
      {
        name: "messageId",
        type: "string",
        required: true,
        label: "Message ID",
      },
      { name: "partId", type: "oid", required: true, label: "Part ID" },
      {
        name: "toolCallId",
        type: "string",
        required: true,
        label: "Tool Call ID",
      },
      { name: "toolName", type: "string", required: true, label: "Tool Name" },
      { name: "text", type: "text", required: true, label: "Output Text" },
    ],
  },
];

export function getOperationsForModule(module: ModuleName): OperationDef[] {
  return OPERATIONS.filter((op) => op.module === module);
}
