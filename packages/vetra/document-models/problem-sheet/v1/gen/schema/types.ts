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

export type AddConstraintInput = {
  description: Scalars["String"]["input"];
  id: Scalars["OID"]["input"];
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
  notes?: InputMaybe<Scalars["String"]["input"]>;
  severity: Severity;
};

export type AddJobStepInput = {
  category: JobMapStep;
  description?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["OID"]["input"];
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
  name: Scalars["String"]["input"];
};

export type AddOutcomeInput = {
  clarifier?: InputMaybe<Scalars["String"]["input"]>;
  direction: OutcomeDirection;
  id: Scalars["OID"]["input"];
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
  metric?: InputMaybe<Scalars["String"]["input"]>;
  notes?: InputMaybe<Scalars["String"]["input"]>;
  object: Scalars["String"]["input"];
  relatedStep?: InputMaybe<Scalars["OID"]["input"]>;
  role?: InputMaybe<Scalars["OID"]["input"]>;
  scope: OutcomeScope;
};

export type AddRoleInput = {
  context?: InputMaybe<Scalars["String"]["input"]>;
  description?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["OID"]["input"];
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
  kind: RoleKind;
  name: Scalars["String"]["input"];
};

export type AddSpecializedJobStepInput = {
  category: JobMapStep;
  description?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["OID"]["input"];
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
  name: Scalars["String"]["input"];
  roleId: Scalars["OID"]["input"];
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

export type ClearContextInput = {
  _?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type ClearCoreJobInput = {
  _?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type ClearOutcomeMetricInput = {
  id: Scalars["OID"]["input"];
};

export type ClearOutcomeRoleInput = {
  id: Scalars["OID"]["input"];
};

export type ClearOutcomeStepInput = {
  id: Scalars["OID"]["input"];
};

export type ClearRoleSpecializedJobInput = {
  roleId: Scalars["OID"]["input"];
};

export type Constraint = {
  description: Scalars["String"]["output"];
  id: Scalars["OID"]["output"];
  notes: Maybe<Scalars["String"]["output"]>;
  severity: Severity;
};

export type JobMapStep =
  | "CONCLUDE"
  | "CONFIRM"
  | "DEFINE"
  | "EXECUTE"
  | "LOCATE"
  | "MODIFY"
  | "MONITOR"
  | "PREPARE";

export type JobStatement = {
  clarifier: Maybe<Scalars["String"]["output"]>;
  motivation: Motivation;
  object: Scalars["String"]["output"];
  verb: Scalars["String"]["output"];
};

export type JobStep = {
  category: JobMapStep;
  description: Maybe<Scalars["String"]["output"]>;
  id: Scalars["OID"]["output"];
  name: Scalars["String"]["output"];
};

export type Motivation =
  | "CANNOT"
  | "HATE_TO"
  | "HAVE_TO"
  | "LOVE_TO"
  | "NEED_TO"
  | "WANT_TO";

export type Outcome = {
  clarifier: Maybe<Scalars["String"]["output"]>;
  direction: OutcomeDirection;
  id: Scalars["OID"]["output"];
  metric: Maybe<Scalars["String"]["output"]>;
  notes: Maybe<Scalars["String"]["output"]>;
  object: Scalars["String"]["output"];
  relatedStep: Maybe<Scalars["OID"]["output"]>;
  role: Maybe<Scalars["OID"]["output"]>;
  scope: OutcomeScope;
};

export type OutcomeDirection = "AVOID" | "DECREASE" | "INCREASE" | "SATISFY";

export type OutcomeScope = "CORE" | "OPERATIONAL" | "SPECIALIZED";

export type ProblemSheetState = {
  agentFeedback: AgentFeedback;
  constraints: Array<Constraint>;
  context: Maybe<Scalars["String"]["output"]>;
  coreJob: Maybe<JobStatement>;
  coreJobSteps: Array<JobStep>;
  outcomes: Array<Outcome>;
  roles: Array<Role>;
};

export type RemoveConstraintInput = {
  id: Scalars["OID"]["input"];
};

export type RemoveJobStepInput = {
  id: Scalars["OID"]["input"];
};

export type RemoveOutcomeInput = {
  id: Scalars["OID"]["input"];
};

export type RemoveRoleInput = {
  id: Scalars["OID"]["input"];
};

export type RemoveSpecializedJobStepInput = {
  id: Scalars["OID"]["input"];
  roleId: Scalars["OID"]["input"];
};

export type RemoveSuggestionInput = {
  id: Scalars["OID"]["input"];
};

export type ReorderConstraintsInput = {
  ids: Array<Scalars["OID"]["input"]>;
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
};

export type ReorderJobStepsInput = {
  ids: Array<Scalars["OID"]["input"]>;
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
};

export type ReorderOutcomesInput = {
  ids: Array<Scalars["OID"]["input"]>;
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
};

export type ReorderRolesInput = {
  ids: Array<Scalars["OID"]["input"]>;
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
};

export type ReorderSpecializedJobStepsInput = {
  ids: Array<Scalars["OID"]["input"]>;
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
  roleId: Scalars["OID"]["input"];
};

export type ResolveSuggestionInput = {
  changeApplied: Scalars["Boolean"]["input"];
  comment?: InputMaybe<Scalars["String"]["input"]>;
  decision: SuggestionDecision;
  id: Scalars["OID"]["input"];
  resolvedAt: Scalars["DateTime"]["input"];
};

export type Role = {
  context: Maybe<Scalars["String"]["output"]>;
  description: Maybe<Scalars["String"]["output"]>;
  id: Scalars["OID"]["output"];
  kind: RoleKind;
  name: Scalars["String"]["output"];
  specializedJob: Maybe<SpecializedJob>;
};

export type RoleKind = "PRIMARY" | "SUPPORT";

export type SetContextInput = {
  context: Scalars["String"]["input"];
};

export type SetCoreJobInput = {
  clarifier?: InputMaybe<Scalars["String"]["input"]>;
  motivation: Motivation;
  object: Scalars["String"]["input"];
  verb: Scalars["String"]["input"];
};

export type SetReadyForFeedbackInput = {
  ready: Scalars["Boolean"]["input"];
};

export type SetRoleSpecializedJobInput = {
  clarifier?: InputMaybe<Scalars["String"]["input"]>;
  motivation: Motivation;
  object: Scalars["String"]["input"];
  roleId: Scalars["OID"]["input"];
  verb: Scalars["String"]["input"];
};

export type Severity = "HIGH" | "LOW" | "MEDIUM";

export type SpecializedJob = {
  clarifier: Maybe<Scalars["String"]["output"]>;
  motivation: Motivation;
  object: Scalars["String"]["output"];
  steps: Array<JobStep>;
  verb: Scalars["String"]["output"];
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

export type UpdateConstraintInput = {
  description?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["OID"]["input"];
  notes?: InputMaybe<Scalars["String"]["input"]>;
  severity?: InputMaybe<Severity>;
};

export type UpdateCoreJobInput = {
  clarifier?: InputMaybe<Scalars["String"]["input"]>;
  motivation?: InputMaybe<Motivation>;
  object?: InputMaybe<Scalars["String"]["input"]>;
  verb?: InputMaybe<Scalars["String"]["input"]>;
};

export type UpdateJobStepInput = {
  category?: InputMaybe<JobMapStep>;
  description?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["OID"]["input"];
  name?: InputMaybe<Scalars["String"]["input"]>;
};

export type UpdateOutcomeInput = {
  clarifier?: InputMaybe<Scalars["String"]["input"]>;
  direction?: InputMaybe<OutcomeDirection>;
  id: Scalars["OID"]["input"];
  metric?: InputMaybe<Scalars["String"]["input"]>;
  notes?: InputMaybe<Scalars["String"]["input"]>;
  object?: InputMaybe<Scalars["String"]["input"]>;
  relatedStep?: InputMaybe<Scalars["OID"]["input"]>;
  role?: InputMaybe<Scalars["OID"]["input"]>;
  scope?: InputMaybe<OutcomeScope>;
};

export type UpdateRoleInput = {
  context?: InputMaybe<Scalars["String"]["input"]>;
  description?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["OID"]["input"];
  kind?: InputMaybe<RoleKind>;
  name?: InputMaybe<Scalars["String"]["input"]>;
};

export type UpdateRoleSpecializedJobInput = {
  clarifier?: InputMaybe<Scalars["String"]["input"]>;
  motivation?: InputMaybe<Motivation>;
  object?: InputMaybe<Scalars["String"]["input"]>;
  roleId: Scalars["OID"]["input"];
  verb?: InputMaybe<Scalars["String"]["input"]>;
};

export type UpdateSpecializedJobStepInput = {
  category?: InputMaybe<JobMapStep>;
  description?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["OID"]["input"];
  name?: InputMaybe<Scalars["String"]["input"]>;
  roleId: Scalars["OID"]["input"];
};
