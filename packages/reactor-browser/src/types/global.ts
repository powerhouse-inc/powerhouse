import type { PGlite } from "@electric-sql/pglite";
import type {
  Database,
  IReactorClient,
  ReactorClientModule,
} from "@powerhousedao/reactor";
import type { DID, IConnectCrypto, IRenown, User } from "@renown/sdk";
import type {
  DocumentDriveDocument,
  IDocumentDriveServer,
} from "document-drive";
import type { Kysely } from "kysely";
import type { PHGlobalConfig } from "./config.js";
import type { IDocumentCache } from "./documents.js";
import type { PHModal } from "./modals.js";
import type { TimelineItem } from "./timeline.js";
import type { PHToastFn } from "./toast.js";
import type { VetraPackage } from "./vetra.js";

export type BrowserReactorClientModule = ReactorClientModule & {
  pg: PGlite;
};

export type PHGlobal = PHGlobalConfig & {
  loading?: boolean;
  legacyReactor?: IDocumentDriveServer;
  reactorClientModule?: BrowserReactorClientModule;
  reactorClient?: IReactorClient;
  database?: Kysely<Database>;
  pglite?: PGlite;
  connectCrypto?: IConnectCrypto;
  did?: DID;
  renown?: IRenown;
  user?: User;
  loginStatus?: LoginStatus;
  vetraPackages?: VetraPackage[];
  drives?: DocumentDriveDocument[];
  documentCache?: IDocumentCache;
  selectedDriveId?: string;
  selectedNodeId?: string;
  modal?: PHModal;
  selectedTimelineRevision?: string | number | null;
  revisionHistoryVisible?: boolean;
  selectedTimelineItem?: TimelineItem | null;
  features?: Map<string, boolean>;
  toast?: PHToastFn;
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

export type PHGlobalEventHandlerAdders = Record<
  PHGlobalKey,
  AddPHGlobalEventHandler
>;

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
