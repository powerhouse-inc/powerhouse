import { createContext, type PropsWithChildren, useContext } from "react";
import { type IDriveContext } from "../types/drive-editor.js";

export { type IDriveContext } from "../types/drive-editor.js";

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
