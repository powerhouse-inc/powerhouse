import {
  type FileNode,
  type FolderNode,
  type Node,
  type SyncStatus,
} from "document-drive";
import {
  type Action,
  type ActionErrorCallback,
  type DocumentModelModule,
  type EditorContext,
  type EditorModule,
  type EditorProps,
  type PHDocument,
} from "document-model";
import { type FC } from "react";

import { type User } from "../renown/types.js";

/**
 * Interface representing the context values provided by the host application
 * for managing document drive functionality.
 */
export type IDriveContext = {
  /** Controls the visibility of the search bar in the drive interface */
  showSearchBar: boolean;
  /** Indicates whether the current user has permissions to create new documents */
  isAllowedToCreateDocuments: boolean;
  /** Array of available document models that can be created */
  documentModels: DocumentModelModule[];
  /**
   * The name of the analytics database to use for the drive editor
   */
  analyticsDatabaseName: string;
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
  /**
   * Callback to add a new folder and select it
   * @param name - The name of the folder
   * @returns Promise resolving to the newly created FolderNode
   */
  onAddAndSelectNewFolder: (name: string) => Promise<void>;
  /**
   * Callback to get the sync status of a sync
   * @param syncId - The id of the sync
   * @param sharingType - The sharing type of the sync
   * @returns The sync status of the sync, or undefined if not found
   */
  getSyncStatusSync: (
    syncId: string,
    sharingType: "LOCAL" | "CLOUD" | "PUBLIC",
  ) => SyncStatus | undefined;
  /**
   * Adds a new file to the drive
   * @param file - File to be added (can be a string path or File object)
   * @param drive - The drive to add the file to
   * @param name - Optional name for the file
   * @param parentFolder - Optional parent folder of the file
   * @returns Promise resolving to the newly created Node
   */
  addFile: (
    file: string | File,
    drive: string,
    name?: string,
    parentFolder?: string,
  ) => Promise<void>;
  /**
   * Adds a new document to the drive
   * @param driveId - ID of the drive to add the document to
   * @param name - Name of the document
   * @param documentType - Type of document to create
   * @param parentFolder - Optional parent folder of the document
   * @param document - Optional document content
   * @param id - Optional id for the document
   * @returns Promise resolving to the newly created
   */
  addDocument: (
    driveId: string,
    name: string,
    documentType: string,
    parentFolder?: string,
    document?: PHDocument,
    id?: string,
  ) => Promise<FileNode | undefined>;
  /**
   * Shows a modal for creating a new document
   * @param documentModel - Document model of the document to be created
   * @returns Promise resolving to an object containing the document name
   */
  showCreateDocumentModal: (documentModel: DocumentModelModule) => void;
  /**
   * Shows a modal for deleting a node
   * @param node - The node to be deleted
   */
  showDeleteNodeModal: (node: Node) => void;
  /**
   * Retrieves the document model module for a given document type
   * @param documentType - The type of document to retrieve the model for
   * @returns The document model module for the given document type, or undefined if not found
   */
  getDocumentModelModule: (
    documentType: string | undefined,
  ) => DocumentModelModule<PHDocument> | undefined;
  /**
   * Retrieves the editor module for a given document type
   * @param documentType - The type of document to retrieve the editor for
   * @returns The editor module for the given document type, or null if not found
   */
  getEditor: (
    documentType: string | undefined,
  ) => EditorModule | null | undefined;
  useDocumentEditorProps: (props: {
    driveId: string | undefined;
    documentId: string | undefined;
    documentType: string | undefined;
    documentModelModule: DocumentModelModule<PHDocument> | undefined;
    user?: User;
  }) => {
    dispatch: (action: Action, onErrorCallback?: ActionErrorCallback) => void;
    document: PHDocument | undefined;
    error: unknown;
  };
};

export type DriveEditorContext = Omit<EditorContext, "getDocumentRevision"> &
  IDriveContext;

export interface DriveEditorProps<TDocument extends PHDocument>
  extends Omit<EditorProps<TDocument>, "context"> {
  context: DriveEditorContext;
}

export type DriveEditorModule<
  TDocument extends PHDocument = PHDocument,
  TCustomProps = unknown,
  TEditorConfig extends Record<string, unknown> = Record<string, unknown>,
> = {
  Component: FC<
    DriveEditorProps<TDocument> & TCustomProps & Record<string, unknown>
  >;
  documentTypes: string[];
  config: TEditorConfig & {
    id: string;
    disableExternalControls?: boolean;
    documentToolbarEnabled?: boolean;
    showSwitchboardLink?: boolean;
  };
};
