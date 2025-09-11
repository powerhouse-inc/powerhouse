import type { FolderNode, Node } from "document-drive";
import type { DocumentModelModule, PHDocument } from "document-model";
import type { FC } from "react";

/**
 * Interface representing the context values provided by the host application
 * for managing document drive functionality.
 */
export type IDriveContext = {
  /**
   * Callback to add a new file to the drive
   * @param file - The file to be added
   * @param parent - The parent node of the file
   * @returns Promise resolving to the newly created Node
   */
  onAddFile: (file: File, parent: Node | undefined) => Promise<void>;
  /**
   * Callback to add a new folder to the drive
   * @param name - The name of the folder
   * @param parent - The parent node of the folder
   * @returns Promise resolving to the newly created FolderNode
   */
  onAddFolder: (
    name: string,
    parent: Node | undefined,
  ) => Promise<FolderNode | undefined>;
  /**
   * Callback to rename a node
   * @param newName - The new name of the node
   * @param node - The node to be renamed
   * @returns Promise resolving to the newly renamed Node
   */
  onRenameNode: (newName: string, node: Node) => Promise<Node | undefined>;
  /**
   * Callback to copy a node
   * @param src - The node to be copied
   * @param target - The parent node of the copied node
   * @returns Promise resolving to the newly created Node
   */
  onCopyNode: (src: Node, target: Node | undefined) => Promise<void>;
  /**
   * Callback to move a node
   * @param src - The node to be moved
   * @param target - The parent node of the moved node
   * @returns Promise resolving to the newly created Node
   */
  onMoveNode: (src: Node, target: Node | undefined) => Promise<void>;
  /**
   * Callback to duplicate a node
   * @param src - The node to be duplicated
   * @returns Promise resolving to the newly created Node
   */
  onDuplicateNode: (src: Node) => Promise<void>;
  showCreateDocumentModal: (documentModel: DocumentModelModule) => void;
  /**
   * Shows a modal for deleting a node
   * @param node - The node to be deleted
   */
  showDeleteNodeModal: (node: Node) => void;
};

export type DriveEditorProps = {
  document: PHDocument;
  context: IDriveContext;
};

export type DriveEditorModule = {
  Component: FC<DriveEditorProps>;
  documentTypes: string[];
  config: {
    id: string;
    name?: string;
    disableExternalControls?: boolean;
    documentToolbarEnabled?: boolean;
    showSwitchboardLink?: boolean;
  };
};
