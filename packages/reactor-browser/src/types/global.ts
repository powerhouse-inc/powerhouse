import type { PGlite } from "@electric-sql/pglite";
import type {
  InProcessReactorClientModule,
  IReactorClient,
  InProcessReactorModule,
  ReactorClientModule,
  ReactorModule,
} from "@powerhousedao/reactor";
import type { IAttachmentService } from "@powerhousedao/reactor-attachments/client";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import type { IRenown } from "@renown/sdk";
import type {
  GraphQLClientWindowEvents,
  ReactorGraphQLClient,
} from "../graphql/types.js";
import type { PHGlobalConfig } from "./config.js";
import type { IDocumentCache } from "./documents.js";
import type { PHModal } from "./modals.js";
import type { IPackageDiscoveryService } from "./package-discovery.js";
import type {
  IReactorBrowserClient,
  ReactorBrowserHalves,
} from "./reactor-browser-client.js";
import type { TimelineItem } from "./timeline.js";
import type { PHToastFn } from "./toast.js";
import type { IPackageManager } from "./vetra.js";
import type { DraggingNode } from "../hooks/node-drag-and-drop.js";
import type { IWorkerAdminClient } from "../rpc/admin-client.js";
import type { IInspectorProxy } from "../rpc/inspector-proxy.js";
import type { WorkerPackageSource } from "@powerhousedao/reactor/rpc";

// Browser in-process module: the full reactor graph plus the PGlite handle.
export interface BrowserReactorModule extends InProcessReactorModule {
  pg: PGlite;
}
export interface BrowserReactorClientModule extends InProcessReactorClientModule {
  kind: "browser";
  reactorModule: BrowserReactorModule | undefined;
}

// Worker-backed tab module: resolves only the base ReactorModule contract
// (tab-local registry + sync-manager proxy); the full graph lives in the worker.
export type WorkerReactorModule = ReactorModule;
export interface WorkerReactorClientModule extends ReactorClientModule {
  kind: "worker";
  reactorModule: WorkerReactorModule;
  adminClient: IWorkerAdminClient;
  inspector: IInspectorProxy;
  /**
   * Loads (or, for a source already loaded, REPLACES) URL-addressed packages
   * in the worker's registry. A vetra watch rebuild re-sends the project's
   * models through this with a cache-busted URL. `specs` are registry packages
   * (`name@version`), replaced when their version changes.
   */
  registerPackages: (
    sources: WorkerPackageSource[],
    specs?: string[],
  ) => Promise<void>;
}

export type LOADING = null;

/** A drive, or a node in it. */
export type PHDriveTarget = { driveSlug: string; nodeSlug?: string };

/** A settings tab by id; `true` opens the first one. */
export type PHSettingsTarget = { settings: string | true };

/** What the app shows; `undefined` targets home. */
export type PHNavigationTarget = PHDriveTarget | PHSettingsTarget;

/** Query params to write; an `undefined` value removes the param. */
export type PHSearchUpdate = Record<string, string | undefined>;

export type PHNavigateOptions = {
  replace?: boolean;
  /** The target's own query params; the host decides which others survive. */
  search?: PHSearchUpdate;
};

/** Merges an object into the current query params; a function returns them all. */
export type SearchParamsUpdate =
  | PHSearchUpdate
  | ((prev: Record<string, string>) => PHSearchUpdate);

export type SetSearchParams = (
  update: SearchParamsUpdate,
  options?: { replace?: boolean },
) => void;

/** Host-owned navigation and URL state; without one, the browser history is used.
 * Set once on the store; its hooks must not change between renders. */
export type PHNavigation = {
  location(): { pathname: string; search: string };
  open(
    target: PHNavigationTarget | undefined,
    options?: PHNavigateOptions,
  ): void;
  /** The public href that opens `target`, base path included. */
  hrefFor?(target: PHNavigationTarget | undefined): string;
  /** Whether `target` is what the location shows now; search params aside. */
  useIsCurrent?(target: PHNavigationTarget | undefined): boolean;
  /** Warms what `target` shows, e.g. on hover; optional. */
  preload?(target: PHNavigationTarget | undefined): void;
  /** Replaces the query params with what `update` returns, keeping the path. */
  setSearch(
    update: (prev: Record<string, string>) => PHSearchUpdate,
    options?: { replace?: boolean },
  ): void;
  /** The current query params. */
  useSearchParams(): Record<string, string>;
  /** A stable setter for the query params. */
  useSetSearchParams(): SetSearchParams;
  /** Returns to the entry from before the open document was opened, past any
   * pushed inside it; false when this session didn't open it. */
  closeOpened?(): boolean;
};

export type PHGlobal = PHGlobalConfig & {
  navigation?: PHNavigation;
  loading?: boolean;
  reactorClientModule?: BrowserReactorClientModule | WorkerReactorClientModule;
  reactorClient?: IReactorBrowserClient;
  /** The client halves of `reactorClient`, set with it: reads and writes. */
  reactor?: ReactorBrowserHalves;
  /** Replaces `reactorClientModule.client` in full-client actions; Connect's router. */
  fullReactorClient?: IReactorClient;
  attachmentService?: IAttachmentService;
  reactorGraphQLClient?: ReactorGraphQLClient | undefined;
  renown?: IRenown | LOADING;
  vetraPackageManager?: IPackageManager;
  drives?: DocumentDriveDocument[];
  documentCache?: IDocumentCache;
  selectedDriveId?: string;
  selectedNodeId?: string;
  draggingNode?: DraggingNode;
  modal?: PHModal;
  selectedTimelineRevision?: string | number | null;
  selectedTimelineItem?: TimelineItem | null;
  packageDiscoveryService?: IPackageDiscoveryService;
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

declare global {
  interface Window {
    ph?: PHGlobal;
  }
  interface WindowEventMap extends GraphQLClientWindowEvents {}
}
