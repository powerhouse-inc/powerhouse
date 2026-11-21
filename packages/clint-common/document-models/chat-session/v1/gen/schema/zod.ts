/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as z from "zod";
import type {
  AbortSessionInput,
  AddAssistantMessageInput,
  AddSystemMessageInput,
  AddToolOutputInput,
  AddToolResultInput,
  AddUserMessageInput,
  AgentInfo,
  AgentInfoInput,
  AppendAssistantContentInput,
  AssistantContentPartInput,
  ChatSessionState,
  ClearRetryRequestInput,
  ContentPart,
  ContentPartType,
  DeleteUserMessageInput,
  EndSessionInput,
  FailTurnInput,
  FinishAssistantMessageInput,
  InterruptAgentInput,
  MarkMessagePickedUpInput,
  Message,
  MessageRole,
  MessageUsage,
  ResumeSessionInput,
  RetryTurnInput,
  SessionStatus,
  SetAgentDescriptionInput,
  SetAgentImageInput,
  SetAgentInfoInput,
  SetMessageUsageInput,
  StartSessionInput,
  ToolResultPartInput,
  TurnFailure,
  UpdateAssistantContentInput,
  UpdateUsageSummaryInput,
  UsageSummary,
  UserContentPartInput,
} from "./types.js";

type Properties<T> = Required<{
  [K in keyof T]: z.ZodType<T[K]>;
}>;

type definedNonNullAny = {};

export const isDefinedNonNullAny = (v: any): v is definedNonNullAny =>
  v !== undefined && v !== null;

export const definedNonNullAnySchema = z
  .any()
  .refine((v) => isDefinedNonNullAny(v));

export const ContentPartTypeSchema = z.enum([
  "ERROR",
  "FILE",
  "IMAGE",
  "REASONING",
  "TEXT",
  "TOOL_CALL",
  "TOOL_RESULT",
]);

export const MessageRoleSchema = z.enum([
  "ASSISTANT",
  "SYSTEM",
  "TOOL",
  "USER",
]);

export const SessionStatusSchema = z.enum([
  "ABORTED",
  "ACTIVE",
  "COMPLETED",
  "ERROR",
]);

export function AbortSessionInputSchema(): z.ZodObject<
  Properties<AbortSessionInput>
> {
  return z.object({
    endedAt: z.iso.datetime(),
  });
}

export function AddAssistantMessageInputSchema(): z.ZodObject<
  Properties<AddAssistantMessageInput>
> {
  return z.object({
    content: z.array(z.lazy(() => AssistantContentPartInputSchema())),
    createdAt: z.iso.datetime(),
    id: z.string(),
    stepIndex: z.number().nullish(),
  });
}

export function AddSystemMessageInputSchema(): z.ZodObject<
  Properties<AddSystemMessageInput>
> {
  return z.object({
    createdAt: z.iso.datetime(),
    id: z.string(),
    text: z.string(),
  });
}

export function AddToolOutputInputSchema(): z.ZodObject<
  Properties<AddToolOutputInput>
> {
  return z.object({
    messageId: z.string(),
    partId: z.string(),
    text: z.string(),
    toolCallId: z.string(),
    toolName: z.string(),
  });
}

export function AddToolResultInputSchema(): z.ZodObject<
  Properties<AddToolResultInput>
> {
  return z.object({
    content: z.array(z.lazy(() => ToolResultPartInputSchema())),
    createdAt: z.iso.datetime(),
    id: z.string(),
    stepIndex: z.number().nullish(),
  });
}

export function AddUserMessageInputSchema(): z.ZodObject<
  Properties<AddUserMessageInput>
> {
  return z.object({
    content: z.array(z.lazy(() => UserContentPartInputSchema())),
    createdAt: z.iso.datetime(),
    id: z.string(),
  });
}

export function AgentInfoSchema(): z.ZodObject<Properties<AgentInfo>> {
  return z.object({
    __typename: z.literal("AgentInfo").optional(),
    attachment: z.string().nullish(),
    description: z.string().nullish(),
    id: z.string().nullish(),
    model: z.string().nullish(),
    name: z.string().nullish(),
  });
}

export function AgentInfoInputSchema(): z.ZodObject<
  Properties<AgentInfoInput>
> {
  return z.object({
    description: z.string().nullish(),
    id: z.string().nullish(),
    model: z.string().nullish(),
    name: z.string().nullish(),
  });
}

export function AppendAssistantContentInputSchema(): z.ZodObject<
  Properties<AppendAssistantContentInput>
> {
  return z.object({
    messageId: z.string(),
    part: z.lazy(() => AssistantContentPartInputSchema()),
  });
}

export function AssistantContentPartInputSchema(): z.ZodObject<
  Properties<AssistantContentPartInput>
> {
  return z.object({
    args: z.string().nullish(),
    attachment: z.string().nullish(),
    error: z.string().nullish(),
    filename: z.string().nullish(),
    id: z.string(),
    mediaType: z.string().nullish(),
    text: z.string().nullish(),
    toolCallId: z.string().nullish(),
    toolName: z.string().nullish(),
    type: ContentPartTypeSchema,
    url: z.url().nullish(),
  });
}

export function ChatSessionStateSchema(): z.ZodObject<
  Properties<ChatSessionState>
> {
  return z.object({
    __typename: z.literal("ChatSessionState").optional(),
    agent: z.lazy(() => AgentInfoSchema().nullish()),
    endedAt: z.iso.datetime().nullish(),
    interruptRequested: z.boolean().nullish(),
    messages: z.array(z.lazy(() => MessageSchema())),
    resourceId: z.string().nullish(),
    retryRequestedAt: z.iso.datetime().nullish(),
    retryRequestedFor: z.string().nullish(),
    startedAt: z.iso.datetime().nullish(),
    status: SessionStatusSchema,
    threadId: z.string().nullish(),
    usage: z.lazy(() => UsageSummarySchema().nullish()),
  });
}

export function ClearRetryRequestInputSchema(): z.ZodObject<
  Properties<ClearRetryRequestInput>
> {
  return z.object({
    _: z.boolean().nullish(),
  });
}

export function ContentPartSchema(): z.ZodObject<Properties<ContentPart>> {
  return z.object({
    __typename: z.literal("ContentPart").optional(),
    args: z.string().nullish(),
    attachment: z.string().nullish(),
    error: z.string().nullish(),
    filename: z.string().nullish(),
    id: z.string(),
    isError: z.boolean().nullish(),
    mediaType: z.string().nullish(),
    result: z.string().nullish(),
    text: z.string().nullish(),
    toolCallId: z.string().nullish(),
    toolName: z.string().nullish(),
    type: ContentPartTypeSchema,
    url: z.url().nullish(),
  });
}

export function DeleteUserMessageInputSchema(): z.ZodObject<
  Properties<DeleteUserMessageInput>
> {
  return z.object({
    messageId: z.string(),
  });
}

export function EndSessionInputSchema(): z.ZodObject<
  Properties<EndSessionInput>
> {
  return z.object({
    endedAt: z.iso.datetime(),
    status: SessionStatusSchema,
  });
}

export function FailTurnInputSchema(): z.ZodObject<Properties<FailTurnInput>> {
  return z.object({
    code: z.string(),
    failedAt: z.iso.datetime(),
    id: z.string(),
    message: z.string(),
    retryable: z.boolean(),
    userMessageId: z.string(),
  });
}

export function FinishAssistantMessageInputSchema(): z.ZodObject<
  Properties<FinishAssistantMessageInput>
> {
  return z.object({
    finishReason: z.string().nullish(),
    finishedAt: z.iso.datetime(),
    messageId: z.string(),
  });
}

export function InterruptAgentInputSchema(): z.ZodObject<
  Properties<InterruptAgentInput>
> {
  return z.object({
    _: z.boolean().nullish(),
  });
}

export function MarkMessagePickedUpInputSchema(): z.ZodObject<
  Properties<MarkMessagePickedUpInput>
> {
  return z.object({
    messageId: z.string(),
    pickedUpAt: z.iso.datetime(),
  });
}

export function MessageSchema(): z.ZodObject<Properties<Message>> {
  return z.object({
    __typename: z.literal("Message").optional(),
    content: z.array(z.lazy(() => ContentPartSchema())),
    createdAt: z.iso.datetime(),
    failure: z.lazy(() => TurnFailureSchema().nullish()),
    finishReason: z.string().nullish(),
    finishedAt: z.iso.datetime().nullish(),
    id: z.string(),
    pickedUpAt: z.iso.datetime().nullish(),
    role: MessageRoleSchema,
    stepIndex: z.number().nullish(),
    usage: z.lazy(() => MessageUsageSchema().nullish()),
  });
}

export function MessageUsageSchema(): z.ZodObject<Properties<MessageUsage>> {
  return z.object({
    __typename: z.literal("MessageUsage").optional(),
    completionTokens: z.number().nullish(),
    promptTokens: z.number().nullish(),
    totalTokens: z.number().nullish(),
  });
}

export function ResumeSessionInputSchema(): z.ZodObject<
  Properties<ResumeSessionInput>
> {
  return z.object({
    resumedAt: z.iso.datetime(),
  });
}

export function RetryTurnInputSchema(): z.ZodObject<
  Properties<RetryTurnInput>
> {
  return z.object({
    requestedAt: z.iso.datetime(),
    userMessageId: z.string(),
  });
}

export function SetAgentDescriptionInputSchema(): z.ZodObject<
  Properties<SetAgentDescriptionInput>
> {
  return z.object({
    description: z.string(),
  });
}

export function SetAgentImageInputSchema(): z.ZodObject<
  Properties<SetAgentImageInput>
> {
  return z.object({
    attachment: z.string().nullish(),
  });
}

export function SetAgentInfoInputSchema(): z.ZodObject<
  Properties<SetAgentInfoInput>
> {
  return z.object({
    description: z.string().nullish(),
    id: z.string().nullish(),
    model: z.string().nullish(),
    name: z.string().nullish(),
  });
}

export function SetMessageUsageInputSchema(): z.ZodObject<
  Properties<SetMessageUsageInput>
> {
  return z.object({
    completionTokens: z.number().nullish(),
    messageId: z.string(),
    promptTokens: z.number().nullish(),
    totalTokens: z.number().nullish(),
  });
}

export function StartSessionInputSchema(): z.ZodObject<
  Properties<StartSessionInput>
> {
  return z.object({
    agent: z.lazy(() => AgentInfoInputSchema()),
    resourceId: z.string(),
    startedAt: z.iso.datetime(),
    threadId: z.string(),
  });
}

export function ToolResultPartInputSchema(): z.ZodObject<
  Properties<ToolResultPartInput>
> {
  return z.object({
    attachment: z.string().nullish(),
    id: z.string(),
    isError: z.boolean().nullish(),
    mediaType: z.string().nullish(),
    result: z.string().nullish(),
    text: z.string().nullish(),
    toolCallId: z.string(),
    toolName: z.string(),
    type: ContentPartTypeSchema,
    url: z.url().nullish(),
  });
}

export function TurnFailureSchema(): z.ZodObject<Properties<TurnFailure>> {
  return z.object({
    __typename: z.literal("TurnFailure").optional(),
    code: z.string(),
    failedAt: z.iso.datetime(),
    message: z.string(),
    retryable: z.boolean(),
    userMessageId: z.string(),
  });
}

export function UpdateAssistantContentInputSchema(): z.ZodObject<
  Properties<UpdateAssistantContentInput>
> {
  return z.object({
    args: z.string().nullish(),
    error: z.string().nullish(),
    messageId: z.string(),
    partId: z.string(),
    text: z.string().nullish(),
  });
}

export function UpdateUsageSummaryInputSchema(): z.ZodObject<
  Properties<UpdateUsageSummaryInput>
> {
  return z.object({
    totalCompletionTokens: z.number().nullish(),
    totalMessages: z.number().nullish(),
    totalPromptTokens: z.number().nullish(),
    totalSteps: z.number().nullish(),
    totalTokens: z.number().nullish(),
    totalToolCalls: z.number().nullish(),
  });
}

export function UsageSummarySchema(): z.ZodObject<Properties<UsageSummary>> {
  return z.object({
    __typename: z.literal("UsageSummary").optional(),
    totalCompletionTokens: z.number(),
    totalMessages: z.number(),
    totalPromptTokens: z.number(),
    totalSteps: z.number(),
    totalTokens: z.number(),
    totalToolCalls: z.number(),
  });
}

export function UserContentPartInputSchema(): z.ZodObject<
  Properties<UserContentPartInput>
> {
  return z.object({
    attachment: z.string().nullish(),
    filename: z.string().nullish(),
    id: z.string(),
    mediaType: z.string().nullish(),
    text: z.string().nullish(),
    type: ContentPartTypeSchema,
    url: z.url().nullish(),
  });
}
