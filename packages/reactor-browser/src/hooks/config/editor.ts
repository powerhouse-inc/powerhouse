import type {
  PHDocumentEditorConfigHooks,
  PHDocumentEditorConfigSetters,
  PHDriveEditorConfigHooks,
  PHDriveEditorConfigSetters,
} from "@powerhousedao/reactor-browser";
import { makePHEventFunctions } from "../make-ph-event-functions.js";

export const isExternalControlsEnabledEventFunctions = makePHEventFunctions(
  "isExternalControlsEnabled",
);

/** Sets whether external controls are enabled for a given editor. */
export const setIsExternalControlsEnabled =
  isExternalControlsEnabledEventFunctions.setValue;

/** Gets whether external controls are enabled for a given editor. */
export const useIsExternalControlsEnabled =
  isExternalControlsEnabledEventFunctions.useValue;

/** Adds an event handler for when the external controls enabled state changes. */
export const addIsExternalControlsEnabledEventHandler =
  isExternalControlsEnabledEventFunctions.addEventHandler;

const isDragAndDropEnabledEventFunctions = makePHEventFunctions(
  "isDragAndDropEnabled",
);

/** Sets whether drag and drop is enabled for a given drive editor. */
export const setIsDragAndDropEnabled =
  isDragAndDropEnabledEventFunctions.setValue;

/** Gets whether drag and drop is enabled for a given drive editor. */
export const useIsDragAndDropEnabled =
  isDragAndDropEnabledEventFunctions.useValue;

/** Adds an event handler for when the drag and drop enabled state changes. */
export const addIsDragAndDropEnabledEventHandler =
  isDragAndDropEnabledEventFunctions.addEventHandler;

const allowedDocumentTypesEventFunctions = makePHEventFunctions(
  "allowedDocumentTypes",
);

/** Sets the allowed document types for a given drive editor. */
export const setAllowedDocumentTypes =
  allowedDocumentTypesEventFunctions.setValue;

/** Defines the document types a drive supports.
 *
 * Defaults to all of the document types registered in the reactor.
 */
export function useAllowedDocumentTypes() {
  const definedAllowedDocumentTypes =
    allowedDocumentTypesEventFunctions.useValue();
  return definedAllowedDocumentTypes;
}

/** Adds an event handler for when the allowed document types for a given drive editor changes. */
export const addAllowedDocumentTypesEventHandler =
  allowedDocumentTypesEventFunctions.addEventHandler;

export const phDriveEditorConfigSetters: PHDriveEditorConfigSetters = {
  allowedDocumentTypes: setAllowedDocumentTypes,
  isDragAndDropEnabled: setIsDragAndDropEnabled,
};

export const phDocumentEditorConfigSetters: PHDocumentEditorConfigSetters = {
  isExternalControlsEnabled: setIsExternalControlsEnabled,
};

export const phDriveEditorConfigHooks: PHDriveEditorConfigHooks = {
  allowedDocumentTypes: useAllowedDocumentTypes,
  isDragAndDropEnabled: useIsDragAndDropEnabled,
};

export const phDocumentEditorConfigHooks: PHDocumentEditorConfigHooks = {
  isExternalControlsEnabled: useIsExternalControlsEnabled,
};
