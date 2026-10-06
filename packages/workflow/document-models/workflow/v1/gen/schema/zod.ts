/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as z from "zod";
import type {
  AddEdgeInput,
  AddStepInput,
  AddStepPositionInput,
  AddStepPropertySettingInput,
  AddStepRetryPolicyInput,
  BackoffKind,
  ClearTriggerInput,
  ConcurrencyMode,
  FailureMode,
  Point,
  PropertyMode,
  PropertySetting,
  PublishWorkflowInput,
  PublishedWorkflow,
  RemoveEdgeInput,
  RemoveStepInput,
  RemoveVariableInput,
  RetryPolicy,
  RevertToPublishedInput,
  RunStatus,
  SetLastRunInput,
  SetLastTestInput,
  SetPolicyInput,
  SetPolicyRetryPolicyInput,
  SetStepConfigInput,
  SetStepConfigPropertySettingInput,
  SetTriggerInput,
  SetTriggerPropertySettingInput,
  SetVariableInput,
  SetWorkflowDescriptionInput,
  SetWorkflowNameInput,
  SetWorkflowStatusInput,
  StepTestRecord,
  TriggerBinding,
  UpdateStepInput,
  UpdateStepPositionInput,
  UpdateStepRetryPolicyInput,
  VariableType,
  WorkflowEdge,
  WorkflowPolicy,
  WorkflowState,
  WorkflowStatus,
  WorkflowStep,
  WorkflowVariable,
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

export const BackoffKindSchema = z.enum(["EXPONENTIAL", "FIXED"]);

export const ConcurrencyModeSchema = z.enum(["PARALLEL", "QUEUE", "SINGLETON"]);

export const FailureModeSchema = z.enum(["IGNORE", "NOTIFY", "PARK"]);

export const PropertyModeSchema = z.enum(["EXPRESSION", "MANUAL"]);

export const RunStatusSchema = z.enum([
  "CANCELLED",
  "FAILED",
  "PARKED",
  "PENDING",
  "RUNNING",
  "SUCCEEDED",
  "WAITING",
]);

export const VariableTypeSchema = z.enum([
  "BOOLEAN",
  "JSON",
  "NUMBER",
  "SECRET",
  "TEXT",
]);

export const WorkflowStatusSchema = z.enum([
  "ARCHIVED",
  "DISABLED",
  "DRAFT",
  "ENABLED",
]);

export function AddEdgeInputSchema(): z.ZodObject<Properties<AddEdgeInput>> {
  return z.object({
    condition: z.string().nullish(),
    from: z.string(),
    id: z.string(),
    port: z.string(),
    to: z.string(),
  });
}

export function AddStepInputSchema(): z.ZodObject<Properties<AddStepInput>> {
  return z.object({
    actionName: z.string(),
    config: z.unknown(),
    connectionId: z.string().nullish(),
    id: z.string(),
    idempotencyKeyExpression: z.string().nullish(),
    key: z.string(),
    name: z.string(),
    pieceName: z.string(),
    pieceVersion: z.string(),
    position: z.lazy(() => AddStepPositionInputSchema().nullish()),
    propertySettings: z
      .array(z.lazy(() => AddStepPropertySettingInputSchema()))
      .nullish(),
    reactorConnectionId: z.string().nullish(),
    retry: z.lazy(() => AddStepRetryPolicyInputSchema().nullish()),
    skip: z.boolean().nullish(),
    timeoutSeconds: z.number().nullish(),
  });
}

export function AddStepPositionInputSchema(): z.ZodObject<
  Properties<AddStepPositionInput>
> {
  return z.object({
    x: z.number(),
    y: z.number(),
  });
}

export function AddStepPropertySettingInputSchema(): z.ZodObject<
  Properties<AddStepPropertySettingInput>
> {
  return z.object({
    mode: PropertyModeSchema,
    prop: z.string(),
    schema: z.unknown().nullish(),
  });
}

export function AddStepRetryPolicyInputSchema(): z.ZodObject<
  Properties<AddStepRetryPolicyInput>
> {
  return z.object({
    backoff: BackoffKindSchema,
    initialDelaySeconds: z.number(),
    maxAttempts: z.number(),
    maxDelaySeconds: z.number(),
    retryOn: z.array(z.string()),
  });
}

export function ClearTriggerInputSchema(): z.ZodObject<
  Properties<ClearTriggerInput>
> {
  return z.object({
    _: z.boolean().nullish(),
  });
}

export function PointSchema(): z.ZodObject<Properties<Point>> {
  return z.object({
    __typename: z.literal("Point").optional(),
    x: z.number(),
    y: z.number(),
  });
}

export function PropertySettingSchema(): z.ZodObject<
  Properties<PropertySetting>
> {
  return z.object({
    __typename: z.literal("PropertySetting").optional(),
    mode: PropertyModeSchema,
    prop: z.string(),
    schema: z.unknown().nullish(),
  });
}

export function PublishWorkflowInputSchema(): z.ZodObject<
  Properties<PublishWorkflowInput>
> {
  return z.object({
    publishedAt: z.iso.datetime(),
  });
}

export function PublishedWorkflowSchema(): z.ZodObject<
  Properties<PublishedWorkflow>
> {
  return z.object({
    __typename: z.literal("PublishedWorkflow").optional(),
    edges: z.array(z.lazy(() => WorkflowEdgeSchema())),
    policy: z.lazy(() => WorkflowPolicySchema()),
    publishedAt: z.iso.datetime(),
    steps: z.array(z.lazy(() => WorkflowStepSchema())),
    trigger: z.lazy(() => TriggerBindingSchema().nullish()),
    variables: z.array(z.lazy(() => WorkflowVariableSchema())),
    version: z.number(),
  });
}

export function RemoveEdgeInputSchema(): z.ZodObject<
  Properties<RemoveEdgeInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function RemoveStepInputSchema(): z.ZodObject<
  Properties<RemoveStepInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function RemoveVariableInputSchema(): z.ZodObject<
  Properties<RemoveVariableInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function RetryPolicySchema(): z.ZodObject<Properties<RetryPolicy>> {
  return z.object({
    __typename: z.literal("RetryPolicy").optional(),
    backoff: BackoffKindSchema,
    initialDelaySeconds: z.number(),
    maxAttempts: z.number(),
    maxDelaySeconds: z.number(),
    retryOn: z.array(z.string()),
  });
}

export function RevertToPublishedInputSchema(): z.ZodObject<
  Properties<RevertToPublishedInput>
> {
  return z.object({
    _: z.boolean().nullish(),
  });
}

export function SetLastRunInputSchema(): z.ZodObject<
  Properties<SetLastRunInput>
> {
  return z.object({
    lastRunAt: z.iso.datetime(),
    lastRunStatus: RunStatusSchema,
  });
}

export function SetLastTestInputSchema(): z.ZodObject<
  Properties<SetLastTestInput>
> {
  return z.object({
    id: z.string(),
    runId: z.string(),
    testedAt: z.iso.datetime(),
  });
}

export function SetPolicyInputSchema(): z.ZodObject<
  Properties<SetPolicyInput>
> {
  return z.object({
    concurrency: ConcurrencyModeSchema.nullish(),
    defaultRetry: z.lazy(() => SetPolicyRetryPolicyInputSchema().nullish()),
    journalAsDocument: z.boolean().nullish(),
    maxParallelRuns: z.number().nullish(),
    maxSuspensionDays: z.number().nullish(),
    onFailure: FailureModeSchema.nullish(),
    retainRunsDays: z.number().nullish(),
    runTimeoutSeconds: z.number().nullish(),
  });
}

export function SetPolicyRetryPolicyInputSchema(): z.ZodObject<
  Properties<SetPolicyRetryPolicyInput>
> {
  return z.object({
    backoff: BackoffKindSchema,
    initialDelaySeconds: z.number(),
    maxAttempts: z.number(),
    maxDelaySeconds: z.number(),
    retryOn: z.array(z.string()),
  });
}

export function SetStepConfigInputSchema(): z.ZodObject<
  Properties<SetStepConfigInput>
> {
  return z.object({
    config: z.unknown(),
    id: z.string(),
    propertySettings: z
      .array(z.lazy(() => SetStepConfigPropertySettingInputSchema()))
      .nullish(),
  });
}

export function SetStepConfigPropertySettingInputSchema(): z.ZodObject<
  Properties<SetStepConfigPropertySettingInput>
> {
  return z.object({
    mode: PropertyModeSchema,
    prop: z.string(),
    schema: z.unknown().nullish(),
  });
}

export function SetTriggerInputSchema(): z.ZodObject<
  Properties<SetTriggerInput>
> {
  return z.object({
    config: z.unknown(),
    connectionId: z.string().nullish(),
    id: z.string(),
    pieceName: z.string(),
    pieceVersion: z.string(),
    propertySettings: z
      .array(z.lazy(() => SetTriggerPropertySettingInputSchema()))
      .nullish(),
    reactorConnectionId: z.string().nullish(),
    triggerName: z.string(),
  });
}

export function SetTriggerPropertySettingInputSchema(): z.ZodObject<
  Properties<SetTriggerPropertySettingInput>
> {
  return z.object({
    mode: PropertyModeSchema,
    prop: z.string(),
    schema: z.unknown().nullish(),
  });
}

export function SetVariableInputSchema(): z.ZodObject<
  Properties<SetVariableInput>
> {
  return z.object({
    description: z.string().nullish(),
    id: z.string(),
    key: z.string(),
    type: VariableTypeSchema.nullish(),
    value: z.unknown().nullish(),
  });
}

export function SetWorkflowDescriptionInputSchema(): z.ZodObject<
  Properties<SetWorkflowDescriptionInput>
> {
  return z.object({
    description: z.string().nullish(),
  });
}

export function SetWorkflowNameInputSchema(): z.ZodObject<
  Properties<SetWorkflowNameInput>
> {
  return z.object({
    name: z.string(),
  });
}

export function SetWorkflowStatusInputSchema(): z.ZodObject<
  Properties<SetWorkflowStatusInput>
> {
  return z.object({
    status: WorkflowStatusSchema,
  });
}

export function StepTestRecordSchema(): z.ZodObject<
  Properties<StepTestRecord>
> {
  return z.object({
    __typename: z.literal("StepTestRecord").optional(),
    runId: z.string(),
    testedAt: z.iso.datetime(),
  });
}

export function TriggerBindingSchema(): z.ZodObject<
  Properties<TriggerBinding>
> {
  return z.object({
    __typename: z.literal("TriggerBinding").optional(),
    config: z.unknown(),
    connectionId: z.string().nullish(),
    id: z.string(),
    lastTest: z.lazy(() => StepTestRecordSchema().nullish()),
    pieceName: z.string(),
    pieceVersion: z.string(),
    propertySettings: z.array(z.lazy(() => PropertySettingSchema())).nullish(),
    reactorConnectionId: z.string().nullish(),
    triggerName: z.string(),
    updatedAt: z.iso.datetime().nullish(),
  });
}

export function UpdateStepInputSchema(): z.ZodObject<
  Properties<UpdateStepInput>
> {
  return z.object({
    actionName: z.string().nullish(),
    config: z.unknown().nullish(),
    connectionId: z.string().nullish(),
    id: z.string(),
    idempotencyKeyExpression: z.string().nullish(),
    key: z.string().nullish(),
    name: z.string().nullish(),
    pieceName: z.string().nullish(),
    pieceVersion: z.string().nullish(),
    position: z.lazy(() => UpdateStepPositionInputSchema().nullish()),
    reactorConnectionId: z.string().nullish(),
    retry: z.lazy(() => UpdateStepRetryPolicyInputSchema().nullish()),
    skip: z.boolean().nullish(),
    timeoutSeconds: z.number().nullish(),
  });
}

export function UpdateStepPositionInputSchema(): z.ZodObject<
  Properties<UpdateStepPositionInput>
> {
  return z.object({
    x: z.number(),
    y: z.number(),
  });
}

export function UpdateStepRetryPolicyInputSchema(): z.ZodObject<
  Properties<UpdateStepRetryPolicyInput>
> {
  return z.object({
    backoff: BackoffKindSchema,
    initialDelaySeconds: z.number(),
    maxAttempts: z.number(),
    maxDelaySeconds: z.number(),
    retryOn: z.array(z.string()),
  });
}

export function WorkflowEdgeSchema(): z.ZodObject<Properties<WorkflowEdge>> {
  return z.object({
    __typename: z.literal("WorkflowEdge").optional(),
    condition: z.string().nullish(),
    from: z.string(),
    id: z.string(),
    port: z.string(),
    to: z.string(),
  });
}

export function WorkflowPolicySchema(): z.ZodObject<
  Properties<WorkflowPolicy>
> {
  return z.object({
    __typename: z.literal("WorkflowPolicy").optional(),
    concurrency: ConcurrencyModeSchema,
    defaultRetry: z.lazy(() => RetryPolicySchema()),
    journalAsDocument: z.boolean(),
    maxParallelRuns: z.number().nullish(),
    maxSuspensionDays: z.number(),
    onFailure: FailureModeSchema,
    retainRunsDays: z.number(),
    runTimeoutSeconds: z.number(),
  });
}

export function WorkflowStateSchema(): z.ZodObject<Properties<WorkflowState>> {
  return z.object({
    __typename: z.literal("WorkflowState").optional(),
    description: z.string().nullish(),
    edges: z.array(z.lazy(() => WorkflowEdgeSchema())),
    lastRunAt: z.iso.datetime().nullish(),
    lastRunStatus: RunStatusSchema.nullish(),
    name: z.string(),
    policy: z.lazy(() => WorkflowPolicySchema()),
    published: z.lazy(() => PublishedWorkflowSchema().nullish()),
    status: WorkflowStatusSchema,
    steps: z.array(z.lazy(() => WorkflowStepSchema())),
    trigger: z.lazy(() => TriggerBindingSchema().nullish()),
    variables: z.array(z.lazy(() => WorkflowVariableSchema())),
    version: z.number(),
  });
}

export function WorkflowStepSchema(): z.ZodObject<Properties<WorkflowStep>> {
  return z.object({
    __typename: z.literal("WorkflowStep").optional(),
    actionName: z.string(),
    config: z.unknown(),
    connectionId: z.string().nullish(),
    id: z.string(),
    idempotencyKeyExpression: z.string().nullish(),
    key: z.string(),
    lastTest: z.lazy(() => StepTestRecordSchema().nullish()),
    name: z.string(),
    pieceName: z.string(),
    pieceVersion: z.string(),
    position: z.lazy(() => PointSchema().nullish()),
    propertySettings: z.array(z.lazy(() => PropertySettingSchema())).nullish(),
    reactorConnectionId: z.string().nullish(),
    retry: z.lazy(() => RetryPolicySchema().nullish()),
    skip: z.boolean().nullish(),
    timeoutSeconds: z.number().nullish(),
    updatedAt: z.iso.datetime().nullish(),
  });
}

export function WorkflowVariableSchema(): z.ZodObject<
  Properties<WorkflowVariable>
> {
  return z.object({
    __typename: z.literal("WorkflowVariable").optional(),
    description: z.string().nullish(),
    id: z.string(),
    key: z.string(),
    type: VariableTypeSchema.nullish(),
    value: z.unknown().nullish(),
  });
}
