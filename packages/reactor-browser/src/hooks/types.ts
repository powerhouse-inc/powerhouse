import type {
  PHGlobal,
  PHGlobalKey,
  PHGlobalValue,
} from "@powerhousedao/reactor-browser";

export type UsePHGlobalValue<TValue extends PHGlobalValue> = () =>
  | TValue
  | undefined;

export type SetPHGlobalValue<TValue extends PHGlobalValue> = (
  value: TValue | undefined,
) => void;

export type AddPHGlobalEventHandler = () => void;

export type SetEvent<TKey extends PHGlobalKey> = CustomEvent<{
  [key in TKey]: PHGlobal[TKey] | undefined;
}>;
export type SetReactorEvent = SetEvent<"reactor">;
export type SetConnectCryptoEvent = SetEvent<"connectCrypto">;
export type SetDidEvent = SetEvent<"did">;
export type SetRenownEvent = SetEvent<"renown">;
export type SetLoginStatusEvent = SetEvent<"loginStatus">;
export type SetUserEvent = SetEvent<"user">;
export type SetProcessorManagerEvent = SetEvent<"processorManager">;
export type SetDrivesEvent = SetEvent<"drives">;

export type SetDocumentsEvent = SetEvent<"documents">;

export type SetSelectedDriveIdEvent = SetEvent<"selectedDriveId">;

export type SetSelectedNodeIdEvent = SetEvent<"selectedNodeId">;

export type SetVetraPackagesEvent = SetEvent<"vetraPackages">;

export type SetModalEvent = SetEvent<"modal">;

export type SetAnalyticsDatabaseNameEvent = SetEvent<"analyticsDatabaseName">;

export type SetAllowListEvent = SetEvent<"allowList">;

export type SetIsSearchBarEnabledEvent = SetEvent<"isSearchBarEnabled">;

export type SetIsExternalControlsEnabledEvent =
  SetEvent<"isExternalControlsEnabled">;

export type SetIsDocumentToolbarEnabledEvent =
  SetEvent<"isDocumentToolbarEnabled">;
export type SetIsSwitchboardLinkEnabledEvent =
  SetEvent<"isSwitchboardLinkEnabled">;

export type SetIsDragAndDropEnabledEvent = SetEvent<"isDragAndDropEnabled">;

export type SetIsTimelineEnabledEvent = SetEvent<"isTimelineEnabled">;

export type SetIsEditorDebugModeEnabledEvent =
  SetEvent<"isEditorDebugModeEnabled">;

export type SetIsEditorReadModeEnabledEvent =
  SetEvent<"isEditorReadModeEnabled">;

export type SetSelectedTimelineRevisionEvent =
  SetEvent<"selectedTimelineRevision">;

export type LoginStatus =
  | "initial"
  | "checking"
  | "not-authorized"
  | "authorized";
