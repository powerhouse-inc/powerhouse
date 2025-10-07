import type {
  SetAllowListEvent,
  SetAnalyticsDatabaseNameEvent,
  SetConnectCryptoEvent,
  SetDidEvent,
  SetDocumentsEvent,
  SetDrivesEvent,
  SetIsSearchBarEnabledEvent,
  SetLoginStatusEvent,
  SetModalEvent,
  SetProcessorManagerEvent,
  SetReactorEvent,
  SetRenownEvent,
  SetSelectedDriveIdEvent,
  SetSelectedNodeIdEvent,
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

export type UserPermissions = {
  isAllowedToCreateDocuments: boolean;
  isAllowedToEditDocuments: boolean;
};

export type LoginStatus =
  | "initial"
  | "checking"
  | "not-authorized"
  | "authorized";

declare global {
  interface Window {
    loading?: boolean | undefined;
    reactor?: IDocumentDriveServer | undefined;
    connectCrypto?: IConnectCrypto | undefined;
    did?: DID | undefined;
    renown?: IRenown | undefined;
    user?: User | undefined;
    loginStatus?: LoginStatus | undefined;
    vetraPackages?: VetraPackage[] | undefined;
    phProcessorManager?: ProcessorManager | undefined;
    phDrives?: DocumentDriveDocument[] | undefined;
    phDocuments?: PHDocument[] | undefined;
    phSelectedDriveId?: string | undefined;
    phSelectedNodeId?: string | undefined;
    phModal?: PHModal | undefined;
    analyticsDatabaseName?: string;
    allowList?: string[];
    isSearchBarEnabled?: boolean | undefined;
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
  }
}
