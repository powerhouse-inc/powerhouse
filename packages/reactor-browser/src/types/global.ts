import type {
  AppConfigUpdatedEvent,
  BasePathUpdatedEvent,
  ConnectCryptoUpdatedEvent,
  DidUpdatedEvent,
  DocumentsUpdatedEvent,
  DrivesUpdatedEvent,
  LoginStatusUpdatedEvent,
  ModalUpdatedEvent,
  ProcessorManagerUpdatedEvent,
  ReactorUpdatedEvent,
  RenownUpdatedEvent,
  SelectedDriveIdUpdatedEvent,
  SelectedNodeIdUpdatedEvent,
  SetAppConfigEvent,
  SetBasePathEvent,
  SetConnectCryptoEvent,
  SetDidEvent,
  SetDocumentsEvent,
  SetDrivesEvent,
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
import type { VetraPackage } from "./vetra.js";

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
    loading?: boolean | undefined;
    basePath?: string | undefined;
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
    phAppConfig?: AppConfig | undefined;
    phModal?: PHModal | undefined;
  }

  interface WindowEventMap {
    "ph:setBasePath": SetBasePathEvent;
    "ph:basePathUpdated": BasePathUpdatedEvent;
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
    "ph:setModal": SetModalEvent;
    "ph:modalUpdated": ModalUpdatedEvent;
  }
}
