import { type IRenown, type User } from "@renown/sdk";
import {
  type DocumentDriveDocument,
  type IDocumentAdminStorage,
  type IDocumentDriveServer,
  type IDocumentOperationStorage,
  type IDocumentStorage,
  type IDriveOperationStorage,
  type ProcessorManager,
} from "document-drive";
import { type PHDocument } from "document-model";
import { type DID, type IConnectCrypto } from "../crypto/index.js";
import {
  type AppConfigUpdatedEvent,
  type ConnectCryptoUpdatedEvent,
  type DidUpdatedEvent,
  type DocumentsUpdatedEvent,
  type DrivesUpdatedEvent,
  type LoginStatusUpdatedEvent,
  type ProcessorManagerUpdatedEvent,
  type ReactorUpdatedEvent,
  type RenownUpdatedEvent,
  type SelectedDriveIdUpdatedEvent,
  type SelectedNodeIdUpdatedEvent,
  type SetAppConfigEvent,
  type SetConnectCryptoEvent,
  type SetDidEvent,
  type SetDocumentsEvent,
  type SetDrivesEvent,
  type SetLoginStatusEvent,
  type SetProcessorManagerEvent,
  type SetReactorEvent,
  type SetRenownEvent,
  type SetSelectedDriveIdEvent,
  type SetSelectedNodeIdEvent,
  type SetUserEvent,
  type SetVetraPackagesEvent,
  type UserUpdatedEvent,
  type VetraPackagesUpdatedEvent,
} from "../events/types.js";
import { type VetraPackage } from "./vetra.js";

export type UserPermissions = {
  isAllowedToCreateDocuments: boolean;
  isAllowedToEditDocuments: boolean;
};

export type LoginStatus =
  | "initial"
  | "checking"
  | "not-authorized"
  | "authorized";

export type AppConfig = {
  showSearchBar?: boolean;
  analyticsDatabaseName?: string;
  allowList?: string[];
};

declare global {
  interface Window {
    reactor?: IDocumentDriveServer | undefined;
    phStorage?: IDriveOperationStorage &
      IDocumentOperationStorage &
      IDocumentStorage &
      IDocumentAdminStorage;
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
    phAppConfig?: AppConfig | undefined;
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
    "ph:setAppConfig": SetAppConfigEvent;
    "ph:appConfigUpdated": AppConfigUpdatedEvent;
  }
}
