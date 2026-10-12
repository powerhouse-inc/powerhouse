import type { PGlite } from "@electric-sql/pglite";
import type {
  Database,
  IDocumentModelRegistry,
  IReactorClient,
  ISyncManager,
} from "@powerhousedao/reactor";
import type {
  AddPHGlobalEventHandler,
  BrowserReactorClientModule,
  IReactorBrowserClient,
  SetPHGlobalValue,
  UsePHGlobalValue,
  WorkerReactorClientModule,
} from "@powerhousedao/reactor-browser";
import type { Kysely } from "kysely";
import { makePHEventFunctions } from "./make-ph-event-functions.js";

const reactorClientModuleEventFunctions = makePHEventFunctions(
  "reactorClientModule",
);
const reactorClientEventFunctions = makePHEventFunctions("reactorClient");
const fullReactorClientEventFunctions =
  makePHEventFunctions("fullReactorClient");

/** Returns the reactor client module (in-process or worker-backed) */
export const useReactorClientModule: UsePHGlobalValue<
  BrowserReactorClientModule | WorkerReactorClientModule
> = reactorClientModuleEventFunctions.useValue;

/** Sets the reactor client module */
export const setReactorClientModule: SetPHGlobalValue<
  BrowserReactorClientModule | WorkerReactorClientModule
> = reactorClientModuleEventFunctions.setValue;

/** Adds an event handler for the reactor client module */
export const addReactorClientModuleEventHandler: AddPHGlobalEventHandler =
  reactorClientModuleEventFunctions.addEventHandler;

/** Returns the reactor client */
export const useReactorClient: UsePHGlobalValue<IReactorBrowserClient> =
  reactorClientEventFunctions.useValue;

/** Sets the reactor client */
export const setReactorClient: SetPHGlobalValue<IReactorBrowserClient> =
  reactorClientEventFunctions.setValue;

/** Adds an event handler for the reactor client */
export const addReactorClientEventHandler: AddPHGlobalEventHandler =
  reactorClientEventFunctions.addEventHandler;

/** Sets the client full-client actions use instead of the module's */
export const setFullReactorClient: SetPHGlobalValue<IReactorClient> =
  fullReactorClientEventFunctions.setValue;

/** Adds an event handler for the full reactor client */
export const addFullReactorClientEventHandler: AddPHGlobalEventHandler =
  fullReactorClientEventFunctions.addEventHandler;

/** The client full-client actions use: the one set, else the module's. */
export function getFullReactorClient(): IReactorClient | undefined {
  return window.ph?.fullReactorClient ?? window.ph?.reactorClientModule?.client;
}

// The following are derived from the reactor client module:

export const useSync = (): ISyncManager | undefined =>
  useReactorClientModule()?.reactorModule?.syncModule?.syncManager;

export const useSyncList = () => {
  const sync = useSync();
  return sync?.list() ?? [];
};

export const useModelRegistry = (): IDocumentModelRegistry | undefined =>
  useReactorClientModule()?.reactorModule?.documentModelRegistry;

export const useDatabase = (): Kysely<Database> | undefined => {
  const module = useReactorClientModule();
  return module?.kind === "browser"
    ? module.reactorModule?.database
    : undefined;
};

export const usePGlite = (): PGlite | undefined => {
  const module = useReactorClientModule();
  return module?.kind === "browser" ? module.reactorModule?.pg : undefined;
};
