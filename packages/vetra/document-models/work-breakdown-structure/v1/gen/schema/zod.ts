/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as z from "zod";
import type {
  AcceptTaskInput,
  ActivateWbsInput,
  AddPackageInput,
  AddTaskDependencyInput,
  AddTaskInput,
  AddTaskOutcomeRefInput,
  ArchiveWbsInput,
  AssignTaskInput,
  BlockTaskInput,
  ClearFeatureInput,
  ClearTaskParentFeatureInput,
  ClearTaskPlannedInInput,
  ClearTaskTargetSpecInput,
  ClearWbsDescriptionInput,
  ClearWbsNameInput,
  CompleteWbsInput,
  DropTaskInput,
  FeatureRef,
  MovePackageInput,
  MoveTaskInput,
  OutcomeRef,
  RejectTaskInput,
  RemovePackageInput,
  RemoveTaskDependencyInput,
  RemoveTaskInput,
  RemoveTaskOutcomeRefInput,
  ReopenWbsInput,
  ReorderPackagesInput,
  ReorderTaskOutcomeRefsInput,
  ReorderTasksInput,
  SessionRef,
  SetFeatureInput,
  SetTaskParentFeatureInput,
  SetTaskPlannedInInput,
  SetTaskTargetSpecInput,
  SetWbsDescriptionInput,
  SetWbsNameInput,
  SpecRef,
  SubmitTaskForReviewInput,
  Task,
  TaskKind,
  TaskRef,
  TaskStatus,
  UnassignTaskInput,
  UnblockTaskInput,
  UpdateFeatureSnippetInput,
  UpdatePackageInput,
  UpdateTaskDependencySnippetInput,
  UpdateTaskInput,
  UpdateTaskOutcomeRefSnippetInput,
  UpdateTaskParentFeatureSnippetInput,
  UpdateTaskPlannedInSnippetInput,
  UpdateTaskSessionSnippetInput,
  UpdateTaskTargetSpecSnippetInput,
  WbsStatus,
  WorkBreakdownStructureState,
  WorkPackage,
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

export const TaskKindSchema = z.enum([
  "DOCUMENTATION",
  "IMPLEMENTATION",
  "INTEGRATION",
  "MAINTENANCE",
  "REVIEW",
  "SPEC_CHANGE",
  "TESTING",
]);

export const TaskStatusSchema = z.enum([
  "BLOCKED",
  "DONE",
  "DROPPED",
  "IN_PROGRESS",
  "REVIEW",
  "TODO",
]);

export const WbsStatusSchema = z.enum([
  "ACTIVE",
  "ARCHIVED",
  "COMPLETE",
  "DRAFT",
]);

export function AcceptTaskInputSchema(): z.ZodObject<
  Properties<AcceptTaskInput>
> {
  return z.object({
    completedAt: z.iso.datetime(),
    taskId: z.string(),
  });
}

export function ActivateWbsInputSchema(): z.ZodObject<
  Properties<ActivateWbsInput>
> {
  return z.object({
    _: z.boolean().nullish(),
  });
}

export function AddPackageInputSchema(): z.ZodObject<
  Properties<AddPackageInput>
> {
  return z.object({
    description: z.string().nullish(),
    id: z.string(),
    insertBefore: z.string().nullish(),
    name: z.string(),
    parentPackageId: z.string().nullish(),
  });
}

export function AddTaskDependencyInputSchema(): z.ZodObject<
  Properties<AddTaskDependencyInput>
> {
  return z.object({
    documentId: z.string(),
    id: z.string(),
    name: z.string().nullish(),
    objectId: z.string(),
    status: z.string().nullish(),
    taskId: z.string(),
  });
}

export function AddTaskInputSchema(): z.ZodObject<Properties<AddTaskInput>> {
  return z.object({
    acceptanceCriteria: z.string().nullish(),
    description: z.string().nullish(),
    id: z.string(),
    insertBefore: z.string().nullish(),
    name: z.string(),
    owner: z.string().nullish(),
    packageId: z.string().nullish(),
    taskKind: z.array(TaskKindSchema),
  });
}

export function AddTaskOutcomeRefInputSchema(): z.ZodObject<
  Properties<AddTaskOutcomeRefInput>
> {
  return z.object({
    documentId: z.string(),
    id: z.string(),
    insertBefore: z.string().nullish(),
    objectId: z.string(),
    scope: z.string().nullish(),
    statement: z.string().nullish(),
    taskId: z.string(),
  });
}

export function ArchiveWbsInputSchema(): z.ZodObject<
  Properties<ArchiveWbsInput>
> {
  return z.object({
    _: z.boolean().nullish(),
  });
}

export function AssignTaskInputSchema(): z.ZodObject<
  Properties<AssignTaskInput>
> {
  return z.object({
    agent: z.string().nullish(),
    documentId: z.string(),
    model: z.string().nullish(),
    owner: z.string().nullish(),
    startedAt: z.iso.datetime(),
    taskId: z.string(),
  });
}

export function BlockTaskInputSchema(): z.ZodObject<
  Properties<BlockTaskInput>
> {
  return z.object({
    reason: z.string().nullish(),
    taskId: z.string(),
  });
}

export function ClearFeatureInputSchema(): z.ZodObject<
  Properties<ClearFeatureInput>
> {
  return z.object({
    _: z.boolean().nullish(),
  });
}

export function ClearTaskParentFeatureInputSchema(): z.ZodObject<
  Properties<ClearTaskParentFeatureInput>
> {
  return z.object({
    taskId: z.string(),
  });
}

export function ClearTaskPlannedInInputSchema(): z.ZodObject<
  Properties<ClearTaskPlannedInInput>
> {
  return z.object({
    taskId: z.string(),
  });
}

export function ClearTaskTargetSpecInputSchema(): z.ZodObject<
  Properties<ClearTaskTargetSpecInput>
> {
  return z.object({
    taskId: z.string(),
  });
}

export function ClearWbsDescriptionInputSchema(): z.ZodObject<
  Properties<ClearWbsDescriptionInput>
> {
  return z.object({
    _: z.boolean().nullish(),
  });
}

export function ClearWbsNameInputSchema(): z.ZodObject<
  Properties<ClearWbsNameInput>
> {
  return z.object({
    _: z.boolean().nullish(),
  });
}

export function CompleteWbsInputSchema(): z.ZodObject<
  Properties<CompleteWbsInput>
> {
  return z.object({
    _: z.boolean().nullish(),
  });
}

export function DropTaskInputSchema(): z.ZodObject<Properties<DropTaskInput>> {
  return z.object({
    reason: z.string().nullish(),
    taskId: z.string(),
  });
}

export function FeatureRefSchema(): z.ZodObject<Properties<FeatureRef>> {
  return z.object({
    __typename: z.literal("FeatureRef").optional(),
    documentId: z.string(),
    name: z.string().nullish(),
    status: z.string().nullish(),
  });
}

export function MovePackageInputSchema(): z.ZodObject<
  Properties<MovePackageInput>
> {
  return z.object({
    id: z.string(),
    parentPackageId: z.string().nullish(),
  });
}

export function MoveTaskInputSchema(): z.ZodObject<Properties<MoveTaskInput>> {
  return z.object({
    id: z.string(),
    insertBefore: z.string().nullish(),
    packageId: z.string().nullish(),
  });
}

export function OutcomeRefSchema(): z.ZodObject<Properties<OutcomeRef>> {
  return z.object({
    __typename: z.literal("OutcomeRef").optional(),
    documentId: z.string(),
    id: z.string(),
    objectId: z.string(),
    scope: z.string().nullish(),
    statement: z.string().nullish(),
  });
}

export function RejectTaskInputSchema(): z.ZodObject<
  Properties<RejectTaskInput>
> {
  return z.object({
    taskId: z.string(),
  });
}

export function RemovePackageInputSchema(): z.ZodObject<
  Properties<RemovePackageInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function RemoveTaskDependencyInputSchema(): z.ZodObject<
  Properties<RemoveTaskDependencyInput>
> {
  return z.object({
    id: z.string(),
    taskId: z.string(),
  });
}

export function RemoveTaskInputSchema(): z.ZodObject<
  Properties<RemoveTaskInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function RemoveTaskOutcomeRefInputSchema(): z.ZodObject<
  Properties<RemoveTaskOutcomeRefInput>
> {
  return z.object({
    id: z.string(),
    taskId: z.string(),
  });
}

export function ReopenWbsInputSchema(): z.ZodObject<
  Properties<ReopenWbsInput>
> {
  return z.object({
    _: z.boolean().nullish(),
  });
}

export function ReorderPackagesInputSchema(): z.ZodObject<
  Properties<ReorderPackagesInput>
> {
  return z.object({
    ids: z.array(z.string()),
    insertBefore: z.string().nullish(),
  });
}

export function ReorderTaskOutcomeRefsInputSchema(): z.ZodObject<
  Properties<ReorderTaskOutcomeRefsInput>
> {
  return z.object({
    ids: z.array(z.string()),
    insertBefore: z.string().nullish(),
    taskId: z.string(),
  });
}

export function ReorderTasksInputSchema(): z.ZodObject<
  Properties<ReorderTasksInput>
> {
  return z.object({
    ids: z.array(z.string()),
    insertBefore: z.string().nullish(),
  });
}

export function SessionRefSchema(): z.ZodObject<Properties<SessionRef>> {
  return z.object({
    __typename: z.literal("SessionRef").optional(),
    agent: z.string().nullish(),
    documentId: z.string(),
    model: z.string().nullish(),
  });
}

export function SetFeatureInputSchema(): z.ZodObject<
  Properties<SetFeatureInput>
> {
  return z.object({
    documentId: z.string(),
    name: z.string().nullish(),
    status: z.string().nullish(),
  });
}

export function SetTaskParentFeatureInputSchema(): z.ZodObject<
  Properties<SetTaskParentFeatureInput>
> {
  return z.object({
    documentId: z.string(),
    name: z.string().nullish(),
    status: z.string().nullish(),
    taskId: z.string(),
  });
}

export function SetTaskPlannedInInputSchema(): z.ZodObject<
  Properties<SetTaskPlannedInInput>
> {
  return z.object({
    agent: z.string().nullish(),
    documentId: z.string(),
    model: z.string().nullish(),
    taskId: z.string(),
  });
}

export function SetTaskTargetSpecInputSchema(): z.ZodObject<
  Properties<SetTaskTargetSpecInput>
> {
  return z.object({
    documentId: z.string(),
    kind: z.string().nullish(),
    name: z.string().nullish(),
    taskId: z.string(),
  });
}

export function SetWbsDescriptionInputSchema(): z.ZodObject<
  Properties<SetWbsDescriptionInput>
> {
  return z.object({
    description: z.string(),
  });
}

export function SetWbsNameInputSchema(): z.ZodObject<
  Properties<SetWbsNameInput>
> {
  return z.object({
    name: z.string(),
  });
}

export function SpecRefSchema(): z.ZodObject<Properties<SpecRef>> {
  return z.object({
    __typename: z.literal("SpecRef").optional(),
    documentId: z.string(),
    kind: z.string().nullish(),
    name: z.string().nullish(),
  });
}

export function SubmitTaskForReviewInputSchema(): z.ZodObject<
  Properties<SubmitTaskForReviewInput>
> {
  return z.object({
    taskId: z.string(),
  });
}

export function TaskSchema(): z.ZodObject<Properties<Task>> {
  return z.object({
    __typename: z.literal("Task").optional(),
    acceptanceCriteria: z.string().nullish(),
    completedAt: z.iso.datetime().nullish(),
    dependsOn: z.array(z.lazy(() => TaskRefSchema())),
    description: z.string().nullish(),
    id: z.string(),
    name: z.string(),
    notes: z.string().nullish(),
    owner: z.string().nullish(),
    packageId: z.string().nullish(),
    parentFeature: z.lazy(() => FeatureRefSchema().nullish()),
    plannedIn: z.lazy(() => SessionRefSchema().nullish()),
    session: z.lazy(() => SessionRefSchema().nullish()),
    startedAt: z.iso.datetime().nullish(),
    status: TaskStatusSchema,
    targetOutcomes: z.array(z.lazy(() => OutcomeRefSchema())),
    targetSpec: z.lazy(() => SpecRefSchema().nullish()),
    taskKind: z.array(TaskKindSchema),
  });
}

export function TaskRefSchema(): z.ZodObject<Properties<TaskRef>> {
  return z.object({
    __typename: z.literal("TaskRef").optional(),
    documentId: z.string(),
    id: z.string(),
    name: z.string().nullish(),
    objectId: z.string(),
    status: z.string().nullish(),
  });
}

export function UnassignTaskInputSchema(): z.ZodObject<
  Properties<UnassignTaskInput>
> {
  return z.object({
    taskId: z.string(),
  });
}

export function UnblockTaskInputSchema(): z.ZodObject<
  Properties<UnblockTaskInput>
> {
  return z.object({
    taskId: z.string(),
  });
}

export function UpdateFeatureSnippetInputSchema(): z.ZodObject<
  Properties<UpdateFeatureSnippetInput>
> {
  return z.object({
    name: z.string().nullish(),
    status: z.string().nullish(),
  });
}

export function UpdatePackageInputSchema(): z.ZodObject<
  Properties<UpdatePackageInput>
> {
  return z.object({
    description: z.string().nullish(),
    id: z.string(),
    name: z.string().nullish(),
  });
}

export function UpdateTaskDependencySnippetInputSchema(): z.ZodObject<
  Properties<UpdateTaskDependencySnippetInput>
> {
  return z.object({
    id: z.string(),
    name: z.string().nullish(),
    status: z.string().nullish(),
    taskId: z.string(),
  });
}

export function UpdateTaskInputSchema(): z.ZodObject<
  Properties<UpdateTaskInput>
> {
  return z.object({
    acceptanceCriteria: z.string().nullish(),
    description: z.string().nullish(),
    id: z.string(),
    name: z.string().nullish(),
    notes: z.string().nullish(),
    owner: z.string().nullish(),
    taskKind: z.array(TaskKindSchema).nullish(),
  });
}

export function UpdateTaskOutcomeRefSnippetInputSchema(): z.ZodObject<
  Properties<UpdateTaskOutcomeRefSnippetInput>
> {
  return z.object({
    id: z.string(),
    scope: z.string().nullish(),
    statement: z.string().nullish(),
    taskId: z.string(),
  });
}

export function UpdateTaskParentFeatureSnippetInputSchema(): z.ZodObject<
  Properties<UpdateTaskParentFeatureSnippetInput>
> {
  return z.object({
    name: z.string().nullish(),
    status: z.string().nullish(),
    taskId: z.string(),
  });
}

export function UpdateTaskPlannedInSnippetInputSchema(): z.ZodObject<
  Properties<UpdateTaskPlannedInSnippetInput>
> {
  return z.object({
    agent: z.string().nullish(),
    model: z.string().nullish(),
    taskId: z.string(),
  });
}

export function UpdateTaskSessionSnippetInputSchema(): z.ZodObject<
  Properties<UpdateTaskSessionSnippetInput>
> {
  return z.object({
    agent: z.string().nullish(),
    model: z.string().nullish(),
    taskId: z.string(),
  });
}

export function UpdateTaskTargetSpecSnippetInputSchema(): z.ZodObject<
  Properties<UpdateTaskTargetSpecSnippetInput>
> {
  return z.object({
    kind: z.string().nullish(),
    name: z.string().nullish(),
    taskId: z.string(),
  });
}

export function WorkBreakdownStructureStateSchema(): z.ZodObject<
  Properties<WorkBreakdownStructureState>
> {
  return z.object({
    __typename: z.literal("WorkBreakdownStructureState").optional(),
    description: z.string().nullish(),
    feature: z.lazy(() => FeatureRefSchema().nullish()),
    name: z.string().nullish(),
    packages: z.array(z.lazy(() => WorkPackageSchema())),
    status: WbsStatusSchema,
    tasks: z.array(z.lazy(() => TaskSchema())),
  });
}

export function WorkPackageSchema(): z.ZodObject<Properties<WorkPackage>> {
  return z.object({
    __typename: z.literal("WorkPackage").optional(),
    description: z.string().nullish(),
    id: z.string(),
    name: z.string(),
    parentPackageId: z.string().nullish(),
  });
}
