/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as z from "zod";
import type {
  AddEdgeInput,
  AddStepInput,
  AddStepPositionInput,
  AddStepRetryPolicyInput,
  BackoffKind,
  ClearTriggerInput,
  ConcurrencyMode,
  FailureMode,
  Point,
  RemoveEdgeInput,
  RemoveStepInput,
  RemoveVariableInput,
  RetryPolicy,
  RunStatus,
  SetLastRunInput,
  SetPolicyInput,
  SetPolicyRetryPolicyInput,
  SetStepConfigInput,
  SetTriggerInput,
  SetVariableInput,
  SetWorkflowDescriptionInput,
  SetWorkflowNameInput,
  SetWorkflowStatusInput,
  TriggerBinding,
  UpdateStepInput,
  UpdateStepPositionInput,
  UpdateStepRetryPolicyInput,
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

export const RunStatusSchema = z.enum([
  "CANCELLED",
  "FAILED",
  "PARKED",
  "PENDING",
  "RUNNING",
  "SUCCEEDED",
  "WAITING",
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
    blockType: z.string(),
    config: z.unknown(),
    connectionId: z.string().nullish(),
    id: z.string(),
    idempotencyKeyExpression: z.string().nullish(),
    key: z.string(),
    name: z.string(),
    position: z.lazy(() => AddStepPositionInputSchema().nullish()),
    retry: z.lazy(() => AddStepRetryPolicyInputSchema().nullish()),
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

export function SetLastRunInputSchema(): z.ZodObject<
  Properties<SetLastRunInput>
> {
  return z.object({
    lastRunAt: z.iso.datetime(),
    lastRunStatus: RunStatusSchema,
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
  });
}

export function SetTriggerInputSchema(): z.ZodObject<
  Properties<SetTriggerInput>
> {
  return z.object({
    blockType: z.string(),
    config: z.unknown(),
    connectionId: z.string().nullish(),
    filter: z.unknown().nullish(),
    id: z.string(),
  });
}

export function SetVariableInputSchema(): z.ZodObject<
  Properties<SetVariableInput>
> {
  return z.object({
    description: z.string().nullish(),
    id: z.string(),
    key: z.string(),
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

export function TriggerBindingSchema(): z.ZodObject<
  Properties<TriggerBinding>
> {
  return z.object({
    __typename: z.literal("TriggerBinding").optional(),
    blockType: z.string(),
    config: z.unknown(),
    connectionId: z.string().nullish(),
    filter: z.unknown().nullish(),
    id: z.string(),
  });
}

export function UpdateStepInputSchema(): z.ZodObject<
  Properties<UpdateStepInput>
> {
  return z.object({
    blockType: z.string().nullish(),
    config: z.unknown().nullish(),
    connectionId: z.string().nullish(),
    id: z.string(),
    idempotencyKeyExpression: z.string().nullish(),
    key: z.string().nullish(),
    name: z.string().nullish(),
    position: z.lazy(() => UpdateStepPositionInputSchema().nullish()),
    retry: z.lazy(() => UpdateStepRetryPolicyInputSchema().nullish()),
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
    blockType: z.string(),
    config: z.unknown(),
    connectionId: z.string().nullish(),
    id: z.string(),
    idempotencyKeyExpression: z.string().nullish(),
    key: z.string(),
    name: z.string(),
    position: z.lazy(() => PointSchema().nullish()),
    retry: z.lazy(() => RetryPolicySchema().nullish()),
    timeoutSeconds: z.number().nullish(),
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
    value: z.unknown().nullish(),
  });
}
