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

export type AcceptTaskInput = {
  completedAt: Scalars["DateTime"]["input"];
  taskId: Scalars["OID"]["input"];
};

export type ActivateWbsInput = {
  _?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type AddPackageInput = {
  description?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["OID"]["input"];
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
  name: Scalars["String"]["input"];
  parentPackageId?: InputMaybe<Scalars["OID"]["input"]>;
};

export type AddTaskDependencyInput = {
  documentId: Scalars["PHID"]["input"];
  id: Scalars["OID"]["input"];
  name?: InputMaybe<Scalars["String"]["input"]>;
  objectId: Scalars["OID"]["input"];
  status?: InputMaybe<Scalars["String"]["input"]>;
  taskId: Scalars["OID"]["input"];
};

export type AddTaskInput = {
  acceptanceCriteria?: InputMaybe<Scalars["String"]["input"]>;
  description?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["OID"]["input"];
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
  name: Scalars["String"]["input"];
  owner?: InputMaybe<Scalars["String"]["input"]>;
  packageId?: InputMaybe<Scalars["OID"]["input"]>;
  taskKind: Array<TaskKind>;
};

export type AddTaskOutcomeRefInput = {
  documentId: Scalars["PHID"]["input"];
  id: Scalars["OID"]["input"];
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
  objectId: Scalars["OID"]["input"];
  scope?: InputMaybe<Scalars["String"]["input"]>;
  statement?: InputMaybe<Scalars["String"]["input"]>;
  taskId: Scalars["OID"]["input"];
};

export type ArchiveWbsInput = {
  _?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type AssignTaskInput = {
  agent?: InputMaybe<Scalars["String"]["input"]>;
  documentId: Scalars["PHID"]["input"];
  model?: InputMaybe<Scalars["String"]["input"]>;
  owner?: InputMaybe<Scalars["String"]["input"]>;
  startedAt: Scalars["DateTime"]["input"];
  taskId: Scalars["OID"]["input"];
};

export type BlockTaskInput = {
  reason?: InputMaybe<Scalars["String"]["input"]>;
  taskId: Scalars["OID"]["input"];
};

export type ClearFeatureInput = {
  _?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type ClearTaskParentFeatureInput = {
  taskId: Scalars["OID"]["input"];
};

export type ClearTaskPlannedInInput = {
  taskId: Scalars["OID"]["input"];
};

export type ClearTaskTargetSpecInput = {
  taskId: Scalars["OID"]["input"];
};

export type ClearWbsDescriptionInput = {
  _?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type ClearWbsNameInput = {
  _?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type CompleteWbsInput = {
  _?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type DropTaskInput = {
  reason?: InputMaybe<Scalars["String"]["input"]>;
  taskId: Scalars["OID"]["input"];
};

export type FeatureRef = {
  documentId: Scalars["PHID"]["output"];
  name: Maybe<Scalars["String"]["output"]>;
  status: Maybe<Scalars["String"]["output"]>;
};

export type MovePackageInput = {
  id: Scalars["OID"]["input"];
  parentPackageId?: InputMaybe<Scalars["OID"]["input"]>;
};

export type MoveTaskInput = {
  id: Scalars["OID"]["input"];
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
  packageId?: InputMaybe<Scalars["OID"]["input"]>;
};

export type OutcomeRef = {
  documentId: Scalars["PHID"]["output"];
  id: Scalars["OID"]["output"];
  objectId: Scalars["OID"]["output"];
  scope: Maybe<Scalars["String"]["output"]>;
  statement: Maybe<Scalars["String"]["output"]>;
};

export type RejectTaskInput = {
  taskId: Scalars["OID"]["input"];
};

export type RemovePackageInput = {
  id: Scalars["OID"]["input"];
};

export type RemoveTaskDependencyInput = {
  id: Scalars["OID"]["input"];
  taskId: Scalars["OID"]["input"];
};

export type RemoveTaskInput = {
  id: Scalars["OID"]["input"];
};

export type RemoveTaskOutcomeRefInput = {
  id: Scalars["OID"]["input"];
  taskId: Scalars["OID"]["input"];
};

export type ReopenWbsInput = {
  _?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type ReorderPackagesInput = {
  ids: Array<Scalars["OID"]["input"]>;
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
};

export type ReorderTaskOutcomeRefsInput = {
  ids: Array<Scalars["OID"]["input"]>;
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
  taskId: Scalars["OID"]["input"];
};

export type ReorderTasksInput = {
  ids: Array<Scalars["OID"]["input"]>;
  insertBefore?: InputMaybe<Scalars["OID"]["input"]>;
};

export type SessionRef = {
  agent: Maybe<Scalars["String"]["output"]>;
  documentId: Scalars["PHID"]["output"];
  model: Maybe<Scalars["String"]["output"]>;
};

export type SetFeatureInput = {
  documentId: Scalars["PHID"]["input"];
  name?: InputMaybe<Scalars["String"]["input"]>;
  status?: InputMaybe<Scalars["String"]["input"]>;
};

export type SetTaskParentFeatureInput = {
  documentId: Scalars["PHID"]["input"];
  name?: InputMaybe<Scalars["String"]["input"]>;
  status?: InputMaybe<Scalars["String"]["input"]>;
  taskId: Scalars["OID"]["input"];
};

export type SetTaskPlannedInInput = {
  agent?: InputMaybe<Scalars["String"]["input"]>;
  documentId: Scalars["PHID"]["input"];
  model?: InputMaybe<Scalars["String"]["input"]>;
  taskId: Scalars["OID"]["input"];
};

export type SetTaskTargetSpecInput = {
  documentId: Scalars["PHID"]["input"];
  kind?: InputMaybe<Scalars["String"]["input"]>;
  name?: InputMaybe<Scalars["String"]["input"]>;
  taskId: Scalars["OID"]["input"];
};

export type SetWbsDescriptionInput = {
  description: Scalars["String"]["input"];
};

export type SetWbsNameInput = {
  name: Scalars["String"]["input"];
};

export type SpecRef = {
  documentId: Scalars["PHID"]["output"];
  kind: Maybe<Scalars["String"]["output"]>;
  name: Maybe<Scalars["String"]["output"]>;
};

export type SubmitTaskForReviewInput = {
  taskId: Scalars["OID"]["input"];
};

export type Task = {
  acceptanceCriteria: Maybe<Scalars["String"]["output"]>;
  completedAt: Maybe<Scalars["DateTime"]["output"]>;
  dependsOn: Array<TaskRef>;
  description: Maybe<Scalars["String"]["output"]>;
  id: Scalars["OID"]["output"];
  name: Scalars["String"]["output"];
  notes: Maybe<Scalars["String"]["output"]>;
  owner: Maybe<Scalars["String"]["output"]>;
  packageId: Maybe<Scalars["OID"]["output"]>;
  parentFeature: Maybe<FeatureRef>;
  plannedIn: Maybe<SessionRef>;
  session: Maybe<SessionRef>;
  startedAt: Maybe<Scalars["DateTime"]["output"]>;
  status: TaskStatus;
  targetOutcomes: Array<OutcomeRef>;
  targetSpec: Maybe<SpecRef>;
  taskKind: Array<TaskKind>;
};

export type TaskKind =
  | "DOCUMENTATION"
  | "IMPLEMENTATION"
  | "INTEGRATION"
  | "MAINTENANCE"
  | "REVIEW"
  | "SPEC_CHANGE"
  | "TESTING";

export type TaskRef = {
  documentId: Scalars["PHID"]["output"];
  id: Scalars["OID"]["output"];
  name: Maybe<Scalars["String"]["output"]>;
  objectId: Scalars["OID"]["output"];
  status: Maybe<Scalars["String"]["output"]>;
};

export type TaskStatus =
  | "BLOCKED"
  | "DONE"
  | "DROPPED"
  | "IN_PROGRESS"
  | "REVIEW"
  | "TODO";

export type UnassignTaskInput = {
  taskId: Scalars["OID"]["input"];
};

export type UnblockTaskInput = {
  taskId: Scalars["OID"]["input"];
};

export type UpdateFeatureSnippetInput = {
  name?: InputMaybe<Scalars["String"]["input"]>;
  status?: InputMaybe<Scalars["String"]["input"]>;
};

export type UpdatePackageInput = {
  description?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["OID"]["input"];
  name?: InputMaybe<Scalars["String"]["input"]>;
};

export type UpdateTaskDependencySnippetInput = {
  id: Scalars["OID"]["input"];
  name?: InputMaybe<Scalars["String"]["input"]>;
  status?: InputMaybe<Scalars["String"]["input"]>;
  taskId: Scalars["OID"]["input"];
};

export type UpdateTaskInput = {
  acceptanceCriteria?: InputMaybe<Scalars["String"]["input"]>;
  description?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["OID"]["input"];
  name?: InputMaybe<Scalars["String"]["input"]>;
  notes?: InputMaybe<Scalars["String"]["input"]>;
  owner?: InputMaybe<Scalars["String"]["input"]>;
  taskKind?: InputMaybe<Array<TaskKind>>;
};

export type UpdateTaskOutcomeRefSnippetInput = {
  id: Scalars["OID"]["input"];
  scope?: InputMaybe<Scalars["String"]["input"]>;
  statement?: InputMaybe<Scalars["String"]["input"]>;
  taskId: Scalars["OID"]["input"];
};

export type UpdateTaskParentFeatureSnippetInput = {
  name?: InputMaybe<Scalars["String"]["input"]>;
  status?: InputMaybe<Scalars["String"]["input"]>;
  taskId: Scalars["OID"]["input"];
};

export type UpdateTaskPlannedInSnippetInput = {
  agent?: InputMaybe<Scalars["String"]["input"]>;
  model?: InputMaybe<Scalars["String"]["input"]>;
  taskId: Scalars["OID"]["input"];
};

export type UpdateTaskSessionSnippetInput = {
  agent?: InputMaybe<Scalars["String"]["input"]>;
  model?: InputMaybe<Scalars["String"]["input"]>;
  taskId: Scalars["OID"]["input"];
};

export type UpdateTaskTargetSpecSnippetInput = {
  kind?: InputMaybe<Scalars["String"]["input"]>;
  name?: InputMaybe<Scalars["String"]["input"]>;
  taskId: Scalars["OID"]["input"];
};

export type WbsStatus = "ACTIVE" | "ARCHIVED" | "COMPLETE" | "DRAFT";

export type WorkBreakdownStructureState = {
  description: Maybe<Scalars["String"]["output"]>;
  feature: Maybe<FeatureRef>;
  name: Maybe<Scalars["String"]["output"]>;
  packages: Array<WorkPackage>;
  status: WbsStatus;
  tasks: Array<Task>;
};

export type WorkPackage = {
  description: Maybe<Scalars["String"]["output"]>;
  id: Scalars["OID"]["output"];
  name: Scalars["String"]["output"];
  parentPackageId: Maybe<Scalars["OID"]["output"]>;
};
