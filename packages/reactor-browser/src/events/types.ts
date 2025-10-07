import type {
  LoginStatus,
  Reactor,
  VetraPackage,
} from "@powerhousedao/reactor-browser";
import type { DID, IConnectCrypto, IRenown, User } from "@renown/sdk";
import type { DocumentDriveDocument, ProcessorManager } from "document-drive";
import type { PHDocument } from "document-model";
import type { PHModal } from "../types/modals.js";

type SetEvent<TKey extends string, TValue> = CustomEvent<{
  [key in TKey]: TValue | undefined;
}>;
export type SetReactorEvent = SetEvent<"reactor", Reactor>;
export type SetConnectCryptoEvent = SetEvent<"connectCrypto", IConnectCrypto>;
export type SetDidEvent = SetEvent<"did", DID>;
export type SetRenownEvent = SetEvent<"renown", IRenown>;
export type SetLoginStatusEvent = SetEvent<"loginStatus", LoginStatus>;
export type SetUserEvent = SetEvent<"user", User>;
export type SetProcessorManagerEvent = SetEvent<
  "processorManager",
  ProcessorManager
>;
export type SetDrivesEvent = SetEvent<"drives", DocumentDriveDocument[]>;

export type SetDocumentsEvent = SetEvent<"documents", PHDocument[]>;

export type SetSelectedDriveIdEvent = SetEvent<"driveSlug", string>;

export type SetSelectedNodeIdEvent = SetEvent<"nodeSlug", string>;

export type SetVetraPackagesEvent = SetEvent<"vetraPackages", VetraPackage[]>;

export type SetAnalyticsDatabaseNameEvent = SetEvent<
  "analyticsDatabaseName",
  string
>;

export type SetAllowListEvent = SetEvent<"allowList", string[]>;

export type SetIsSearchBarEnabledEvent = SetEvent<
  "isSearchBarEnabled",
  boolean
>;

export type SetModalEvent = SetEvent<"modal", PHModal>;
