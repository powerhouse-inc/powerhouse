import type { FolderNode, Node, SharingType } from "document-drive";
import type { ReactNode } from "react";
import type { documentTypes } from "./constants/documents.js";
import type {
  debugNodeOptions,
  nodeOptions,
  normalNodeOptions,
} from "./constants/options.js";
import type { syncStatuses } from "./constants/syncing.js";

export type * from "./components/types.js";

export type DocumentTypes = typeof documentTypes;

// this weird syntax means "do autocomplete if you're using a string from our `DocumentTypes` list, but also allow any string"
export type TDocumentType = DocumentTypes[number] | (string & {});
export type DriveLocation = "LOCAL" | "CLOUD" | "SWITCHBOARD";

export type TNodeActions = {
  onAddFile: (file: File, parent: Node | undefined) => Promise<void>;
  onAddFolder: (
    name: string,
    parent: Node | undefined,
  ) => Promise<FolderNode | undefined>;
  onRenameNode: (newName: string, node: Node) => Promise<Node | undefined>;
  onCopyNode: (src: Node, target: Node | undefined) => Promise<void>;
  onMoveNode: (src: Node, target: Node | undefined) => Promise<void>;
  onDuplicateNode: (src: Node) => Promise<void>;
  onAddAndSelectNewFolder: (name: string) => Promise<void>;
};

export type OptionMetadata = {
  label: ReactNode;
  icon: React.JSX.Element;
  className?: string;
};

export type NormalNodeOptions = typeof normalNodeOptions;
export type DebugNodeOptions = typeof debugNodeOptions;
export type NodeOptions = typeof nodeOptions;
export type NormalNodeOption = NormalNodeOptions[number];
export type DebugNodeOption = DebugNodeOptions[number];
export type NodeOption = NodeOptions[number];

export type TNodeOptions = Record<
  SharingType,
  {
    DRIVE: NodeOption[];
    FOLDER: NodeOption[];
    FILE: NodeOption[];
  }
>;

export type DropdownMenuHandlers = Partial<
  Record<NodeOption, (node?: Node | null) => void>
>;

export type SyncStatuses = typeof syncStatuses;
export type SyncStatus = SyncStatuses[number];
