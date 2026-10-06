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
  AttachmentRef: {
    input: `attachment://v${number}:${string}`;
    output: `attachment://v${number}:${string}`;
  };
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

export type AddEdgeInput = {
  condition?: InputMaybe<Scalars["String"]["input"]>;
  from: Scalars["OID"]["input"];
  id: Scalars["OID"]["input"];
  port: Scalars["String"]["input"];
  to: Scalars["OID"]["input"];
};

export type AddStepInput = {
  actionName: Scalars["String"]["input"];
  config: Scalars["Unknown"]["input"];
  connectionId?: InputMaybe<Scalars["PHID"]["input"]>;
  id: Scalars["OID"]["input"];
  idempotencyKeyExpression?: InputMaybe<Scalars["String"]["input"]>;
  key: Scalars["String"]["input"];
  name: Scalars["String"]["input"];
  pieceName: Scalars["String"]["input"];
  pieceVersion: Scalars["String"]["input"];
  position?: InputMaybe<AddStepPositionInput>;
  propertySettings?: InputMaybe<Array<AddStepPropertySettingInput>>;
  reactorConnectionId?: InputMaybe<Scalars["PHID"]["input"]>;
  retry?: InputMaybe<AddStepRetryPolicyInput>;
  skip?: InputMaybe<Scalars["Boolean"]["input"]>;
  timeoutSeconds?: InputMaybe<Scalars["Int"]["input"]>;
};

export type AddStepPositionInput = {
  x: Scalars["Float"]["input"];
  y: Scalars["Float"]["input"];
};

export type AddStepPropertySettingInput = {
  mode: PropertyMode;
  prop: Scalars["String"]["input"];
  schema?: InputMaybe<Scalars["Unknown"]["input"]>;
};

export type AddStepRetryPolicyInput = {
  backoff: BackoffKind;
  initialDelaySeconds: Scalars["Int"]["input"];
  maxAttempts: Scalars["Int"]["input"];
  maxDelaySeconds: Scalars["Int"]["input"];
  retryOn: Array<Scalars["String"]["input"]>;
};

export type BackoffKind = "EXPONENTIAL" | "FIXED";

export type ClearTriggerInput = {
  _?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type ConcurrencyMode = "PARALLEL" | "QUEUE" | "SINGLETON";

export type FailureMode = "IGNORE" | "NOTIFY" | "PARK";

/** Layout only. The runtime ignores it. */
export type Point = {
  x: Scalars["Float"]["output"];
  y: Scalars["Float"]["output"];
};

export type PropertyMode =
  /** The author switched the field to a free {{…}} expression. */
  | "EXPRESSION"
  /** The field's own control. */
  | "MANUAL";

export type PropertySetting = {
  mode: PropertyMode;
  prop: Scalars["String"]["output"];
  /** Resolved DynamicProperties children, options stripped. */
  schema: Maybe<Scalars["Unknown"]["output"]>;
};

export type PublishWorkflowInput = {
  publishedAt: Scalars["DateTime"]["input"];
};

/** Snapshot of the draft taken by PUBLISH_WORKFLOW. */
export type PublishedWorkflow = {
  edges: Array<WorkflowEdge>;
  policy: WorkflowPolicy;
  publishedAt: Scalars["DateTime"]["output"];
  steps: Array<WorkflowStep>;
  trigger: Maybe<TriggerBinding>;
  variables: Array<WorkflowVariable>;
  /** Draft version the snapshot was taken at. */
  version: Scalars["Int"]["output"];
};

export type RemoveEdgeInput = {
  id: Scalars["OID"]["input"];
};

export type RemoveStepInput = {
  id: Scalars["OID"]["input"];
};

export type RemoveVariableInput = {
  id: Scalars["OID"]["input"];
};

export type RetryPolicy = {
  backoff: BackoffKind;
  initialDelaySeconds: Scalars["Int"]["output"];
  /** Attempts, not retries: 1 is no retry. Clamped to 10 by the runtime, since each attempt re-runs a side effect and holds the run's worker slot. */
  maxAttempts: Scalars["Int"]["output"];
  maxDelaySeconds: Scalars["Int"]["output"];
  /** Error classes that are retryable, matched against the error's class name or anywhere in its message, case-insensitively. EMPTY admits every error: an empty list with maxAttempts > 1 means retry, not never-retry. */
  retryOn: Array<Scalars["String"]["output"]>;
};

export type RevertToPublishedInput = {
  _?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type RunStatus =
  | "CANCELLED"
  | "FAILED"
  | "PARKED"
  | "PENDING"
  | "RUNNING"
  | "SUCCEEDED"
  | "WAITING";

export type SetLastRunInput = {
  lastRunAt: Scalars["DateTime"]["input"];
  lastRunStatus: RunStatus;
};

export type SetLastTestInput = {
  /** Step id or trigger id. */
  id: Scalars["OID"]["input"];
  runId: Scalars["String"]["input"];
  testedAt: Scalars["DateTime"]["input"];
};

export type SetPolicyInput = {
  concurrency?: InputMaybe<ConcurrencyMode>;
  defaultRetry?: InputMaybe<SetPolicyRetryPolicyInput>;
  journalAsDocument?: InputMaybe<Scalars["Boolean"]["input"]>;
  maxParallelRuns?: InputMaybe<Scalars["Int"]["input"]>;
  maxSuspensionDays?: InputMaybe<Scalars["Int"]["input"]>;
  onFailure?: InputMaybe<FailureMode>;
  retainRunsDays?: InputMaybe<Scalars["Int"]["input"]>;
  runTimeoutSeconds?: InputMaybe<Scalars["Int"]["input"]>;
};

export type SetPolicyRetryPolicyInput = {
  backoff: BackoffKind;
  initialDelaySeconds: Scalars["Int"]["input"];
  maxAttempts: Scalars["Int"]["input"];
  maxDelaySeconds: Scalars["Int"]["input"];
  retryOn: Array<Scalars["String"]["input"]>;
};

export type SetStepConfigInput = {
  config: Scalars["Unknown"]["input"];
  id: Scalars["OID"]["input"];
  propertySettings?: InputMaybe<Array<SetStepConfigPropertySettingInput>>;
};

export type SetStepConfigPropertySettingInput = {
  mode: PropertyMode;
  prop: Scalars["String"]["input"];
  schema?: InputMaybe<Scalars["Unknown"]["input"]>;
};

export type SetTriggerInput = {
  config: Scalars["Unknown"]["input"];
  connectionId?: InputMaybe<Scalars["PHID"]["input"]>;
  id: Scalars["OID"]["input"];
  pieceName: Scalars["String"]["input"];
  pieceVersion: Scalars["String"]["input"];
  propertySettings?: InputMaybe<Array<SetTriggerPropertySettingInput>>;
  reactorConnectionId?: InputMaybe<Scalars["PHID"]["input"]>;
  triggerName: Scalars["String"]["input"];
};

export type SetTriggerPropertySettingInput = {
  mode: PropertyMode;
  prop: Scalars["String"]["input"];
  schema?: InputMaybe<Scalars["Unknown"]["input"]>;
};

export type SetVariableInput = {
  description?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["OID"]["input"];
  key: Scalars["String"]["input"];
  /** Undefined leaves an existing variable's type unchanged; null clears it. */
  type?: InputMaybe<VariableType>;
  value?: InputMaybe<Scalars["Unknown"]["input"]>;
};

export type SetWorkflowDescriptionInput = {
  description?: InputMaybe<Scalars["String"]["input"]>;
};

export type SetWorkflowNameInput = {
  name: Scalars["String"]["input"];
};

export type SetWorkflowStatusInput = {
  status: WorkflowStatus;
};

/** Reference to the latest test run in the run store. */
export type StepTestRecord = {
  runId: Scalars["String"]["output"];
  testedAt: Scalars["DateTime"]["output"];
};

export type TriggerBinding = {
  /** Validated against the trigger's configSchema. */
  config: Scalars["Unknown"]["output"];
  /** Connection document id, when the trigger's connector requires one. */
  connectionId: Maybe<Scalars["PHID"]["output"]>;
  id: Scalars["OID"]["output"];
  lastTest: Maybe<StepTestRecord>;
  /** Package name of the trigger's piece, e.g. '@powerhousedao/piece-core' or '@acme/piece-imap'. */
  pieceName: Scalars["String"]["output"];
  /** Exact semver of the piece, e.g. '1.2.0'. */
  pieceVersion: Scalars["String"]["output"];
  propertySettings: Maybe<Array<PropertySetting>>;
  /** Reactor connection document id, when the trigger declares requireReactor. */
  reactorConnectionId: Maybe<Scalars["PHID"]["output"]>;
  /** Trigger name within the piece, e.g. 'schedule' or 'new_message'. */
  triggerName: Scalars["String"]["output"];
  /** Timestamp of the last real edit; a lastTest before it is stale. */
  updatedAt: Maybe<Scalars["DateTime"]["output"]>;
};

export type UpdateStepInput = {
  actionName?: InputMaybe<Scalars["String"]["input"]>;
  config?: InputMaybe<Scalars["Unknown"]["input"]>;
  connectionId?: InputMaybe<Scalars["PHID"]["input"]>;
  id: Scalars["OID"]["input"];
  idempotencyKeyExpression?: InputMaybe<Scalars["String"]["input"]>;
  key?: InputMaybe<Scalars["String"]["input"]>;
  name?: InputMaybe<Scalars["String"]["input"]>;
  pieceName?: InputMaybe<Scalars["String"]["input"]>;
  pieceVersion?: InputMaybe<Scalars["String"]["input"]>;
  position?: InputMaybe<UpdateStepPositionInput>;
  reactorConnectionId?: InputMaybe<Scalars["PHID"]["input"]>;
  retry?: InputMaybe<UpdateStepRetryPolicyInput>;
  skip?: InputMaybe<Scalars["Boolean"]["input"]>;
  timeoutSeconds?: InputMaybe<Scalars["Int"]["input"]>;
};

export type UpdateStepPositionInput = {
  x: Scalars["Float"]["input"];
  y: Scalars["Float"]["input"];
};

export type UpdateStepRetryPolicyInput = {
  backoff: BackoffKind;
  initialDelaySeconds: Scalars["Int"]["input"];
  maxAttempts: Scalars["Int"]["input"];
  maxDelaySeconds: Scalars["Int"]["input"];
  retryOn: Array<Scalars["String"]["input"]>;
};

export type VariableType =
  | "BOOLEAN"
  | "JSON"
  | "NUMBER"
  /** value is a secret-provider handle (the format of a connection SecretRef.ref), never the plaintext. */
  | "SECRET"
  | "TEXT";

export type WorkflowEdge = {
  /** Optional guard expression; the edge is taken only when it evaluates truthy. */
  condition: Maybe<Scalars["String"]["output"]>;
  /** Source step id, or the trigger id for the entry edge. */
  from: Scalars["OID"]["output"];
  id: Scalars["OID"]["output"];
  /** Output port of the source, one it declares: 'next' and 'error' for a piece action, 'next' for the trigger, 'true', 'false' and 'error' for a branch. */
  port: Scalars["String"]["output"];
  to: Scalars["OID"]["output"];
};

export type WorkflowPolicy = {
  /** ENFORCED. SINGLETON drops a firing while a run is active (journaled CANCELLED, not dropped silently); QUEUE serialises; PARALLEL runs concurrently. */
  concurrency: ConcurrencyMode;
  /** ENFORCED. The fallback for a step with no retry of its own. */
  defaultRetry: RetryPolicy;
  /** NOT YET ENFORCED. The run journal is relational; there is no run document model to write. */
  journalAsDocument: Scalars["Boolean"]["output"];
  /** ENFORCED under PARALLEL: how many runs of this workflow may execute at once; null is unbounded. SINGLETON and QUEUE are 1 by definition. */
  maxParallelRuns: Maybe<Scalars["Int"]["output"]>;
  /** NOT YET ENFORCED. Bounds how long a run may stay suspended on a waitpoint - but nothing suspends: waitpoints, run.pause and generateResumeUrl all throw, so there is no suspended state to bound. */
  maxSuspensionDays: Scalars["Int"]["output"];
  /** ENFORCED. What happens to a run whose steps have all failed terminally: PARK takes the trigger out of the supervisor's ENABLED set until the workflow is re-published or re-enabled, NOTIFY logs at error level (the only notification channel this engine has), IGNORE does nothing. */
  onFailure: FailureMode;
  /** NOT YET ENFORCED per workflow. Retention is a journal-wide sweep on the relational handle, which has no reactor read to resolve a per-workflow window with; PH_WORKFLOWS_RUN_RETENTION_DAYS (30 days by default) is the control that applies. */
  retainRunsDays: Scalars["Int"]["output"];
  /** ENFORCED. Checked between steps and while a retry waits; past it the run ends CANCELLED. */
  runTimeoutSeconds: Scalars["Int"]["output"];
};

export type WorkflowState = {
  description: Maybe<Scalars["String"]["output"]>;
  edges: Array<WorkflowEdge>;
  /** Denormalised for inspectors; written by the runtime. */
  lastRunAt: Maybe<Scalars["DateTime"]["output"]>;
  lastRunStatus: Maybe<RunStatus>;
  name: Scalars["String"]["output"];
  policy: WorkflowPolicy;
  /** Last published snapshot; version !== published.version means unpublished changes. */
  published: Maybe<PublishedWorkflow>;
  /** Only ENABLED workflows get trigger instances. */
  status: WorkflowStatus;
  steps: Array<WorkflowStep>;
  trigger: Maybe<TriggerBinding>;
  variables: Array<WorkflowVariable>;
  /** Bumped on every draft edit; REVERT_TO_PUBLISHED resets it to published.version. A run records the version it executed. */
  version: Scalars["Int"]["output"];
};

export type WorkflowStatus = "ARCHIVED" | "DISABLED" | "DRAFT" | "ENABLED";

export type WorkflowStep = {
  /** Action name within the piece, e.g. 'branch' or 'send_request'. */
  actionName: Scalars["String"]["output"];
  config: Scalars["Unknown"]["output"];
  connectionId: Maybe<Scalars["PHID"]["output"]>;
  id: Scalars["OID"]["output"];
  /** NOT YET ENFORCED. Expression yielding a stable key; two executions with the same key are one side effect. A fire is deduplicated on its trigger operation or a trigger item's _dedupe_key, never on a step expression. */
  idempotencyKeyExpression: Maybe<Scalars["String"]["output"]>;
  /** Author-visible label; unique within the workflow; used in expressions. */
  key: Scalars["String"]["output"];
  lastTest: Maybe<StepTestRecord>;
  name: Scalars["String"]["output"];
  /** Package name of the step's piece, e.g. '@powerhousedao/piece-core' or '@activepieces/piece-http'. */
  pieceName: Scalars["String"]["output"];
  /** Exact semver of the piece, e.g. '0.11.19'. */
  pieceVersion: Scalars["String"]["output"];
  position: Maybe<Point>;
  propertySettings: Maybe<Array<PropertySetting>>;
  /** Reactor connection document id, when the action declares requireReactor. */
  reactorConnectionId: Maybe<Scalars["PHID"]["output"]>;
  /** ENFORCED. Per-step override of the workflow default retry policy. */
  retry: Maybe<RetryPolicy>;
  /** Skipped steps are passed over at run time. */
  skip: Maybe<Scalars["Boolean"]["output"]>;
  /** ENFORCED. Also raises the cap on each host call the step's piece makes, which is never shorter than the step's own timeout. */
  timeoutSeconds: Maybe<Scalars["Int"]["output"]>;
  /** Timestamp of the last real edit; a lastTest before it is stale. */
  updatedAt: Maybe<Scalars["DateTime"]["output"]>;
};

export type WorkflowVariable = {
  description: Maybe<Scalars["String"]["output"]>;
  id: Scalars["OID"]["output"];
  /** Name used in expressions. */
  key: Scalars["String"]["output"];
  /** Null means untyped; consumers infer the kind of value it holds. */
  type: Maybe<VariableType>;
  /** The value a run reads as variables.<key>. */
  value: Maybe<Scalars["Unknown"]["output"]>;
};
