import {
  type TNodeOptions,
  type UiDriveNode,
  type UiFileNode,
  type UiFolderNode,
  type UiNode,
} from "@/connect";

export type NodeProps = {
  nodeOptions: TNodeOptions;
  isAllowedToCreateDocuments?: boolean;
  isRemoteDrive?: boolean;
  onAddFolder: (name: string, uiNode: UiNode) => void;
  onAddFile: (file: File, parentNode: UiNode | null) => Promise<void>;
  onAddAndSelectNewFolder: (name: string) => Promise<void>;
  onRenameNode: (name: string, uiNode: UiNode) => void;
  onMoveNode: (uiNode: UiNode, targetNode: UiNode) => Promise<void>;
  onCopyNode: (uiNode: UiNode, targetNode: UiNode) => Promise<void>;
  onDuplicateNode: (uiNode: UiNode) => void;
  onDeleteNode: (uiNode: UiFileNode | UiFolderNode) => void;
  onDeleteDrive: (uiNode: UiDriveNode) => void;
  onAddTrigger: (uiNodeDriveId: string) => void;
  onRemoveTrigger: (uiNodeDriveId: string) => void;
  onAddInvalidTrigger: (uiNodeDriveId: string) => void;
};
