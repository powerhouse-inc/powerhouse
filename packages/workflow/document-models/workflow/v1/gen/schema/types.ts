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
  blockType: Scalars["String"]["input"];
  config: Scalars["Unknown"]["input"];
  connectionId?: InputMaybe<Scalars["PHID"]["input"]>;
  id: Scalars["OID"]["input"];
  idempotencyKeyExpression?: InputMaybe<Scalars["String"]["input"]>;
  key: Scalars["String"]["input"];
  name: Scalars["String"]["input"];
  position?: InputMaybe<AddStepPositionInput>;
  retry?: InputMaybe<AddStepRetryPolicyInput>;
  timeoutSeconds?: InputMaybe<Scalars["Int"]["input"]>;
};

export type AddStepPositionInput = {
  x: Scalars["Float"]["input"];
  y: Scalars["Float"]["input"];
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
  maxAttempts: Scalars["Int"]["output"];
  maxDelaySeconds: Scalars["Int"]["output"];
  /** Error classes that are retryable. Everything else fails terminally on attempt 1. */
  retryOn: Array<Scalars["String"]["output"]>;
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
};

export type SetTriggerInput = {
  blockType: Scalars["String"]["input"];
  config: Scalars["Unknown"]["input"];
  connectionId?: InputMaybe<Scalars["PHID"]["input"]>;
  filter?: InputMaybe<Scalars["Unknown"]["input"]>;
  id: Scalars["OID"]["input"];
};

export type SetVariableInput = {
  description?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["OID"]["input"];
  key: Scalars["String"]["input"];
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

export type TriggerBinding = {
  /** Fully-qualified block type, e.g. 'core#schedule' or '@acme/connector-imap#imap.newMessage'. */
  blockType: Scalars["String"]["output"];
  /** Validated against the trigger's configSchema. */
  config: Scalars["Unknown"]["output"];
  /** Connection document id, when the trigger's connector requires one. */
  connectionId: Maybe<Scalars["PHID"]["output"]>;
  /** Optional server-side filter applied before a run is started. */
  filter: Maybe<Scalars["Unknown"]["output"]>;
  id: Scalars["OID"]["output"];
};

export type UpdateStepInput = {
  blockType?: InputMaybe<Scalars["String"]["input"]>;
  config?: InputMaybe<Scalars["Unknown"]["input"]>;
  connectionId?: InputMaybe<Scalars["PHID"]["input"]>;
  id: Scalars["OID"]["input"];
  idempotencyKeyExpression?: InputMaybe<Scalars["String"]["input"]>;
  key?: InputMaybe<Scalars["String"]["input"]>;
  name?: InputMaybe<Scalars["String"]["input"]>;
  position?: InputMaybe<UpdateStepPositionInput>;
  retry?: InputMaybe<UpdateStepRetryPolicyInput>;
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

export type WorkflowEdge = {
  /** Optional guard expression; the edge is taken only when it evaluates truthy. */
  condition: Maybe<Scalars["String"]["output"]>;
  /** Source step id, or the trigger id for the entry edge. */
  from: Scalars["OID"]["output"];
  id: Scalars["OID"]["output"];
  /** Named output port of the source step: 'next', 'true', 'false', 'error', or a case label. */
  port: Scalars["String"]["output"];
  to: Scalars["OID"]["output"];
};

export type WorkflowPolicy = {
  /** SINGLETON drops a firing while a run is active; QUEUE serialises; PARALLEL runs concurrently. */
  concurrency: ConcurrencyMode;
  defaultRetry: RetryPolicy;
  journalAsDocument: Scalars["Boolean"]["output"];
  maxParallelRuns: Maybe<Scalars["Int"]["output"]>;
  /** Bounds how long a run may stay suspended on a waitpoint. */
  maxSuspensionDays: Scalars["Int"]["output"];
  /** What happens to a run whose steps have all failed terminally. */
  onFailure: FailureMode;
  retainRunsDays: Scalars["Int"]["output"];
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
  /** Only ENABLED workflows get trigger instances. */
  status: WorkflowStatus;
  steps: Array<WorkflowStep>;
  trigger: Maybe<TriggerBinding>;
  variables: Array<WorkflowVariable>;
  /** Monotonic; bumped on every structural edit. A run records the version it executed. */
  version: Scalars["Int"]["output"];
};

export type WorkflowStatus = "ARCHIVED" | "DISABLED" | "DRAFT" | "ENABLED";

export type WorkflowStep = {
  blockType: Scalars["String"]["output"];
  config: Scalars["Unknown"]["output"];
  connectionId: Maybe<Scalars["PHID"]["output"]>;
  id: Scalars["OID"]["output"];
  /** Expression yielding a stable key; two executions with the same key are one side effect. */
  idempotencyKeyExpression: Maybe<Scalars["String"]["output"]>;
  /** Author-visible label; unique within the workflow; used in expressions. */
  key: Scalars["String"]["output"];
  name: Scalars["String"]["output"];
  position: Maybe<Point>;
  /** Per-step override of the workflow default retry policy. */
  retry: Maybe<RetryPolicy>;
  timeoutSeconds: Maybe<Scalars["Int"]["output"]>;
};

export type WorkflowVariable = {
  description: Maybe<Scalars["String"]["output"]>;
  id: Scalars["OID"]["output"];
  /** Name used in expressions. */
  key: Scalars["String"]["output"];
  /** Default value; the trigger payload can be mapped onto it. */
  value: Maybe<Scalars["Unknown"]["output"]>;
};
