import type {
  AppConfigUpdatedEvent,
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
    phAppConfig?: AppConfig | undefined;
    phModal?: PHModal | undefined;
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
    "ph:setModal": SetModalEvent;
    "ph:modalUpdated": ModalUpdatedEvent;
  }
}
