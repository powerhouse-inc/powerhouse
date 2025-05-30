import {
  type FileNode,
  type GetDocumentOptions,
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

import { type HookState } from "../hooks/document-state.js";
import { type User } from "../renown/types.js";

export interface DriveEditorContext
  extends Omit<EditorContext, "getDocumentRevision"> {
  /** Controls the visibility of the search bar in the drive interface */
  showSearchBar: boolean;

  /** Indicates whether the current user has permissions to create new documents */
  isAllowedToCreateDocuments: boolean;

  /** Array of available document models that can be created */
  documentModels: DocumentModelModule[];

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
  ) => Promise<FileNode>;

  /**
   * Shows a modal for creating a new document
   * @param documentModel - Document model of the document to be created
   */
  showCreateDocumentModal: (documentModel: DocumentModelModule) => void;

  /**
   * Retrieves the sync status of a document or drive
   * @param driveId - ID of the drive to check sync status for
   * @param documentId - ID of the document to check sync status for
   * @returns SyncStatus object containing sync information
   */
  useSyncStatus: (
    driveId: string,
    documentId?: string,
  ) => SyncStatus | undefined;

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

  /**
   * Retrieves the states of all documents in a drive
   * @param driveId - ID of the drive to retrieve document states for
   * @param documentIds - IDs of the documents to retrieve states for (all if not provided)
   * @returns Record of document IDs to their states
   */
  useDriveDocumentStates: (props: {
    driveId: string;
    documentIds?: string[];
  }) => readonly [
    Record<string, HookState>,
    (_driveId: string, _documentIds?: string[]) => Promise<void>,
  ];

  /**
   * Retrieves the state of a document in a drive
   * @param driveId - ID of the drive to retrieve document state for
   * @param documentId - ID of the document to retrieve state for
   * @type TDocument - Type of the document to retrieve state for if known
   * @returns State of the document
   */
  useDriveDocumentState: (props: {
    driveId: string;
    documentId: string;
  }) => PHDocument["state"] | undefined;

  /**
   * Retrieves a document from a specific revision
   * @param documentId - ID of the document to retrieve
   * @param options - Optional configuration options for the retrieval
   * @returns Promise resolving to the document at the specified revision
   */
  getDocumentRevision?: (
    documentId: string,
    options?: GetDocumentOptions,
  ) => Promise<PHDocument> | undefined;

  /**
   * The name of the analytics database to use for the drive editor
   */
  analyticsDatabaseName: string;

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
}
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
