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

export type AddOutcomePriorityInput = {
  id: Scalars["OID"]["input"];
  importance: Scalars["Int"]["input"];
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
  notes?: InputMaybe<Scalars["String"]["input"]>;
  outcomeDocumentId: Scalars["PHID"]["input"];
  outcomeObjectId: Scalars["OID"]["input"];
  outcomeScope?: InputMaybe<Scalars["String"]["input"]>;
  outcomeStatement?: InputMaybe<Scalars["String"]["input"]>;
  satisfaction: Scalars["Int"]["input"];
  segmentId: Scalars["OID"]["input"];
  source: EvidenceSource;
};

export type AddSegmentEvidenceInput = {
  content: Scalars["String"]["input"];
  id: Scalars["OID"]["input"];
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
  recordedAt?: InputMaybe<Scalars["DateTime"]["input"]>;
  segmentId: Scalars["OID"]["input"];
  source: EvidenceSource;
};

export type AddSegmentInput = {
  description?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["OID"]["input"];
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
  name: Scalars["String"]["input"];
};

export type AddSegmentRoleInput = {
  documentId: Scalars["PHID"]["input"];
  id: Scalars["OID"]["input"];
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
  kind?: InputMaybe<Scalars["String"]["input"]>;
  name?: InputMaybe<Scalars["String"]["input"]>;
  objectId: Scalars["OID"]["input"];
  segmentId: Scalars["OID"]["input"];
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

export type AudienceSheetState = {
  agentFeedback: AgentFeedback;
  segments: Array<Segment>;
};

export type Evidence = {
  content: Scalars["String"]["output"];
  id: Scalars["OID"]["output"];
  recordedAt: Maybe<Scalars["DateTime"]["output"]>;
  source: EvidenceSource;
};

export type EvidenceSource = "AI_SIMULATION" | "BUILDER" | "USER_RESEARCH";

export type OutcomePriority = {
  id: Scalars["OID"]["output"];
  importance: Scalars["Int"]["output"];
  notes: Maybe<Scalars["String"]["output"]>;
  opportunity: Scalars["Float"]["output"];
  outcome: OutcomeRef;
  satisfaction: Scalars["Int"]["output"];
  source: EvidenceSource;
};

export type OutcomeRef = {
  documentId: Scalars["PHID"]["output"];
  objectId: Scalars["OID"]["output"];
  scope: Maybe<Scalars["String"]["output"]>;
  statement: Maybe<Scalars["String"]["output"]>;
};

export type RemoveOutcomePriorityInput = {
  id: Scalars["OID"]["input"];
  segmentId: Scalars["OID"]["input"];
};

export type RemoveSegmentEvidenceInput = {
  id: Scalars["OID"]["input"];
  segmentId: Scalars["OID"]["input"];
};

export type RemoveSegmentInput = {
  id: Scalars["OID"]["input"];
};

export type RemoveSegmentRoleInput = {
  id: Scalars["OID"]["input"];
  segmentId: Scalars["OID"]["input"];
};

export type RemoveSuggestionInput = {
  id: Scalars["OID"]["input"];
};

export type ReorderOutcomePrioritiesInput = {
  ids: Array<Scalars["OID"]["input"]>;
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
  segmentId: Scalars["OID"]["input"];
};

export type ReorderSegmentRolesInput = {
  ids: Array<Scalars["OID"]["input"]>;
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
  segmentId: Scalars["OID"]["input"];
};

export type ReorderSegmentsInput = {
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
  id: Scalars["OID"]["output"];
  kind: Maybe<Scalars["String"]["output"]>;
  name: Maybe<Scalars["String"]["output"]>;
  objectId: Scalars["OID"]["output"];
};

export type Segment = {
  description: Maybe<Scalars["String"]["output"]>;
  evidence: Array<Evidence>;
  id: Scalars["OID"]["output"];
  name: Scalars["String"]["output"];
  outcomePriorities: Array<OutcomePriority>;
  roles: Array<RoleRef>;
};

export type SetReadyForFeedbackInput = {
  ready: Scalars["Boolean"]["input"];
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

export type UpdateOutcomePriorityInput = {
  id: Scalars["OID"]["input"];
  importance?: InputMaybe<Scalars["Int"]["input"]>;
  notes?: InputMaybe<Scalars["String"]["input"]>;
  satisfaction?: InputMaybe<Scalars["Int"]["input"]>;
  segmentId: Scalars["OID"]["input"];
  source?: InputMaybe<EvidenceSource>;
};

export type UpdateOutcomePrioritySnippetInput = {
  id: Scalars["OID"]["input"];
  scope?: InputMaybe<Scalars["String"]["input"]>;
  segmentId: Scalars["OID"]["input"];
  statement?: InputMaybe<Scalars["String"]["input"]>;
};

export type UpdateSegmentEvidenceInput = {
  content?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["OID"]["input"];
  recordedAt?: InputMaybe<Scalars["DateTime"]["input"]>;
  segmentId: Scalars["OID"]["input"];
  source?: InputMaybe<EvidenceSource>;
};

export type UpdateSegmentInput = {
  description?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["OID"]["input"];
  name?: InputMaybe<Scalars["String"]["input"]>;
};

export type UpdateSegmentRoleSnippetInput = {
  id: Scalars["OID"]["input"];
  kind?: InputMaybe<Scalars["String"]["input"]>;
  name?: InputMaybe<Scalars["String"]["input"]>;
  segmentId: Scalars["OID"]["input"];
};
