import type { FolderNode, Node } from "document-drive";

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
