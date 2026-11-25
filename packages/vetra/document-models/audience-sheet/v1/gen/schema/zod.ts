/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as z from "zod";
import type {
  AddOutcomePriorityInput,
  AddSegmentEvidenceInput,
  AddSegmentInput,
  AddSegmentRoleInput,
  AddSuggestionInput,
  AgentFeedback,
  AudienceSheetState,
  Evidence,
  EvidenceSource,
  OutcomePriority,
  OutcomeRef,
  RemoveOutcomePriorityInput,
  RemoveSegmentEvidenceInput,
  RemoveSegmentInput,
  RemoveSegmentRoleInput,
  RemoveSuggestionInput,
  ReorderOutcomePrioritiesInput,
  ReorderSegmentRolesInput,
  ReorderSegmentsInput,
  ResolveSuggestionInput,
  RoleRef,
  Segment,
  SetReadyForFeedbackInput,
  Suggestion,
  SuggestionDecision,
  SuggestionResolution,
  UpdateOutcomePriorityInput,
  UpdateOutcomePrioritySnippetInput,
  UpdateSegmentEvidenceInput,
  UpdateSegmentInput,
  UpdateSegmentRoleSnippetInput,
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

export const EvidenceSourceSchema = z.enum([
  "AI_SIMULATION",
  "BUILDER",
  "USER_RESEARCH",
]);

export const SuggestionDecisionSchema = z.enum(["ACCEPTED", "DISMISSED"]);

export function AddOutcomePriorityInputSchema(): z.ZodObject<
  Properties<AddOutcomePriorityInput>
> {
  return z.object({
    id: z.string(),
    importance: z.number(),
    insertBefore: z.string().nullish(),
    notes: z.string().nullish(),
    outcomeDocumentId: z.string(),
    outcomeObjectId: z.string(),
    outcomeScope: z.string().nullish(),
    outcomeStatement: z.string().nullish(),
    satisfaction: z.number(),
    segmentId: z.string(),
    source: EvidenceSourceSchema,
  });
}

export function AddSegmentEvidenceInputSchema(): z.ZodObject<
  Properties<AddSegmentEvidenceInput>
> {
  return z.object({
    content: z.string(),
    id: z.string(),
    insertBefore: z.string().nullish(),
    recordedAt: z.iso.datetime().nullish(),
    segmentId: z.string(),
    source: EvidenceSourceSchema,
  });
}

export function AddSegmentInputSchema(): z.ZodObject<
  Properties<AddSegmentInput>
> {
  return z.object({
    description: z.string().nullish(),
    id: z.string(),
    insertBefore: z.string().nullish(),
    name: z.string(),
  });
}

export function AddSegmentRoleInputSchema(): z.ZodObject<
  Properties<AddSegmentRoleInput>
> {
  return z.object({
    documentId: z.string(),
    id: z.string(),
    insertBefore: z.string().nullish(),
    kind: z.string().nullish(),
    name: z.string().nullish(),
    objectId: z.string(),
    segmentId: z.string(),
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

export function AudienceSheetStateSchema(): z.ZodObject<
  Properties<AudienceSheetState>
> {
  return z.object({
    __typename: z.literal("AudienceSheetState").optional(),
    agentFeedback: z.lazy(() => AgentFeedbackSchema()),
    segments: z.array(z.lazy(() => SegmentSchema())),
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

export function OutcomePrioritySchema(): z.ZodObject<
  Properties<OutcomePriority>
> {
  return z.object({
    __typename: z.literal("OutcomePriority").optional(),
    id: z.string(),
    importance: z.number(),
    notes: z.string().nullish(),
    opportunity: z.number(),
    outcome: z.lazy(() => OutcomeRefSchema()),
    satisfaction: z.number(),
    source: EvidenceSourceSchema,
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

export function RemoveOutcomePriorityInputSchema(): z.ZodObject<
  Properties<RemoveOutcomePriorityInput>
> {
  return z.object({
    id: z.string(),
    segmentId: z.string(),
  });
}

export function RemoveSegmentEvidenceInputSchema(): z.ZodObject<
  Properties<RemoveSegmentEvidenceInput>
> {
  return z.object({
    id: z.string(),
    segmentId: z.string(),
  });
}

export function RemoveSegmentInputSchema(): z.ZodObject<
  Properties<RemoveSegmentInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function RemoveSegmentRoleInputSchema(): z.ZodObject<
  Properties<RemoveSegmentRoleInput>
> {
  return z.object({
    id: z.string(),
    segmentId: z.string(),
  });
}

export function RemoveSuggestionInputSchema(): z.ZodObject<
  Properties<RemoveSuggestionInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function ReorderOutcomePrioritiesInputSchema(): z.ZodObject<
  Properties<ReorderOutcomePrioritiesInput>
> {
  return z.object({
    ids: z.array(z.string()),
    insertBefore: z.string().nullish(),
    segmentId: z.string(),
  });
}

export function ReorderSegmentRolesInputSchema(): z.ZodObject<
  Properties<ReorderSegmentRolesInput>
> {
  return z.object({
    ids: z.array(z.string()),
    insertBefore: z.string().nullish(),
    segmentId: z.string(),
  });
}

export function ReorderSegmentsInputSchema(): z.ZodObject<
  Properties<ReorderSegmentsInput>
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
    id: z.string(),
    kind: z.string().nullish(),
    name: z.string().nullish(),
    objectId: z.string(),
  });
}

export function SegmentSchema(): z.ZodObject<Properties<Segment>> {
  return z.object({
    __typename: z.literal("Segment").optional(),
    description: z.string().nullish(),
    evidence: z.array(z.lazy(() => EvidenceSchema())),
    id: z.string(),
    name: z.string(),
    outcomePriorities: z.array(z.lazy(() => OutcomePrioritySchema())),
    roles: z.array(z.lazy(() => RoleRefSchema())),
  });
}

export function SetReadyForFeedbackInputSchema(): z.ZodObject<
  Properties<SetReadyForFeedbackInput>
> {
  return z.object({
    ready: z.boolean(),
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

export function UpdateOutcomePriorityInputSchema(): z.ZodObject<
  Properties<UpdateOutcomePriorityInput>
> {
  return z.object({
    id: z.string(),
    importance: z.number().nullish(),
    notes: z.string().nullish(),
    satisfaction: z.number().nullish(),
    segmentId: z.string(),
    source: EvidenceSourceSchema.nullish(),
  });
}

export function UpdateOutcomePrioritySnippetInputSchema(): z.ZodObject<
  Properties<UpdateOutcomePrioritySnippetInput>
> {
  return z.object({
    id: z.string(),
    scope: z.string().nullish(),
    segmentId: z.string(),
    statement: z.string().nullish(),
  });
}

export function UpdateSegmentEvidenceInputSchema(): z.ZodObject<
  Properties<UpdateSegmentEvidenceInput>
> {
  return z.object({
    content: z.string().nullish(),
    id: z.string(),
    recordedAt: z.iso.datetime().nullish(),
    segmentId: z.string(),
    source: EvidenceSourceSchema.nullish(),
  });
}

export function UpdateSegmentInputSchema(): z.ZodObject<
  Properties<UpdateSegmentInput>
> {
  return z.object({
    description: z.string().nullish(),
    id: z.string(),
    name: z.string().nullish(),
  });
}

export function UpdateSegmentRoleSnippetInputSchema(): z.ZodObject<
  Properties<UpdateSegmentRoleSnippetInput>
> {
  return z.object({
    id: z.string(),
    kind: z.string().nullish(),
    name: z.string().nullish(),
    segmentId: z.string(),
  });
}
