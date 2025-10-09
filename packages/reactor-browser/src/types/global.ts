import type {
  LoginStatus,
  SetAllowListEvent,
  SetAnalyticsDatabaseNameEvent,
  SetConnectCryptoEvent,
  SetDidEvent,
  SetDocumentsEvent,
  SetDrivesEvent,
  SetIsDocumentToolbarEnabledEvent,
  SetIsDragAndDropEnabledEvent,
  SetIsEditorDebugModeEnabledEvent,
  SetIsEditorReadModeEnabledEvent,
  SetIsExternalControlsEnabledEvent,
  SetIsSearchBarEnabledEvent,
  SetIsSwitchboardLinkEnabledEvent,
  SetIsTimelineEnabledEvent,
  SetLoginStatusEvent,
  SetModalEvent,
  SetProcessorManagerEvent,
  SetReactorEvent,
  SetRenownEvent,
  SetSelectedDriveIdEvent,
  SetSelectedNodeIdEvent,
  SetSelectedTimelineRevisionEvent,
  SetUserEvent,
  SetVetraPackagesEvent,
  VetraPackage,
} from "@powerhousedao/reactor-browser";
import type { DID, IConnectCrypto, IRenown, User } from "@renown/sdk";

import type {
  DocumentDriveDocument,
  IDocumentDriveServer,
  ProcessorManager,
} from "document-drive";
import type { PHDocument } from "document-model";
import type { PHModal } from "./modals.js";

export type PHGlobal = {
  loading?: boolean;
  reactor?: IDocumentDriveServer;
  connectCrypto?: IConnectCrypto;
  did?: DID;
  renown?: IRenown;
  user?: User;
  loginStatus?: LoginStatus;
  vetraPackages?: VetraPackage[];
  processorManager?: ProcessorManager;
  drives?: DocumentDriveDocument[];
  documents?: PHDocument[];
  selectedDriveId?: string;
  selectedNodeId?: string;
  modal?: PHModal;
  analyticsDatabaseName?: string;
  allowList?: string[];
  isSearchBarEnabled?: boolean;
  isExternalControlsEnabled?: boolean;
  isDocumentToolbarEnabled?: boolean;
  isSwitchboardLinkEnabled?: boolean;
  isDragAndDropEnabled?: boolean;
  isTimelineEnabled?: boolean;
  isEditorDebugModeEnabled?: boolean;
  isEditorReadModeEnabled?: boolean;
  selectedTimelineRevision?: string | number | null;
};

export type PHGlobalKey = keyof PHGlobal;
export type PHGlobalValue = PHGlobal[PHGlobalKey];

declare global {
  interface Window {
    ph?: PHGlobal;
  }

  interface WindowEventMap {
    "ph:setReactor": SetReactorEvent;
    "ph:reactorUpdated": CustomEvent;
    "ph:setConnectCrypto": SetConnectCryptoEvent;
    "ph:connectCryptoUpdated": CustomEvent;
    "ph:setDid": SetDidEvent;
    "ph:didUpdated": CustomEvent;
    "ph:setRenown": SetRenownEvent;
    "ph:renownUpdated": CustomEvent;
    "ph:setLoginStatus": SetLoginStatusEvent;
    "ph:loginStatusUpdated": CustomEvent;
    "ph:setUser": SetUserEvent;
    "ph:userUpdated": CustomEvent;
    "ph:setProcessorManager": SetProcessorManagerEvent;
    "ph:processorManagerUpdated": CustomEvent;
    "ph:setDrives": SetDrivesEvent;
    "ph:drivesUpdated": CustomEvent;
    "ph:setDocuments": SetDocumentsEvent;
    "ph:documentsUpdated": CustomEvent;
    "ph:setVetraPackages": SetVetraPackagesEvent;
    "ph:vetraPackagesUpdated": CustomEvent;
    "ph:setSelectedDriveId": SetSelectedDriveIdEvent;
    "ph:selectedDriveIdUpdated": CustomEvent;
    "ph:setSelectedNodeId": SetSelectedNodeIdEvent;
    "ph:selectedNodeIdUpdated": CustomEvent;
    "ph:setModal": SetModalEvent;
    "ph:modalUpdated": CustomEvent;
    "ph:setAnalyticsDatabaseName": SetAnalyticsDatabaseNameEvent;
    "ph:analyticsDatabaseNameUpdated": CustomEvent;
    "ph:setAllowList": SetAllowListEvent;
    "ph:allowListUpdated": CustomEvent;
    "ph:setIsSearchBarEnabled": SetIsSearchBarEnabledEvent;
    "ph:isSearchBarEnabledUpdated": CustomEvent;
    "ph:setIsExternalControlsEnabled": SetIsExternalControlsEnabledEvent;
    "ph:isExternalControlsEnabledUpdated": CustomEvent;
    "ph:setIsDocumentToolbarEnabled": SetIsDocumentToolbarEnabledEvent;
    "ph:isDocumentToolbarEnabledUpdated": CustomEvent;
    "ph:setIsSwitchboardLinkEnabled": SetIsSwitchboardLinkEnabledEvent;
    "ph:isSwitchboardLinkEnabledUpdated": CustomEvent;
    "ph:setIsDragAndDropEnabled": SetIsDragAndDropEnabledEvent;
    "ph:isDragAndDropEnabledUpdated": CustomEvent;
    "ph:setIsTimelineEnabled": SetIsTimelineEnabledEvent;
    "ph:isTimelineEnabledUpdated": CustomEvent;
    "ph:setIsEditorDebugModeEnabled": SetIsEditorDebugModeEnabledEvent;
    "ph:isEditorDebugModeEnabledUpdated": CustomEvent;
    "ph:setIsEditorReadModeEnabled": SetIsEditorReadModeEnabledEvent;
    "ph:isEditorReadModeEnabledUpdated": CustomEvent;
    "ph:setSelectedTimelineRevision": SetSelectedTimelineRevisionEvent;
    "ph:selectedTimelineRevisionUpdated": CustomEvent;
  }
}
