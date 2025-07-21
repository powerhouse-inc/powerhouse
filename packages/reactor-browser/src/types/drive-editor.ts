import {
  type DocumentDriveDocument,
  type FileNode,
  type FolderNode,
  type IDocumentDriveServer,
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
  /** Reactor instance */
  reactor: IDocumentDriveServer | undefined;
  /** Currently selected drive */
  selectedDrive: DocumentDriveDocument | null | undefined;
  /** Currently selected folder */
  selectedFolder: FolderNode | null | undefined;
  /** Currently selected document */
  selectedDocument: PHDocument | null | undefined;
  /** Selected document parent folder */
  parentFolder: FolderNode | null | undefined;

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
   * Callback to update the selected node (document or folder) in the drive
   * @param id - The id of the node to be selected
   */
  setSelectedNode: (id: string | undefined) => void;
  /**
   * Callback to update the selected drive in the drive
   * @param id - The id of the drive to be selected
   */
  setSelectedDrive: (id: string | undefined) => void;
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
   * @returns Promise resolving to the newly created
   */
  addDocument: (
    driveId: string,
    name: string,
    documentType: string,
    parentFolder?: string,
    document?: PHDocument,
  ) => Promise<FileNode | undefined>;
  /**
   * Shows a modal for creating a new document
   * @param documentModel - Document model of the document to be created
   * @returns Promise resolving to an object containing the document name
   */
  showCreateDocumentModal: (documentModel: DocumentModelModule) => void;
  showDeleteNodeModal: (node: Node) => void;
  /**
   * Retrieves the document model module for a given document type
   * @param documentType - The type of document to retrieve the model for
   * @returns The document model module for the given document type, or undefined if not found
   */
  getDocumentModelModule: (
    documentType: string,
  ) => DocumentModelModule<PHDocument> | undefined;
  /**
   * Retrieves the editor module for a given document type
   * @param documentType - The type of document to retrieve the editor for
   * @returns The editor module for the given document type, or null if not found
   */
  getEditor: (documentType: string) => EditorModule | null | undefined;
  useDocumentEditorProps: (props: {
    driveId: string;
    documentId: string;
    documentType: string;
    documentModelModule: DocumentModelModule<PHDocument>;
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
