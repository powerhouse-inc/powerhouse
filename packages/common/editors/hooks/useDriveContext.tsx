import { DocumentModelModule } from "document-model";
import { Node } from "document-drive";
import { createContext, PropsWithChildren, useContext } from "react";

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
  selectNode: (node: Node) => void;

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
  ) => Promise<Node>;

  /**
   * Shows a modal for creating a new document
   * @param documentModel - Document model of the document to be created
   * @returns Promise resolving to an object containing the document name
   */
  showCreateDocumentModal: (
    documentModel: DocumentModelModule,
  ) => Promise<{ name: string }>;
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
