/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as z from "zod";
import type {
  AddEvidenceInput,
  AddOutcomeTargetInput,
  AddSegmentRefInput,
  AddSuggestionInput,
  AgentFeedback,
  ArchiveFeatureInput,
  ClearEstimatesInput,
  ClearExpectedEffectInput,
  ClearFeatureNameInput,
  ClearNotesInput,
  ClearParentFeatureInput,
  ClearPremiseInput,
  ClearPromotionInput,
  ClearReasoningInput,
  ClearRelatedStepInput,
  ClearRoleInput,
  ClearSummaryInput,
  ClearTargetReleaseInput,
  ClearWbsInput,
  CommitFeatureInput,
  Confidence,
  Effort,
  Evidence,
  EvidenceSource,
  FeatureRef,
  FeatureScope,
  FeatureState,
  FeatureStatus,
  Impact,
  JobStepRef,
  OutcomeRef,
  OutcomeTarget,
  ParkFeatureInput,
  PromoteToSpecInput,
  PromotionEvent,
  RemoveEvidenceInput,
  RemoveOutcomeTargetInput,
  RemoveSegmentRefInput,
  RemoveSuggestionInput,
  ReopenFeatureInput,
  ReorderOutcomeTargetsInput,
  ReorderSegmentRefsInput,
  ResolveSuggestionInput,
  RoleRef,
  SegmentRef,
  SetConfidenceInput,
  SetEffortInput,
  SetExpectedEffectInput,
  SetFeatureNameInput,
  SetImpactInput,
  SetNotesInput,
  SetParentFeatureInput,
  SetPremiseInput,
  SetReadyForFeedbackInput,
  SetReasoningInput,
  SetRelatedStepInput,
  SetRoleInput,
  SetScopeInput,
  SetSummaryInput,
  SetTargetReleaseInput,
  SetWbsInput,
  StartEvaluationInput,
  Suggestion,
  SuggestionDecision,
  SuggestionResolution,
  UpdateEvidenceInput,
  UpdateOutcomeTargetInput,
  UpdateOutcomeTargetSnippetInput,
  UpdateParentFeatureSnippetInput,
  UpdateRelatedStepSnippetInput,
  UpdateRoleSnippetInput,
  UpdateSegmentRefSnippetInput,
  UpdateWbsSnippetInput,
  WbsRef,
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

export const ConfidenceSchema = z.enum(["HIGH", "LOW", "MEDIUM"]);

export const EffortSchema = z.enum(["LARGE", "MEDIUM", "SMALL"]);

export const EvidenceSourceSchema = z.enum([
  "AI_SIMULATION",
  "BUILDER",
  "USER_RESEARCH",
]);

export const FeatureScopeSchema = z.enum([
  "INCREMENTAL",
  "MAINTENANCE",
  "MARKET_MVP",
  "MICRO_MVP",
]);

export const FeatureStatusSchema = z.enum([
  "ARCHIVED",
  "COMMITTED",
  "EVALUATING",
  "IN_SPEC",
  "PARKED",
  "PROPOSED",
]);

export const ImpactSchema = z.enum(["HIGH", "LOW", "MEDIUM"]);

export const SuggestionDecisionSchema = z.enum(["ACCEPTED", "DISMISSED"]);

export function AddEvidenceInputSchema(): z.ZodObject<
  Properties<AddEvidenceInput>
> {
  return z.object({
    content: z.string(),
    id: z.string(),
    insertBefore: z.string().nullish(),
    recordedAt: z.iso.datetime().nullish(),
    source: EvidenceSourceSchema,
  });
}

export function AddOutcomeTargetInputSchema(): z.ZodObject<
  Properties<AddOutcomeTargetInput>
> {
  return z.object({
    expectedImportanceChange: z.number().nullish(),
    expectedSatisfactionChange: z.number().nullish(),
    id: z.string(),
    insertBefore: z.string().nullish(),
    notes: z.string().nullish(),
    outcomeDocumentId: z.string(),
    outcomeObjectId: z.string(),
    outcomeScope: z.string().nullish(),
    outcomeStatement: z.string().nullish(),
  });
}

export function AddSegmentRefInputSchema(): z.ZodObject<
  Properties<AddSegmentRefInput>
> {
  return z.object({
    description: z.string().nullish(),
    documentId: z.string(),
    id: z.string(),
    insertBefore: z.string().nullish(),
    name: z.string().nullish(),
    objectId: z.string(),
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

export function ArchiveFeatureInputSchema(): z.ZodObject<
  Properties<ArchiveFeatureInput>
> {
  return z.object({
    reason: z.string().nullish(),
  });
}

export function ClearEstimatesInputSchema(): z.ZodObject<
  Properties<ClearEstimatesInput>
> {
  return z.object({
    _: z.boolean().nullish(),
  });
}

export function ClearExpectedEffectInputSchema(): z.ZodObject<
  Properties<ClearExpectedEffectInput>
> {
  return z.object({
    _: z.boolean().nullish(),
  });
}

export function ClearFeatureNameInputSchema(): z.ZodObject<
  Properties<ClearFeatureNameInput>
> {
  return z.object({
    _: z.boolean().nullish(),
  });
}

export function ClearNotesInputSchema(): z.ZodObject<
  Properties<ClearNotesInput>
> {
  return z.object({
    _: z.boolean().nullish(),
  });
}

export function ClearParentFeatureInputSchema(): z.ZodObject<
  Properties<ClearParentFeatureInput>
> {
  return z.object({
    _: z.boolean().nullish(),
  });
}

export function ClearPremiseInputSchema(): z.ZodObject<
  Properties<ClearPremiseInput>
> {
  return z.object({
    _: z.boolean().nullish(),
  });
}

export function ClearPromotionInputSchema(): z.ZodObject<
  Properties<ClearPromotionInput>
> {
  return z.object({
    _: z.boolean().nullish(),
  });
}

export function ClearReasoningInputSchema(): z.ZodObject<
  Properties<ClearReasoningInput>
> {
  return z.object({
    _: z.boolean().nullish(),
  });
}

export function ClearRelatedStepInputSchema(): z.ZodObject<
  Properties<ClearRelatedStepInput>
> {
  return z.object({
    _: z.boolean().nullish(),
  });
}

export function ClearRoleInputSchema(): z.ZodObject<
  Properties<ClearRoleInput>
> {
  return z.object({
    _: z.boolean().nullish(),
  });
}

export function ClearSummaryInputSchema(): z.ZodObject<
  Properties<ClearSummaryInput>
> {
  return z.object({
    _: z.boolean().nullish(),
  });
}

export function ClearTargetReleaseInputSchema(): z.ZodObject<
  Properties<ClearTargetReleaseInput>
> {
  return z.object({
    _: z.boolean().nullish(),
  });
}

export function ClearWbsInputSchema(): z.ZodObject<Properties<ClearWbsInput>> {
  return z.object({
    _: z.boolean().nullish(),
  });
}

export function CommitFeatureInputSchema(): z.ZodObject<
  Properties<CommitFeatureInput>
> {
  return z.object({
    _: z.boolean().nullish(),
  });
}

export function EvidenceSchema(): z.ZodObject<Properties<Evidence>> {
  return z.object({
    __typename: z.literal("Evidence").optional(),
    content: z.string(),
    id: z.string(),
    recordedAt: z.iso.datetime().nullish(),
    source: EvidenceSourceSchema,
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

export function FeatureStateSchema(): z.ZodObject<Properties<FeatureState>> {
  return z.object({
    __typename: z.literal("FeatureState").optional(),
    agentFeedback: z.lazy(() => AgentFeedbackSchema()),
    confidence: ConfidenceSchema.nullish(),
    effort: EffortSchema.nullish(),
    evidence: z.array(z.lazy(() => EvidenceSchema())),
    expectedEffect: z.string().nullish(),
    impact: ImpactSchema.nullish(),
    name: z.string().nullish(),
    notes: z.string().nullish(),
    parentFeature: z.lazy(() => FeatureRefSchema().nullish()),
    premise: z.string().nullish(),
    promotion: z.lazy(() => PromotionEventSchema().nullish()),
    reasoning: z.string().nullish(),
    relatedStep: z.lazy(() => JobStepRefSchema().nullish()),
    role: z.lazy(() => RoleRefSchema().nullish()),
    scope: FeatureScopeSchema,
    segments: z.array(z.lazy(() => SegmentRefSchema())),
    status: FeatureStatusSchema,
    summary: z.string().nullish(),
    targetRelease: z.string().nullish(),
    targets: z.array(z.lazy(() => OutcomeTargetSchema())),
    wbs: z.lazy(() => WbsRefSchema().nullish()),
  });
}

export function JobStepRefSchema(): z.ZodObject<Properties<JobStepRef>> {
  return z.object({
    __typename: z.literal("JobStepRef").optional(),
    category: z.string().nullish(),
    documentId: z.string(),
    name: z.string().nullish(),
    objectId: z.string(),
  });
}

export function OutcomeRefSchema(): z.ZodObject<Properties<OutcomeRef>> {
  return z.object({
    __typename: z.literal("OutcomeRef").optional(),
    documentId: z.string(),
    objectId: z.string(),
    scope: z.string().nullish(),
    statement: z.string().nullish(),
  });
}

export function OutcomeTargetSchema(): z.ZodObject<Properties<OutcomeTarget>> {
  return z.object({
    __typename: z.literal("OutcomeTarget").optional(),
    expectedImportanceChange: z.number().nullish(),
    expectedSatisfactionChange: z.number().nullish(),
    id: z.string(),
    notes: z.string().nullish(),
    outcome: z.lazy(() => OutcomeRefSchema()),
  });
}

export function ParkFeatureInputSchema(): z.ZodObject<
  Properties<ParkFeatureInput>
> {
  return z.object({
    reason: z.string().nullish(),
  });
}

export function PromoteToSpecInputSchema(): z.ZodObject<
  Properties<PromoteToSpecInput>
> {
  return z.object({
    promotedAt: z.iso.datetime(),
    promotedBy: z.string().nullish(),
    rationale: z.string().nullish(),
  });
}

export function PromotionEventSchema(): z.ZodObject<
  Properties<PromotionEvent>
> {
  return z.object({
    __typename: z.literal("PromotionEvent").optional(),
    promotedAt: z.iso.datetime(),
    promotedBy: z.string().nullish(),
    rationale: z.string().nullish(),
  });
}

export function RemoveEvidenceInputSchema(): z.ZodObject<
  Properties<RemoveEvidenceInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function RemoveOutcomeTargetInputSchema(): z.ZodObject<
  Properties<RemoveOutcomeTargetInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function RemoveSegmentRefInputSchema(): z.ZodObject<
  Properties<RemoveSegmentRefInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function RemoveSuggestionInputSchema(): z.ZodObject<
  Properties<RemoveSuggestionInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function ReopenFeatureInputSchema(): z.ZodObject<
  Properties<ReopenFeatureInput>
> {
  return z.object({
    _: z.boolean().nullish(),
  });
}

export function ReorderOutcomeTargetsInputSchema(): z.ZodObject<
  Properties<ReorderOutcomeTargetsInput>
> {
  return z.object({
    ids: z.array(z.string()),
    insertBefore: z.string().nullish(),
  });
}

export function ReorderSegmentRefsInputSchema(): z.ZodObject<
  Properties<ReorderSegmentRefsInput>
> {
  return z.object({
    ids: z.array(z.string()),
    insertBefore: z.string().nullish(),
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

export function RoleRefSchema(): z.ZodObject<Properties<RoleRef>> {
  return z.object({
    __typename: z.literal("RoleRef").optional(),
    documentId: z.string(),
    kind: z.string().nullish(),
    name: z.string().nullish(),
    objectId: z.string(),
  });
}

export function SegmentRefSchema(): z.ZodObject<Properties<SegmentRef>> {
  return z.object({
    __typename: z.literal("SegmentRef").optional(),
    description: z.string().nullish(),
    documentId: z.string(),
    id: z.string(),
    name: z.string().nullish(),
    objectId: z.string(),
  });
}

export function SetConfidenceInputSchema(): z.ZodObject<
  Properties<SetConfidenceInput>
> {
  return z.object({
    confidence: ConfidenceSchema,
  });
}

export function SetEffortInputSchema(): z.ZodObject<
  Properties<SetEffortInput>
> {
  return z.object({
    effort: EffortSchema,
  });
}

export function SetExpectedEffectInputSchema(): z.ZodObject<
  Properties<SetExpectedEffectInput>
> {
  return z.object({
    expectedEffect: z.string(),
  });
}

export function SetFeatureNameInputSchema(): z.ZodObject<
  Properties<SetFeatureNameInput>
> {
  return z.object({
    name: z.string(),
  });
}

export function SetImpactInputSchema(): z.ZodObject<
  Properties<SetImpactInput>
> {
  return z.object({
    impact: ImpactSchema,
  });
}

export function SetNotesInputSchema(): z.ZodObject<Properties<SetNotesInput>> {
  return z.object({
    notes: z.string(),
  });
}

export function SetParentFeatureInputSchema(): z.ZodObject<
  Properties<SetParentFeatureInput>
> {
  return z.object({
    documentId: z.string(),
    name: z.string().nullish(),
    status: z.string().nullish(),
  });
}

export function SetPremiseInputSchema(): z.ZodObject<
  Properties<SetPremiseInput>
> {
  return z.object({
    premise: z.string(),
  });
}

export function SetReadyForFeedbackInputSchema(): z.ZodObject<
  Properties<SetReadyForFeedbackInput>
> {
  return z.object({
    ready: z.boolean(),
  });
}

export function SetReasoningInputSchema(): z.ZodObject<
  Properties<SetReasoningInput>
> {
  return z.object({
    reasoning: z.string(),
  });
}

export function SetRelatedStepInputSchema(): z.ZodObject<
  Properties<SetRelatedStepInput>
> {
  return z.object({
    category: z.string().nullish(),
    documentId: z.string(),
    name: z.string().nullish(),
    objectId: z.string(),
  });
}

export function SetRoleInputSchema(): z.ZodObject<Properties<SetRoleInput>> {
  return z.object({
    documentId: z.string(),
    kind: z.string().nullish(),
    name: z.string().nullish(),
    objectId: z.string(),
  });
}

export function SetScopeInputSchema(): z.ZodObject<Properties<SetScopeInput>> {
  return z.object({
    scope: FeatureScopeSchema,
  });
}

export function SetSummaryInputSchema(): z.ZodObject<
  Properties<SetSummaryInput>
> {
  return z.object({
    summary: z.string(),
  });
}

export function SetTargetReleaseInputSchema(): z.ZodObject<
  Properties<SetTargetReleaseInput>
> {
  return z.object({
    targetRelease: z.string(),
  });
}

export function SetWbsInputSchema(): z.ZodObject<Properties<SetWbsInput>> {
  return z.object({
    documentId: z.string(),
    name: z.string().nullish(),
    status: z.string().nullish(),
  });
}

export function StartEvaluationInputSchema(): z.ZodObject<
  Properties<StartEvaluationInput>
> {
  return z.object({
    _: z.boolean().nullish(),
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

export function UpdateEvidenceInputSchema(): z.ZodObject<
  Properties<UpdateEvidenceInput>
> {
  return z.object({
    content: z.string().nullish(),
    id: z.string(),
    recordedAt: z.iso.datetime().nullish(),
    source: EvidenceSourceSchema.nullish(),
  });
}

export function UpdateOutcomeTargetInputSchema(): z.ZodObject<
  Properties<UpdateOutcomeTargetInput>
> {
  return z.object({
    expectedImportanceChange: z.number().nullish(),
    expectedSatisfactionChange: z.number().nullish(),
    id: z.string(),
    notes: z.string().nullish(),
  });
}

export function UpdateOutcomeTargetSnippetInputSchema(): z.ZodObject<
  Properties<UpdateOutcomeTargetSnippetInput>
> {
  return z.object({
    id: z.string(),
    scope: z.string().nullish(),
    statement: z.string().nullish(),
  });
}

export function UpdateParentFeatureSnippetInputSchema(): z.ZodObject<
  Properties<UpdateParentFeatureSnippetInput>
> {
  return z.object({
    name: z.string().nullish(),
    status: z.string().nullish(),
  });
}

export function UpdateRelatedStepSnippetInputSchema(): z.ZodObject<
  Properties<UpdateRelatedStepSnippetInput>
> {
  return z.object({
    category: z.string().nullish(),
    name: z.string().nullish(),
  });
}

export function UpdateRoleSnippetInputSchema(): z.ZodObject<
  Properties<UpdateRoleSnippetInput>
> {
  return z.object({
    kind: z.string().nullish(),
    name: z.string().nullish(),
  });
}

export function UpdateSegmentRefSnippetInputSchema(): z.ZodObject<
  Properties<UpdateSegmentRefSnippetInput>
> {
  return z.object({
    description: z.string().nullish(),
    id: z.string(),
    name: z.string().nullish(),
  });
}

export function UpdateWbsSnippetInputSchema(): z.ZodObject<
  Properties<UpdateWbsSnippetInput>
> {
  return z.object({
    name: z.string().nullish(),
    status: z.string().nullish(),
  });
}

export function WbsRefSchema(): z.ZodObject<Properties<WbsRef>> {
  return z.object({
    __typename: z.literal("WbsRef").optional(),
    documentId: z.string(),
    name: z.string().nullish(),
    status: z.string().nullish(),
  });
}
