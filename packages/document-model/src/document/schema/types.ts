export type Maybe<T> = T | null;
export type InputMaybe<T> = T | null | undefined;
export type Exact<T extends Record<string, unknown>> = {
  [K in keyof T]: T[K];
};
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]?: Maybe<T[SubKey]>;
};
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]: Maybe<T[SubKey]>;
};
export type MakeEmpty<T extends Record<string, unknown>, K extends keyof T> = {
  [_ in K]?: never;
};
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
  Address: {
    input: `${string}:0x${string}`;
    output: `${string}:0x${string}`;
  };
  Attachment: { input: string; output: string };
  DateTime: { input: string; output: string };
  Unknown: { input: unknown; output: unknown };
};

export type Action = IAction & {
  __typename?: "Action";
  type: Scalars["String"]["output"];
};

export type UndoRedoAction = RedoAction | UndoAction;

export type DocumentFile = {
  __typename?: "DocumentFile";
  data: Scalars["String"]["output"];
  extension: Maybe<Scalars["String"]["output"]>;
  fileName: Maybe<Scalars["String"]["output"]>;
  mimeType: Scalars["String"]["output"];
};

export type IAction = {
  type: Scalars["String"]["output"];
};

export type IDocument = {
  created: Scalars["DateTime"]["output"];
  documentType: Scalars["String"]["output"];
  lastModified: Scalars["DateTime"]["output"];
  name: Scalars["String"]["output"];
  operations: Array<IOperation>;
  revision: Scalars["Int"]["output"];
};

export type IOperation = {
  hash: Scalars["String"]["output"];
  index: Scalars["Int"]["output"];
  timestampUtcMs: Scalars["DateTime"]["output"];
  type: Scalars["String"]["output"];
};

export type Load_State = "LOAD_STATE";

export type LoadStateAction = {
  id: Scalars["String"]["output"];
  timestampUtcMs: Scalars["DateTime"]["output"];
  input: LoadStateActionInput;
  type: Load_State;
  scope: string;
};

export type LoadStateActionInput = {
  operations: Scalars["Int"]["input"];
  state: LoadStateActionStateInput;
};

export type LoadStateActionStateInput = {
  data?: InputMaybe<Scalars["Unknown"]["input"]>;
  name: Scalars["String"]["input"];
};

export type Mutation = {
  __typename?: "Mutation";
  loadState: Maybe<IDocument>;
  prune: Maybe<IDocument>;
  redo: Maybe<IDocument>;
  setName: Maybe<IDocument>;
  undo: Maybe<IDocument>;
};

export type MutationLoadStateArgs = {
  input: LoadStateAction;
};

export type MutationPruneArgs = {
  input: PruneAction;
};

export type MutationRedoArgs = {
  input: RedoAction;
};

export type MutationSetNameArgs = {
  input: SetNameAction;
};

export type MutationUndoArgs = {
  input: UndoAction;
};

export type Operation = IOperation & {
  __typename?: "Operation";
  hash: Scalars["String"]["output"];
  index: Scalars["Int"]["output"];
  timestamp: Scalars["DateTime"]["output"];
  type: Scalars["String"]["output"];
};

export type Prune = "PRUNE";

export type PruneAction = {
  id: Scalars["String"]["output"];
  timestampUtcMs: Scalars["DateTime"]["output"];
  input: PruneActionInput;
  type: Prune;
  scope: string;
};

export type PruneActionInput = {
  end?: InputMaybe<Scalars["Int"]["input"]>;
  start?: InputMaybe<Scalars["Int"]["input"]>;
};

export type Query = {
  __typename?: "Query";
  document: Maybe<IDocument>;
};

export type Redo = "REDO";

export type RedoAction = {
  id: Scalars["String"]["output"];
  timestampUtcMs: Scalars["DateTime"]["output"];
  input: Scalars["Int"]["input"];
  type: Redo;
  scope: string;
};

export type Set_Name = "SET_NAME";

export type SetNameAction = {
  id: Scalars["String"]["output"];
  timestampUtcMs: Scalars["DateTime"]["output"];
  input: Scalars["String"]["input"];
  type: Set_Name;
  scope: "global";
};

export type SetNameOperation = IOperation & {
  __typename?: "SetNameOperation";
  hash: Scalars["String"]["output"];
  index: Scalars["Int"]["output"];
  input: Scalars["String"]["output"];
  timestamp: Scalars["DateTime"]["output"];
  type: Scalars["String"]["output"];
};

export type Undo = "UNDO";

export type UndoAction = {
  id: Scalars["String"]["output"];
  timestampUtcMs: Scalars["DateTime"]["output"];
  input: Scalars["Int"]["input"];
  type: Undo;
  scope: string;
};

export type NOOP = "NOOP";

export type NOOPAction = {
  id: Scalars["String"]["output"];
  timestampUtcMs: Scalars["DateTime"]["output"];
  input: Scalars["Unknown"]["input"];
  type: NOOP;
  scope: string;
};
