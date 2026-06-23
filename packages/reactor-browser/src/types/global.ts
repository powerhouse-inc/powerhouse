import type { PGlite } from "@electric-sql/pglite";
import type {
  InProcessReactorClientModule,
  InProcessReactorModule,
  IReactorClient,
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
import type { TimelineItem } from "./timeline.js";
import type { PHToastFn } from "./toast.js";
import type { IPackageManager } from "./vetra.js";
import type { DraggingNode } from "../hooks/node-drag-and-drop.js";

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
}

export type LOADING = null;

export type PHGlobal = PHGlobalConfig & {
  loading?: boolean;
  reactorClientModule?: BrowserReactorClientModule | WorkerReactorClientModule;
  reactorClient?: IReactorClient;
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
  revisionHistoryVisible?: boolean;
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
