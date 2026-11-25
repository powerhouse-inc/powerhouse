export type Maybe<T> = T | null | undefined;
export type InputMaybe<T> = T | null | undefined;
export type Exact<T extends { [key: string]: unknown }> = {
  [K in keyof T]: T[K];
};
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]?: Maybe<T[SubKey]>;
};
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]: Maybe<T[SubKey]>;
};
export type MakeEmpty<
  T extends { [key: string]: unknown },
  K extends keyof T,
> = { [_ in K]?: never };
export type Incremental<T> =
  | T
  | {
      [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never;
    };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
  Address: { input: `${string}:0x${string}`; output: `${string}:0x${string}` };
  Amount: {
    input: { unit?: string; value?: number };
    output: { unit?: string; value?: number };
  };
  Amount_Crypto: {
    input: { unit: string; value: string };
    output: { unit: string; value: string };
  };
  Amount_Currency: {
    input: { unit: string; value: string };
    output: { unit: string; value: string };
  };
  Amount_Fiat: {
    input: { unit: string; value: number };
    output: { unit: string; value: number };
  };
  Amount_Money: { input: number; output: number };
  Amount_Percentage: { input: number; output: number };
  Amount_Tokens: { input: number; output: number };
  Attachment: { input: string; output: string };
  Currency: { input: string; output: string };
  Date: { input: string; output: string };
  DateTime: { input: string; output: string };
  EmailAddress: { input: string; output: string };
  EthereumAddress: { input: string; output: string };
  OID: { input: string; output: string };
  OLabel: { input: string; output: string };
  PHID: { input: string; output: string };
  URL: { input: string; output: string };
  Unknown: { input: unknown; output: unknown };
  Upload: { input: File; output: File };
};

export type AddEvidenceInput = {
  content: Scalars["String"]["input"];
  id: Scalars["OID"]["input"];
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
  recordedAt?: InputMaybe<Scalars["DateTime"]["input"]>;
  source: EvidenceSource;
};

export type AddOutcomeTargetInput = {
  expectedImportanceChange?: InputMaybe<Scalars["Int"]["input"]>;
  expectedSatisfactionChange?: InputMaybe<Scalars["Int"]["input"]>;
  id: Scalars["OID"]["input"];
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
  notes?: InputMaybe<Scalars["String"]["input"]>;
  outcomeDocumentId: Scalars["PHID"]["input"];
  outcomeObjectId: Scalars["OID"]["input"];
  outcomeScope?: InputMaybe<Scalars["String"]["input"]>;
  outcomeStatement?: InputMaybe<Scalars["String"]["input"]>;
};

export type AddSegmentRefInput = {
  description?: InputMaybe<Scalars["String"]["input"]>;
  documentId: Scalars["PHID"]["input"];
  id: Scalars["OID"]["input"];
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
  name?: InputMaybe<Scalars["String"]["input"]>;
  objectId: Scalars["OID"]["input"];
};

export type AddSuggestionInput = {
  agent: Scalars["String"]["input"];
  content: Scalars["String"]["input"];
  createdAt: Scalars["DateTime"]["input"];
  id: Scalars["OID"]["input"];
};

export type AgentFeedback = {
  readyForFeedback: Scalars["Boolean"]["output"];
  suggestions: Array<Suggestion>;
};

export type ArchiveFeatureInput = {
  reason?: InputMaybe<Scalars["String"]["input"]>;
};

export type ClearEstimatesInput = {
  _?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type ClearExpectedEffectInput = {
  _?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type ClearFeatureNameInput = {
  _?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type ClearNotesInput = {
  _?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type ClearParentFeatureInput = {
  _?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type ClearPremiseInput = {
  _?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type ClearPromotionInput = {
  _?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type ClearReasoningInput = {
  _?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type ClearRelatedStepInput = {
  _?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type ClearRoleInput = {
  _?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type ClearSummaryInput = {
  _?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type ClearTargetReleaseInput = {
  _?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type ClearWbsInput = {
  _?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type CommitFeatureInput = {
  _?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type Confidence = "HIGH" | "LOW" | "MEDIUM";

export type Effort = "LARGE" | "MEDIUM" | "SMALL";

export type Evidence = {
  content: Scalars["String"]["output"];
  id: Scalars["OID"]["output"];
  recordedAt: Maybe<Scalars["DateTime"]["output"]>;
  source: EvidenceSource;
};

export type EvidenceSource = "AI_SIMULATION" | "BUILDER" | "USER_RESEARCH";

export type FeatureRef = {
  documentId: Scalars["PHID"]["output"];
  name: Maybe<Scalars["String"]["output"]>;
  status: Maybe<Scalars["String"]["output"]>;
};

export type FeatureScope =
  | "INCREMENTAL"
  | "MAINTENANCE"
  | "MARKET_MVP"
  | "MICRO_MVP";

export type FeatureState = {
  agentFeedback: AgentFeedback;
  confidence: Maybe<Confidence>;
  effort: Maybe<Effort>;
  evidence: Array<Evidence>;
  expectedEffect: Maybe<Scalars["String"]["output"]>;
  impact: Maybe<Impact>;
  name: Maybe<Scalars["String"]["output"]>;
  notes: Maybe<Scalars["String"]["output"]>;
  parentFeature: Maybe<FeatureRef>;
  premise: Maybe<Scalars["String"]["output"]>;
  promotion: Maybe<PromotionEvent>;
  reasoning: Maybe<Scalars["String"]["output"]>;
  relatedStep: Maybe<JobStepRef>;
  role: Maybe<RoleRef>;
  scope: FeatureScope;
  segments: Array<SegmentRef>;
  status: FeatureStatus;
  summary: Maybe<Scalars["String"]["output"]>;
  targetRelease: Maybe<Scalars["String"]["output"]>;
  targets: Array<OutcomeTarget>;
  wbs: Maybe<WbsRef>;
};

export type FeatureStatus =
  | "ARCHIVED"
  | "COMMITTED"
  | "EVALUATING"
  | "IN_SPEC"
  | "PARKED"
  | "PROPOSED";

export type Impact = "HIGH" | "LOW" | "MEDIUM";

export type JobStepRef = {
  category: Maybe<Scalars["String"]["output"]>;
  documentId: Scalars["PHID"]["output"];
  name: Maybe<Scalars["String"]["output"]>;
  objectId: Scalars["OID"]["output"];
};

export type OutcomeRef = {
  documentId: Scalars["PHID"]["output"];
  objectId: Scalars["OID"]["output"];
  scope: Maybe<Scalars["String"]["output"]>;
  statement: Maybe<Scalars["String"]["output"]>;
};

export type OutcomeTarget = {
  expectedImportanceChange: Maybe<Scalars["Int"]["output"]>;
  expectedSatisfactionChange: Maybe<Scalars["Int"]["output"]>;
  id: Scalars["OID"]["output"];
  notes: Maybe<Scalars["String"]["output"]>;
  outcome: OutcomeRef;
};

export type ParkFeatureInput = {
  reason?: InputMaybe<Scalars["String"]["input"]>;
};

export type PromoteToSpecInput = {
  promotedAt: Scalars["DateTime"]["input"];
  promotedBy?: InputMaybe<Scalars["String"]["input"]>;
  rationale?: InputMaybe<Scalars["String"]["input"]>;
};

export type PromotionEvent = {
  promotedAt: Scalars["DateTime"]["output"];
  promotedBy: Maybe<Scalars["String"]["output"]>;
  rationale: Maybe<Scalars["String"]["output"]>;
};

export type RemoveEvidenceInput = {
  id: Scalars["OID"]["input"];
};

export type RemoveOutcomeTargetInput = {
  id: Scalars["OID"]["input"];
};

export type RemoveSegmentRefInput = {
  id: Scalars["OID"]["input"];
};

export type RemoveSuggestionInput = {
  id: Scalars["OID"]["input"];
};

export type ReopenFeatureInput = {
  _?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type ReorderOutcomeTargetsInput = {
  ids: Array<Scalars["OID"]["input"]>;
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
};

export type ReorderSegmentRefsInput = {
  ids: Array<Scalars["OID"]["input"]>;
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
};

export type ResolveSuggestionInput = {
  changeApplied: Scalars["Boolean"]["input"];
  comment?: InputMaybe<Scalars["String"]["input"]>;
  decision: SuggestionDecision;
  id: Scalars["OID"]["input"];
  resolvedAt: Scalars["DateTime"]["input"];
};

export type RoleRef = {
  documentId: Scalars["PHID"]["output"];
  kind: Maybe<Scalars["String"]["output"]>;
  name: Maybe<Scalars["String"]["output"]>;
  objectId: Scalars["OID"]["output"];
};

export type SegmentRef = {
  description: Maybe<Scalars["String"]["output"]>;
  documentId: Scalars["PHID"]["output"];
  id: Scalars["OID"]["output"];
  name: Maybe<Scalars["String"]["output"]>;
  objectId: Scalars["OID"]["output"];
};

export type SetConfidenceInput = {
  confidence: Confidence;
};

export type SetEffortInput = {
  effort: Effort;
};

export type SetExpectedEffectInput = {
  expectedEffect: Scalars["String"]["input"];
};

export type SetFeatureNameInput = {
  name: Scalars["String"]["input"];
};

export type SetImpactInput = {
  impact: Impact;
};

export type SetNotesInput = {
  notes: Scalars["String"]["input"];
};

export type SetParentFeatureInput = {
  documentId: Scalars["PHID"]["input"];
  name?: InputMaybe<Scalars["String"]["input"]>;
  status?: InputMaybe<Scalars["String"]["input"]>;
};

export type SetPremiseInput = {
  premise: Scalars["String"]["input"];
};

export type SetReadyForFeedbackInput = {
  ready: Scalars["Boolean"]["input"];
};

export type SetReasoningInput = {
  reasoning: Scalars["String"]["input"];
};

export type SetRelatedStepInput = {
  category?: InputMaybe<Scalars["String"]["input"]>;
  documentId: Scalars["PHID"]["input"];
  name?: InputMaybe<Scalars["String"]["input"]>;
  objectId: Scalars["OID"]["input"];
};

export type SetRoleInput = {
  documentId: Scalars["PHID"]["input"];
  kind?: InputMaybe<Scalars["String"]["input"]>;
  name?: InputMaybe<Scalars["String"]["input"]>;
  objectId: Scalars["OID"]["input"];
};

export type SetScopeInput = {
  scope: FeatureScope;
};

export type SetSummaryInput = {
  summary: Scalars["String"]["input"];
};

export type SetTargetReleaseInput = {
  targetRelease: Scalars["String"]["input"];
};

export type SetWbsInput = {
  documentId: Scalars["PHID"]["input"];
  name?: InputMaybe<Scalars["String"]["input"]>;
  status?: InputMaybe<Scalars["String"]["input"]>;
};

export type StartEvaluationInput = {
  _?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type Suggestion = {
  agent: Scalars["String"]["output"];
  content: Scalars["String"]["output"];
  createdAt: Scalars["DateTime"]["output"];
  id: Scalars["OID"]["output"];
  resolution: Maybe<SuggestionResolution>;
};

export type SuggestionDecision = "ACCEPTED" | "DISMISSED";

export type SuggestionResolution = {
  changeApplied: Scalars["Boolean"]["output"];
  comment: Maybe<Scalars["String"]["output"]>;
  decision: SuggestionDecision;
  resolvedAt: Scalars["DateTime"]["output"];
};

export type UpdateEvidenceInput = {
  content?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["OID"]["input"];
  recordedAt?: InputMaybe<Scalars["DateTime"]["input"]>;
  source?: InputMaybe<EvidenceSource>;
};

export type UpdateOutcomeTargetInput = {
  expectedImportanceChange?: InputMaybe<Scalars["Int"]["input"]>;
  expectedSatisfactionChange?: InputMaybe<Scalars["Int"]["input"]>;
  id: Scalars["OID"]["input"];
  notes?: InputMaybe<Scalars["String"]["input"]>;
};

export type UpdateOutcomeTargetSnippetInput = {
  id: Scalars["OID"]["input"];
  scope?: InputMaybe<Scalars["String"]["input"]>;
  statement?: InputMaybe<Scalars["String"]["input"]>;
};

export type UpdateParentFeatureSnippetInput = {
  name?: InputMaybe<Scalars["String"]["input"]>;
  status?: InputMaybe<Scalars["String"]["input"]>;
};

export type UpdateRelatedStepSnippetInput = {
  category?: InputMaybe<Scalars["String"]["input"]>;
  name?: InputMaybe<Scalars["String"]["input"]>;
};

export type UpdateRoleSnippetInput = {
  kind?: InputMaybe<Scalars["String"]["input"]>;
  name?: InputMaybe<Scalars["String"]["input"]>;
};

export type UpdateSegmentRefSnippetInput = {
  description?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["OID"]["input"];
  name?: InputMaybe<Scalars["String"]["input"]>;
};

export type UpdateWbsSnippetInput = {
  name?: InputMaybe<Scalars["String"]["input"]>;
  status?: InputMaybe<Scalars["String"]["input"]>;
};

export type WbsRef = {
  documentId: Scalars["PHID"]["output"];
  name: Maybe<Scalars["String"]["output"]>;
  status: Maybe<Scalars["String"]["output"]>;
};
