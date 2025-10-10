import type { DID, IConnectCrypto, IRenown, User } from "@renown/sdk";

import type {
  DocumentDriveDocument,
  IDocumentDriveServer,
  ProcessorManager,
} from "document-drive";
import type { PHDocument } from "document-model";
import type { PHGlobalConfig } from "./config.js";
import type { PHModal } from "./modals.js";
import type { VetraPackage } from "./vetra.js";

export type PHGlobal = PHGlobalConfig & {
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
    ph?: PHGlobal;
  }
}
