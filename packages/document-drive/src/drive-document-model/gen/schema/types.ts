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
  Amount: {
    input: { unit?: string; value?: number };
    output: { unit?: string; value?: number };
  };
  Amount_Crypto: {
    input: { unit: string; value: number };
    output: { unit: string; value: number };
  };
  Amount_Currency: {
    input: { unit: string; value: number };
    output: { unit: string; value: number };
  };
  Amount_Fiat: {
    input: { unit: string; value: number };
    output: { unit: string; value: number };
  };
  Amount_Money: { input: number; output: number };
  Amount_Percentage: { input: number; output: number };
  Amount_Tokens: { input: number; output: number };
  Currency: { input: string; output: string };
  Date: { input: string; output: string };
  DateTime: { input: string; output: string };
  EmailAddress: { input: string; output: string };
  EthereumAddress: { input: string; output: string };
  OID: { input: string; output: string };
  OLabel: { input: string; output: string };
  PHID: { input: string; output: string };
  URL: { input: string; output: string };
};

export type AddFileInput = {
  documentType: Scalars["String"]["input"];
  id: Scalars["ID"]["input"];
  name: Scalars["String"]["input"];
  parentFolder?: InputMaybe<Scalars["ID"]["input"]>;
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
  name: Scalars["String"]["output"];
  nodes: Array<Node>;
};

export type FileNode = {
  documentType: Scalars["String"]["output"];
  id: Scalars["String"]["output"];
  kind: Scalars["String"]["output"];
  name: Scalars["String"]["output"];
  parentFolder: Maybe<Scalars["String"]["output"]>;
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
