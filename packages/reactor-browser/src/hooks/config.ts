import { makePHEventFunctions } from "./make-ph-event-functions.js";

export const {
  useValue: useBasePath,
  setValue: setBasePath,
  addEventHandler: addBasePathEventHandler,
} = makePHEventFunctions("basePath");

export const {
  useValue: useAnalyticsDatabaseName,
  setValue: setAnalyticsDatabaseName,
  addEventHandler: addAnalyticsDatabaseNameEventHandler,
} = makePHEventFunctions("analyticsDatabaseName");

export const {
  useValue: useAllowList,
  setValue: setAllowList,
  addEventHandler: addAllowListEventHandler,
} = makePHEventFunctions("allowList");

export const {
  useValue: useIsSearchBarEnabled,
  setValue: setIsSearchBarEnabled,
  addEventHandler: addIsSearchBarEnabledEventHandler,
} = makePHEventFunctions("isSearchBarEnabled");

export function enableSearchBar() {
  setIsSearchBarEnabled(true);
}

export function disableSearchBar() {
  setIsSearchBarEnabled(false);
}

export const {
  useValue: useIsExternalControlsEnabled,
  setValue: setIsExternalControlsEnabled,
  addEventHandler: addIsExternalControlsEnabledEventHandler,
} = makePHEventFunctions("isExternalControlsEnabled");

export function enableExternalControls() {
  setIsExternalControlsEnabled(true);
}

export function disableExternalControls() {
  setIsExternalControlsEnabled(false);
}

export const {
  useValue: useIsDocumentToolbarEnabled,
  setValue: setIsDocumentToolbarEnabled,
  addEventHandler: addIsDocumentToolbarEnabledEventHandler,
} = makePHEventFunctions("isDocumentToolbarEnabled");

export function enableDocumentToolbar() {
  setIsDocumentToolbarEnabled(true);
}

export function disableDocumentToolbar() {
  setIsDocumentToolbarEnabled(false);
}

export const {
  useValue: useIsSwitchboardLinkEnabled,
  setValue: setIsSwitchboardLinkEnabled,
  addEventHandler: addIsSwitchboardLinkEnabledEventHandler,
} = makePHEventFunctions("isSwitchboardLinkEnabled");

export function enableSwitchboardLink() {
  setIsSwitchboardLinkEnabled(true);
}

export function disableSwitchboardLink() {
  setIsSwitchboardLinkEnabled(false);
}

export const {
  useValue: useIsDragAndDropEnabled,
  setValue: setIsDragAndDropEnabled,
  addEventHandler: addIsDragAndDropEnabledEventHandler,
} = makePHEventFunctions("isDragAndDropEnabled");

export function enableDragAndDrop() {
  setIsDragAndDropEnabled(true);
}

export function disableDragAndDrop() {
  setIsDragAndDropEnabled(false);
}

export const {
  useValue: useIsTimelineEnabled,
  setValue: setIsTimelineEnabled,
  addEventHandler: addIsTimelineEnabledEventHandler,
} = makePHEventFunctions("isTimelineEnabled");

export function enableTimeline() {
  setIsTimelineEnabled(true);
}

export const {
  useValue: useIsEditorDebugModeEnabled,
  setValue: setIsEditorDebugModeEnabled,
  addEventHandler: addIsEditorDebugModeEnabledEventHandler,
} = makePHEventFunctions("isEditorDebugModeEnabled");

export function enableEditorDebugMode() {
  setIsEditorDebugModeEnabled(true);
}

export function disableEditorDebugMode() {
  setIsEditorDebugModeEnabled(false);
}

export const {
  useValue: useIsEditorReadModeEnabled,
  setValue: setIsEditorReadModeEnabled,
  addEventHandler: addIsEditorReadModeEnabledEventHandler,
} = makePHEventFunctions("isEditorReadModeEnabled");

export function enableEditorReadMode() {
  setIsEditorReadModeEnabled(true);
}

export function disableEditorReadMode() {
  setIsEditorReadModeEnabled(false);
}
