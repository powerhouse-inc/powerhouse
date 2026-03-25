import type { PHBaseState } from "document-model";
import type { Scalars, InputMaybe, Maybe } from "types";

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
  listener: ListenerInput;
};

export type AddTriggerInput = {
  trigger: TriggerInput;
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

export type DocumentDriveGlobalState = {
  icon: Maybe<Scalars["String"]["output"]>;
  name: Scalars["String"]["output"];
  nodes: Array<Node>;
};

export type DocumentDrivePHState = PHBaseState & {
  global: DocumentDriveGlobalState;
  local: DocumentDriveLocalState;
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

export type ListenerInput = {
  block: Scalars["Boolean"]["input"];
  callInfo?: InputMaybe<ListenerCallInfoInput>;
  filter: ListenerFilterInput;
  label?: InputMaybe<Scalars["String"]["input"]>;
  listenerId: Scalars["ID"]["input"];
  system: Scalars["Boolean"]["input"];
};

export type ListenerCallInfo = {
  data: Maybe<Scalars["String"]["output"]>;
  name: Maybe<Scalars["String"]["output"]>;
  transmitterType: Maybe<TransmitterType>;
};

export type ListenerCallInfoInput = {
  data?: InputMaybe<Scalars["String"]["input"]>;
  name?: InputMaybe<Scalars["String"]["input"]>;
  transmitterType?: InputMaybe<TransmitterType>;
};

export type ListenerFilter = {
  branch: Maybe<Array<Scalars["String"]["output"]>>;
  documentId: Maybe<Array<Scalars["ID"]["output"]>>;
  documentType: Maybe<Array<Scalars["String"]["output"]>>;
  scope: Maybe<Array<Scalars["String"]["output"]>>;
};

export type ListenerFilterInput = {
  branch?: InputMaybe<Array<Scalars["String"]["input"]>>;
  documentId?: InputMaybe<Array<Scalars["ID"]["input"]>>;
  documentType?: InputMaybe<Array<Scalars["String"]["input"]>>;
  scope?: InputMaybe<Array<Scalars["String"]["input"]>>;
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

export type PullResponderTriggerDataInput = {
  interval: Scalars["String"]["input"];
  listenerId: Scalars["ID"]["input"];
  url: Scalars["String"]["input"];
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
  type: TriggerType;
};

export type TriggerInput = {
  data?: InputMaybe<PullResponderTriggerDataInput>;
  id: Scalars["ID"]["input"];
  type: TriggerType;
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
