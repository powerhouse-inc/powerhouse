/* eslint-disable @typescript-eslint/require-await */
import type { PropsWithChildren } from "react";
import { createContext, useSyncExternalStore } from "react";
import { subscribeToDriveContext } from "../events/index.js";
import type { IDriveContext } from "../types/drive-editor.js";

const DriveContext = createContext<IDriveContext | undefined>(undefined);

/**
 * @deprecated This provider is no longer needed. The useDriveContext hook can be used directly
 * without wrapping your components in DriveContextProvider. The hook now reads from
 * window.phDriveContext directly, eliminating the need for this provider.
 *
 * @example
 * // Before (deprecated):
 * <DriveContextProvider value={driveContext}>
 *   <YourComponent />
 * </DriveContextProvider>
 *
 * // Now (recommended):
 * <YourComponent /> // Just use useDriveContext() directly in your component
 */
export const DriveContextProvider: React.FC<
  PropsWithChildren<{ value: IDriveContext }>
> = ({ value, children }) => (
  <DriveContext.Provider value={value}>{children}</DriveContext.Provider>
);

/**
 * Default drive context value.
 * Used when window.phDriveContext is not yet initialized.
 */
const DEFAULT_DRIVE_CONTEXT: IDriveContext = {
  onAddFile: async () => {},
  onAddFolder: async () => undefined,
  onRenameNode: async () => undefined,
  onCopyNode: async () => {},
  onMoveNode: async () => {},
  onDuplicateNode: async () => {},
  showCreateDocumentModal: () => {},
  showDeleteNodeModal: () => {},
};

/**
 * Hook to access the drive context values provided by the host application.
 * This hook reads from window.phDriveContext instead of requiring a DriveContextProvider.
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
export function useDriveContext(): IDriveContext {
  const driveContext = useSyncExternalStore(
    subscribeToDriveContext,
    () => window.phDriveContext,
  );
  return driveContext ?? DEFAULT_DRIVE_CONTEXT;
}
