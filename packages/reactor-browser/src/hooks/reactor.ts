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
export const useReactorClient: UsePHGlobalValue<IReactorClient> =
  reactorClientEventFunctions.useValue;

/** Sets the reactor client */
export const setReactorClient: SetPHGlobalValue<IReactorClient> =
  reactorClientEventFunctions.setValue;

/** Adds an event handler for the reactor client */
export const addReactorClientEventHandler: AddPHGlobalEventHandler =
  reactorClientEventFunctions.addEventHandler;

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
