import { Node, SyncStatus } from "document-drive";
import {
  Action,
  ActionErrorCallback,
  DocumentModelModule,
  PHDocument,
} from "document-model";
import { createContext, PropsWithChildren, useContext } from "react";
import type { UiNode } from "../uiNodes/types.js";
import { HookState } from "./document-state.js";

/**
 * Interface representing the context values provided by the host application
 * for managing document drive functionality.
 */
export interface IDriveContext {
  /** Controls the visibility of the search bar in the drive interface */
  showSearchBar: boolean;

  /** Indicates whether the current user has permissions to create new documents */
  isAllowedToCreateDocuments: boolean;

  /** Array of available document models that can be created */
  documentModels: DocumentModelModule[];
  /** Currently selected node (file/folder) in the drive */
  selectedNode: Node | null;

  /**
   * Callback to update the selected node in the drive
   * @param node - The node to be selected
   */
  selectNode: (node: UiNode | null) => void;

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
   * Shows a modal for creating a new document
   * @param documentModel - Document model of the document to be created
   * @returns Promise resolving to an object containing the document name
   */
  showCreateDocumentModal: (
    documentModel: DocumentModelModule,
  ) => Promise<{ name: string }>;

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
  }) => Record<string, HookState>;

  /**
   * Retrieves the state of a document in a drive
   * @param driveId - ID of the drive to retrieve document state for
   * @param documentId - ID of the document to retrieve state for
   * @type TDocument - Type of the document to retrieve state for if known
   * @returns State of the document
   */
  useDriveDocumentState: <TDocument extends PHDocument = PHDocument>(props: {
    driveId: string;
    documentId: string;
  }) => TDocument["state"] | undefined;
}

const DriveContext = createContext<IDriveContext | undefined>(undefined);

export const DriveContextProvider: React.FC<
  PropsWithChildren<{ value: IDriveContext }>
> = ({ value, children }) => (
  <DriveContext.Provider value={value}>{children}</DriveContext.Provider>
);

/**
 * Hook to access the drive context values provided by the host application.
 * Must be used within a DriveContextProvider component.
 *
 * @returns IDriveContext - Object containing drive-related values and functions
 *
 * @example
 * const {
 *   showSearchBar,
 *   documentModels,
 *   selectedNode,
 *   addFile
 * } = useDriveContext();
 */
export function useDriveContext() {
  const context = useContext(DriveContext);
  if (!context) {
    throw new Error(
      "useDriveContext must be used within a DriveContextProvider",
    );
  }
  return context;
}
