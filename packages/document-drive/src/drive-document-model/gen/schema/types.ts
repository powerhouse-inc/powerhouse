export type Maybe<T> = T | null;
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
  Unknown: { input: unknown; output: unknown };
};

export type AddFileInput = {
  document?: InputMaybe<Scalars["Unknown"]["input"]>;
  documentType: Scalars["String"]["input"];
  id: Scalars["ID"]["input"];
  name: Scalars["String"]["input"];
  parentFolder?: InputMaybe<Scalars["ID"]["input"]>;
  synchronizationUnits: Array<SynchronizationUnit>;
};

export type AddFolderInput = {
  id: Scalars["ID"]["input"];
  name: Scalars["String"]["input"];
  parentFolder?: InputMaybe<Scalars["ID"]["input"]>;
};

export type AddListenerInput = {
  listener: Listener;
};

export type AddTriggerInput = {
  trigger: Trigger;
};

export type CopyNodeInput = {
  srcId: Scalars["ID"]["input"];
  synchronizationUnits?: InputMaybe<Array<SynchronizationUnit>>;
  targetId: Scalars["ID"]["input"];
  targetName?: InputMaybe<Scalars["String"]["input"]>;
  targetParentFolder?: InputMaybe<Scalars["ID"]["input"]>;
};

export type DeleteNodeInput = {
  id: Scalars["ID"]["input"];
};

export type DocumentDriveLocalState = {
  availableOffline: Scalars["Boolean"]["output"];
  listeners: Array<Listener>;
  sharingType: Maybe<Scalars["String"]["output"]>;
  triggers: Array<Trigger>;
};

export type DocumentDriveState = {
  icon: Maybe<Scalars["String"]["output"]>;
  id: Scalars["ID"]["output"];
  name: Scalars["String"]["output"];
  nodes: Array<Node>;
};

export type FileNode = {
  documentType: Scalars["String"]["output"];
  id: Scalars["String"]["output"];
  kind: Scalars["String"]["output"];
  name: Scalars["String"]["output"];
  parentFolder: Maybe<Scalars["String"]["output"]>;
  synchronizationUnits: Array<SynchronizationUnit>;
};

export type FolderNode = {
  id: Scalars["String"]["output"];
  kind: Scalars["String"]["output"];
  name: Scalars["String"]["output"];
  parentFolder: Maybe<Scalars["String"]["output"]>;
};

export type Listener = {
  block: Scalars["Boolean"]["output"];
  callInfo: Maybe<ListenerCallInfo>;
  filter: ListenerFilter;
  label: Maybe<Scalars["String"]["output"]>;
  listenerId: Scalars["ID"]["output"];
  system: Scalars["Boolean"]["output"];
};

export type ListenerCallInfo = {
  data: Maybe<Scalars["String"]["output"]>;
  name: Maybe<Scalars["String"]["output"]>;
  transmitterType: Maybe<TransmitterType | `${TransmitterType}`>;
};

export type ListenerFilter = {
  branch: Maybe<Array<Scalars["String"]["output"]>>;
  documentId: Maybe<Array<Scalars["ID"]["output"]>>;
  documentType: Array<Scalars["String"]["output"]>;
  scope: Maybe<Array<Scalars["String"]["output"]>>;
};

export type MoveNodeInput = {
  srcFolder: Scalars["ID"]["input"];
  targetParentFolder?: InputMaybe<Scalars["ID"]["input"]>;
};

export type Node = FileNode | FolderNode;

export type PullResponderTriggerData = {
  interval: Scalars["String"]["output"];
  listenerId: Scalars["ID"]["output"];
  url: Scalars["String"]["output"];
};

export type RemoveListenerInput = {
  listenerId: Scalars["String"]["input"];
};

export type RemoveTriggerInput = {
  triggerId: Scalars["String"]["input"];
};

export type SetAvailableOfflineInput = {
  availableOffline: Scalars["Boolean"]["input"];
};

export type SetDriveIconInput = {
  icon: Scalars["String"]["input"];
};

export type SetDriveNameInput = {
  name: Scalars["String"]["input"];
};

export type SetSharingTypeInput = {
  type: Scalars["String"]["input"];
};

export type SynchronizationUnit = {
  branch: Scalars["String"]["output"];
  scope: Scalars["String"]["output"];
  syncId: Scalars["ID"]["output"];
};

export type TransmitterType =
  | "Internal"
  | "MatrixConnect"
  | "PullResponder"
  | "RESTWebhook"
  | "SecureConnect"
  | "SwitchboardPush";

export type Trigger = {
  data: Maybe<TriggerData>;
  id: Scalars["ID"]["output"];
  type: TriggerType | `${TriggerType}`;
};

export type TriggerData = PullResponderTriggerData;

export type TriggerType = "PullResponder";

export type UpdateFileInput = {
  documentType?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["ID"]["input"];
  name?: InputMaybe<Scalars["String"]["input"]>;
  parentFolder?: InputMaybe<Scalars["ID"]["input"]>;
};

export type UpdateNodeInput = {
  id: Scalars["ID"]["input"];
  name?: InputMaybe<Scalars["String"]["input"]>;
  parentFolder?: InputMaybe<Scalars["ID"]["input"]>;
};
