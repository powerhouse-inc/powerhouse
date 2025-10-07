import type {
  AllowListUpdatedEvent,
  AnalyticsDatabaseNameUpdatedEvent,
  ConnectCryptoUpdatedEvent,
  DidUpdatedEvent,
  DocumentsUpdatedEvent,
  DrivesUpdatedEvent,
  IsSearchBarEnabledUpdatedEvent,
  LoginStatusUpdatedEvent,
  ModalUpdatedEvent,
  ProcessorManagerUpdatedEvent,
  ReactorUpdatedEvent,
  RenownUpdatedEvent,
  SelectedDriveIdUpdatedEvent,
  SelectedNodeIdUpdatedEvent,
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
  UserUpdatedEvent,
  VetraPackage,
  VetraPackagesUpdatedEvent,
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
    "ph:reactorUpdated": ReactorUpdatedEvent;
    "ph:setConnectCrypto": SetConnectCryptoEvent;
    "ph:connectCryptoUpdated": ConnectCryptoUpdatedEvent;
    "ph:setDid": SetDidEvent;
    "ph:didUpdated": DidUpdatedEvent;
    "ph:setRenown": SetRenownEvent;
    "ph:renownUpdated": RenownUpdatedEvent;
    "ph:setLoginStatus": SetLoginStatusEvent;
    "ph:loginStatusUpdated": LoginStatusUpdatedEvent;
    "ph:setUser": SetUserEvent;
    "ph:userUpdated": UserUpdatedEvent;
    "ph:setProcessorManager": SetProcessorManagerEvent;
    "ph:processorManagerUpdated": ProcessorManagerUpdatedEvent;
    "ph:setDrives": SetDrivesEvent;
    "ph:drivesUpdated": DrivesUpdatedEvent;
    "ph:setDocuments": SetDocumentsEvent;
    "ph:documentsUpdated": DocumentsUpdatedEvent;
    "ph:setVetraPackages": SetVetraPackagesEvent;
    "ph:vetraPackagesUpdated": VetraPackagesUpdatedEvent;
    "ph:setSelectedDriveId": SetSelectedDriveIdEvent;
    "ph:selectedDriveIdUpdated": SelectedDriveIdUpdatedEvent;
    "ph:setSelectedNodeId": SetSelectedNodeIdEvent;
    "ph:selectedNodeIdUpdated": SelectedNodeIdUpdatedEvent;
    "ph:setModal": SetModalEvent;
    "ph:modalUpdated": ModalUpdatedEvent;
    "ph:setAnalyticsDatabaseName": SetAnalyticsDatabaseNameEvent;
    "ph:analyticsDatabaseNameUpdated": AnalyticsDatabaseNameUpdatedEvent;
    "ph:setAllowList": SetAllowListEvent;
    "ph:allowListUpdated": AllowListUpdatedEvent;
    "ph:setIsSearchBarEnabled": SetIsSearchBarEnabledEvent;
    "ph:isSearchBarEnabledUpdated": IsSearchBarEnabledUpdatedEvent;
  }
}
