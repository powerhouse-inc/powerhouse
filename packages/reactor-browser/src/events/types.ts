import type { IRenown, User } from "@renown/sdk";
import type { DocumentDriveDocument, ProcessorManager } from "document-drive";
import type { PHDocument } from "document-model";
import type { DID, IConnectCrypto } from "../crypto/index.js";
import type { AppConfig, LoginStatus } from "../types/global.js";
import type { Reactor } from "../types/reactor.js";
import type { VetraPackage } from "../types/vetra.js";

export type SetReactorEvent = CustomEvent<{
  reactor: Reactor | undefined;
}>;
export type ReactorUpdatedEvent = CustomEvent;

export type SetConnectCryptoEvent = CustomEvent<{
  connectCrypto: IConnectCrypto | undefined;
}>;
export type ConnectCryptoUpdatedEvent = CustomEvent;

export type SetDidEvent = CustomEvent<{
  did: DID | undefined;
}>;
export type DidUpdatedEvent = CustomEvent;

export type SetRenownEvent = CustomEvent<{
  renown: IRenown | undefined;
}>;
export type RenownUpdatedEvent = CustomEvent;

export type SetLoginStatusEvent = CustomEvent<{
  loginStatus: LoginStatus | undefined;
}>;
export type LoginStatusUpdatedEvent = CustomEvent;

export type SetUserEvent = CustomEvent<{
  user: User | undefined;
}>;
export type UserUpdatedEvent = CustomEvent;

export type SetProcessorManagerEvent = CustomEvent<{
  processorManager: ProcessorManager | undefined;
}>;
export type ProcessorManagerUpdatedEvent = CustomEvent;

export type SetDrivesEvent = CustomEvent<{
  drives: DocumentDriveDocument[] | undefined;
}>;
export type DrivesUpdatedEvent = CustomEvent;

export type SetDocumentsEvent = CustomEvent<{
  documents: PHDocument[] | undefined;
}>;
export type DocumentsUpdatedEvent = CustomEvent;

export type SetSelectedDriveIdEvent = CustomEvent<{
  driveSlug: string | undefined;
}>;
export type SelectedDriveIdUpdatedEvent = CustomEvent;

export type SetSelectedNodeIdEvent = CustomEvent<{
  nodeSlug: string | undefined;
}>;
export type SelectedNodeIdUpdatedEvent = CustomEvent;
export type SetVetraPackagesEvent = CustomEvent<{
  vetraPackages: VetraPackage[] | undefined;
}>;
export type VetraPackagesUpdatedEvent = CustomEvent;

export type SetAppConfigEvent = CustomEvent<{
  appConfig: AppConfig | undefined;
}>;
export type AppConfigUpdatedEvent = CustomEvent;
