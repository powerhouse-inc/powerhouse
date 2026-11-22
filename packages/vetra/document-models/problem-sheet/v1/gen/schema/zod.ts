/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as z from "zod";
import type {
  AddConstraintInput,
  AddJobStepInput,
  AddOutcomeInput,
  AddRoleInput,
  AddSpecializedJobStepInput,
  AddSuggestionInput,
  AgentFeedback,
  ClearContextInput,
  ClearCoreJobInput,
  ClearOutcomeMetricInput,
  ClearOutcomeRoleInput,
  ClearOutcomeStepInput,
  ClearRoleSpecializedJobInput,
  Constraint,
  JobMapStep,
  JobStatement,
  JobStep,
  Motivation,
  Outcome,
  OutcomeDirection,
  OutcomeScope,
  ProblemSheetState,
  RemoveConstraintInput,
  RemoveJobStepInput,
  RemoveOutcomeInput,
  RemoveRoleInput,
  RemoveSpecializedJobStepInput,
  RemoveSuggestionInput,
  ReorderConstraintsInput,
  ReorderJobStepsInput,
  ReorderOutcomesInput,
  ReorderRolesInput,
  ReorderSpecializedJobStepsInput,
  ResolveSuggestionInput,
  Role,
  RoleKind,
  SetContextInput,
  SetCoreJobInput,
  SetReadyForFeedbackInput,
  SetRoleSpecializedJobInput,
  Severity,
  SpecializedJob,
  Suggestion,
  SuggestionDecision,
  SuggestionResolution,
  UpdateConstraintInput,
  UpdateCoreJobInput,
  UpdateJobStepInput,
  UpdateOutcomeInput,
  UpdateRoleInput,
  UpdateRoleSpecializedJobInput,
  UpdateSpecializedJobStepInput,
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

export const JobMapStepSchema = z.enum([
  "CONCLUDE",
  "CONFIRM",
  "DEFINE",
  "EXECUTE",
  "LOCATE",
  "MODIFY",
  "MONITOR",
  "PREPARE",
]);

export const MotivationSchema = z.enum([
  "CANNOT",
  "HATE_TO",
  "HAVE_TO",
  "LOVE_TO",
  "NEED_TO",
  "WANT_TO",
]);

export const OutcomeDirectionSchema = z.enum([
  "AVOID",
  "DECREASE",
  "INCREASE",
  "SATISFY",
]);

export const OutcomeScopeSchema = z.enum([
  "CORE",
  "OPERATIONAL",
  "SPECIALIZED",
]);

export const RoleKindSchema = z.enum(["PRIMARY", "SUPPORT"]);

export const SeveritySchema = z.enum(["HIGH", "LOW", "MEDIUM"]);

export const SuggestionDecisionSchema = z.enum(["ACCEPTED", "DISMISSED"]);

export function AddConstraintInputSchema(): z.ZodObject<
  Properties<AddConstraintInput>
> {
  return z.object({
    description: z.string(),
    id: z.string(),
    insertBefore: z.string().nullish(),
    notes: z.string().nullish(),
    severity: SeveritySchema,
  });
}

export function AddJobStepInputSchema(): z.ZodObject<
  Properties<AddJobStepInput>
> {
  return z.object({
    category: JobMapStepSchema,
    description: z.string().nullish(),
    id: z.string(),
    insertBefore: z.string().nullish(),
    name: z.string(),
  });
}

export function AddOutcomeInputSchema(): z.ZodObject<
  Properties<AddOutcomeInput>
> {
  return z.object({
    clarifier: z.string().nullish(),
    direction: OutcomeDirectionSchema,
    id: z.string(),
    insertBefore: z.string().nullish(),
    metric: z.string().nullish(),
    notes: z.string().nullish(),
    object: z.string(),
    relatedStep: z.string().nullish(),
    role: z.string().nullish(),
    scope: OutcomeScopeSchema,
  });
}

export function AddRoleInputSchema(): z.ZodObject<Properties<AddRoleInput>> {
  return z.object({
    context: z.string().nullish(),
    description: z.string().nullish(),
    id: z.string(),
    insertBefore: z.string().nullish(),
    kind: RoleKindSchema,
    name: z.string(),
  });
}

export function AddSpecializedJobStepInputSchema(): z.ZodObject<
  Properties<AddSpecializedJobStepInput>
> {
  return z.object({
    category: JobMapStepSchema,
    description: z.string().nullish(),
    id: z.string(),
    insertBefore: z.string().nullish(),
    name: z.string(),
    roleId: z.string(),
  });
}

export function AddSuggestionInputSchema(): z.ZodObject<
  Properties<AddSuggestionInput>
> {
  return z.object({
    agent: z.string(),
    content: z.string(),
    createdAt: z.iso.datetime(),
    id: z.string(),
  });
}

export function AgentFeedbackSchema(): z.ZodObject<Properties<AgentFeedback>> {
  return z.object({
    __typename: z.literal("AgentFeedback").optional(),
    readyForFeedback: z.boolean(),
    suggestions: z.array(z.lazy(() => SuggestionSchema())),
  });
}

export function ClearContextInputSchema(): z.ZodObject<
  Properties<ClearContextInput>
> {
  return z.object({
    _: z.boolean().nullish(),
  });
}

export function ClearCoreJobInputSchema(): z.ZodObject<
  Properties<ClearCoreJobInput>
> {
  return z.object({
    _: z.boolean().nullish(),
  });
}

export function ClearOutcomeMetricInputSchema(): z.ZodObject<
  Properties<ClearOutcomeMetricInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function ClearOutcomeRoleInputSchema(): z.ZodObject<
  Properties<ClearOutcomeRoleInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function ClearOutcomeStepInputSchema(): z.ZodObject<
  Properties<ClearOutcomeStepInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function ClearRoleSpecializedJobInputSchema(): z.ZodObject<
  Properties<ClearRoleSpecializedJobInput>
> {
  return z.object({
    roleId: z.string(),
  });
}

export function ConstraintSchema(): z.ZodObject<Properties<Constraint>> {
  return z.object({
    __typename: z.literal("Constraint").optional(),
    description: z.string(),
    id: z.string(),
    notes: z.string().nullish(),
    severity: SeveritySchema,
  });
}

export function JobStatementSchema(): z.ZodObject<Properties<JobStatement>> {
  return z.object({
    __typename: z.literal("JobStatement").optional(),
    clarifier: z.string().nullish(),
    motivation: MotivationSchema,
    object: z.string(),
    verb: z.string(),
  });
}

export function JobStepSchema(): z.ZodObject<Properties<JobStep>> {
  return z.object({
    __typename: z.literal("JobStep").optional(),
    category: JobMapStepSchema,
    description: z.string().nullish(),
    id: z.string(),
    name: z.string(),
  });
}

export function OutcomeSchema(): z.ZodObject<Properties<Outcome>> {
  return z.object({
    __typename: z.literal("Outcome").optional(),
    clarifier: z.string().nullish(),
    direction: OutcomeDirectionSchema,
    id: z.string(),
    metric: z.string().nullish(),
    notes: z.string().nullish(),
    object: z.string(),
    relatedStep: z.string().nullish(),
    role: z.string().nullish(),
    scope: OutcomeScopeSchema,
  });
}

export function ProblemSheetStateSchema(): z.ZodObject<
  Properties<ProblemSheetState>
> {
  return z.object({
    __typename: z.literal("ProblemSheetState").optional(),
    agentFeedback: z.lazy(() => AgentFeedbackSchema()),
    constraints: z.array(z.lazy(() => ConstraintSchema())),
    context: z.string().nullish(),
    coreJob: z.lazy(() => JobStatementSchema().nullish()),
    coreJobSteps: z.array(z.lazy(() => JobStepSchema())),
    outcomes: z.array(z.lazy(() => OutcomeSchema())),
    roles: z.array(z.lazy(() => RoleSchema())),
  });
}

export function RemoveConstraintInputSchema(): z.ZodObject<
  Properties<RemoveConstraintInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function RemoveJobStepInputSchema(): z.ZodObject<
  Properties<RemoveJobStepInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function RemoveOutcomeInputSchema(): z.ZodObject<
  Properties<RemoveOutcomeInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function RemoveRoleInputSchema(): z.ZodObject<
  Properties<RemoveRoleInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function RemoveSpecializedJobStepInputSchema(): z.ZodObject<
  Properties<RemoveSpecializedJobStepInput>
> {
  return z.object({
    id: z.string(),
    roleId: z.string(),
  });
}

export function RemoveSuggestionInputSchema(): z.ZodObject<
  Properties<RemoveSuggestionInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function ReorderConstraintsInputSchema(): z.ZodObject<
  Properties<ReorderConstraintsInput>
> {
  return z.object({
    ids: z.array(z.string()),
    insertBefore: z.string().nullish(),
  });
}

export function ReorderJobStepsInputSchema(): z.ZodObject<
  Properties<ReorderJobStepsInput>
> {
  return z.object({
    ids: z.array(z.string()),
    insertBefore: z.string().nullish(),
  });
}

export function ReorderOutcomesInputSchema(): z.ZodObject<
  Properties<ReorderOutcomesInput>
> {
  return z.object({
    ids: z.array(z.string()),
    insertBefore: z.string().nullish(),
  });
}

export function ReorderRolesInputSchema(): z.ZodObject<
  Properties<ReorderRolesInput>
> {
  return z.object({
    ids: z.array(z.string()),
    insertBefore: z.string().nullish(),
  });
}

export function ReorderSpecializedJobStepsInputSchema(): z.ZodObject<
  Properties<ReorderSpecializedJobStepsInput>
> {
  return z.object({
    ids: z.array(z.string()),
    insertBefore: z.string().nullish(),
    roleId: z.string(),
  });
}

export function ResolveSuggestionInputSchema(): z.ZodObject<
  Properties<ResolveSuggestionInput>
> {
  return z.object({
    changeApplied: z.boolean(),
    comment: z.string().nullish(),
    decision: SuggestionDecisionSchema,
    id: z.string(),
    resolvedAt: z.iso.datetime(),
  });
}

export function RoleSchema(): z.ZodObject<Properties<Role>> {
  return z.object({
    __typename: z.literal("Role").optional(),
    context: z.string().nullish(),
    description: z.string().nullish(),
    id: z.string(),
    kind: RoleKindSchema,
    name: z.string(),
    specializedJob: z.lazy(() => SpecializedJobSchema().nullish()),
  });
}

export function SetContextInputSchema(): z.ZodObject<
  Properties<SetContextInput>
> {
  return z.object({
    context: z.string(),
  });
}

export function SetCoreJobInputSchema(): z.ZodObject<
  Properties<SetCoreJobInput>
> {
  return z.object({
    clarifier: z.string().nullish(),
    motivation: MotivationSchema,
    object: z.string(),
    verb: z.string(),
  });
}

export function SetReadyForFeedbackInputSchema(): z.ZodObject<
  Properties<SetReadyForFeedbackInput>
> {
  return z.object({
    ready: z.boolean(),
  });
}

export function SetRoleSpecializedJobInputSchema(): z.ZodObject<
  Properties<SetRoleSpecializedJobInput>
> {
  return z.object({
    clarifier: z.string().nullish(),
    motivation: MotivationSchema,
    object: z.string(),
    roleId: z.string(),
    verb: z.string(),
  });
}

export function SpecializedJobSchema(): z.ZodObject<
  Properties<SpecializedJob>
> {
  return z.object({
    __typename: z.literal("SpecializedJob").optional(),
    clarifier: z.string().nullish(),
    motivation: MotivationSchema,
    object: z.string(),
    steps: z.array(z.lazy(() => JobStepSchema())),
    verb: z.string(),
  });
}

export function SuggestionSchema(): z.ZodObject<Properties<Suggestion>> {
  return z.object({
    __typename: z.literal("Suggestion").optional(),
    agent: z.string(),
    content: z.string(),
    createdAt: z.iso.datetime(),
    id: z.string(),
    resolution: z.lazy(() => SuggestionResolutionSchema().nullish()),
  });
}

export function SuggestionResolutionSchema(): z.ZodObject<
  Properties<SuggestionResolution>
> {
  return z.object({
    __typename: z.literal("SuggestionResolution").optional(),
    changeApplied: z.boolean(),
    comment: z.string().nullish(),
    decision: SuggestionDecisionSchema,
    resolvedAt: z.iso.datetime(),
  });
}

export function UpdateConstraintInputSchema(): z.ZodObject<
  Properties<UpdateConstraintInput>
> {
  return z.object({
    description: z.string().nullish(),
    id: z.string(),
    notes: z.string().nullish(),
    severity: SeveritySchema.nullish(),
  });
}

export function UpdateCoreJobInputSchema(): z.ZodObject<
  Properties<UpdateCoreJobInput>
> {
  return z.object({
    clarifier: z.string().nullish(),
    motivation: MotivationSchema.nullish(),
    object: z.string().nullish(),
    verb: z.string().nullish(),
  });
}

export function UpdateJobStepInputSchema(): z.ZodObject<
  Properties<UpdateJobStepInput>
> {
  return z.object({
    category: JobMapStepSchema.nullish(),
    description: z.string().nullish(),
    id: z.string(),
    name: z.string().nullish(),
  });
}

export function UpdateOutcomeInputSchema(): z.ZodObject<
  Properties<UpdateOutcomeInput>
> {
  return z.object({
    clarifier: z.string().nullish(),
    direction: OutcomeDirectionSchema.nullish(),
    id: z.string(),
    metric: z.string().nullish(),
    notes: z.string().nullish(),
    object: z.string().nullish(),
    relatedStep: z.string().nullish(),
    role: z.string().nullish(),
    scope: OutcomeScopeSchema.nullish(),
  });
}

export function UpdateRoleInputSchema(): z.ZodObject<
  Properties<UpdateRoleInput>
> {
  return z.object({
    context: z.string().nullish(),
    description: z.string().nullish(),
    id: z.string(),
    kind: RoleKindSchema.nullish(),
    name: z.string().nullish(),
  });
}

export function UpdateRoleSpecializedJobInputSchema(): z.ZodObject<
  Properties<UpdateRoleSpecializedJobInput>
> {
  return z.object({
    clarifier: z.string().nullish(),
    motivation: MotivationSchema.nullish(),
    object: z.string().nullish(),
    roleId: z.string(),
    verb: z.string().nullish(),
  });
}

export function UpdateSpecializedJobStepInputSchema(): z.ZodObject<
  Properties<UpdateSpecializedJobStepInput>
> {
  return z.object({
    category: JobMapStepSchema.nullish(),
    description: z.string().nullish(),
    id: z.string(),
    name: z.string().nullish(),
    roleId: z.string(),
  });
}
