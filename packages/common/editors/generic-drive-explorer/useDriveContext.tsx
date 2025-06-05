import { type DocumentModelModule } from "document-model";
import { createContext, type PropsWithChildren, useContext } from "react";
import { type DriveNodeActionHandlers } from "./types.js";

/**
 * Interface representing the context values provided by the host application
 * for managing document drive functionality.
 */
export type TDriveContext = DriveNodeActionHandlers & {
  /** Controls the visibility of the search bar in the drive interface */
  showSearchBar: boolean;

  /** Indicates whether the current user has permissions to create new documents */
  isAllowedToCreateDocuments: boolean;

  /** Array of available document models that can be created */
  documentModels: DocumentModelModule[];
};

const DriveContext = createContext<TDriveContext | undefined>(undefined);

export const DriveContextProvider: React.FC<
  PropsWithChildren<{ value: TDriveContext }>
> = ({ value, children }) => (
  <DriveContext.Provider value={value}>{children}</DriveContext.Provider>
);

/**
 * Hook to access the drive context values provided by the host application.
 * Must be used within a DriveContextProvider component.
 *
 * @returns TDriveContext - Object containing drive-related values and functions
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
