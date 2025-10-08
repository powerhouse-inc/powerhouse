import { makePHEventFunctions } from "./make-ph-event-functions.js";

export const {
  useValue: useAnalyticsDatabaseName,
  setValue: setAnalyticsDatabaseName,
  addEventHandler: addAnalyticsDatabaseNameEventHandler,
} = makePHEventFunctions<string>("analyticsDatabaseName");

export const {
  useValue: useAllowList,
  setValue: setAllowList,
  addEventHandler: addAllowListEventHandler,
} = makePHEventFunctions<string[]>("allowList");

export const {
  useValue: useIsSearchBarEnabled,
  setValue: setIsSearchBarEnabled,
  addEventHandler: addIsSearchBarEnabledEventHandler,
} = makePHEventFunctions<boolean>("isSearchBarEnabled");

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
} = makePHEventFunctions<boolean>("isExternalControlsEnabled");

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
} = makePHEventFunctions<boolean>("isDocumentToolbarEnabled");

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
} = makePHEventFunctions<boolean>("isSwitchboardLinkEnabled");

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
} = makePHEventFunctions<boolean>("isDragAndDropEnabled");

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
} = makePHEventFunctions<boolean>("isTimelineEnabled");

export function enableTimeline() {
  setIsTimelineEnabled(true);
}

export const {
  useValue: useIsEditorDebugModeEnabled,
  setValue: setIsEditorDebugModeEnabled,
  addEventHandler: addIsEditorDebugModeEnabledEventHandler,
} = makePHEventFunctions<boolean>("isEditorDebugModeEnabled");

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
} = makePHEventFunctions<boolean>("isEditorReadModeEnabled");

export function enableEditorReadMode() {
  setIsEditorReadModeEnabled(true);
}

export function disableEditorReadMode() {
  setIsEditorReadModeEnabled(false);
}
