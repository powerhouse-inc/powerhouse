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
} from "@powerhousedao/reactor-browser";
import { useQuery } from "@tanstack/react-query";
import type { IDocumentDriveServer } from "document-drive";
import type { Kysely } from "kysely";
import { useCallback } from "react";
import { makePHEventFunctions } from "./make-ph-event-functions.js";

const legacyEventFunctions = makePHEventFunctions("legacyReactor");
const reactorClientModuleEventFunctions = makePHEventFunctions(
  "reactorClientModule",
);
const reactorClientEventFunctions = makePHEventFunctions("reactorClient");

/** Returns the legacy reactor */
export const useLegacyReactor: UsePHGlobalValue<IDocumentDriveServer> =
  legacyEventFunctions.useValue;

/** Sets the legacy reactor */
export const setLegacyReactor: SetPHGlobalValue<IDocumentDriveServer> =
  legacyEventFunctions.setValue;

/** Adds an event handler for the reactor */
export const addLegacyReactorEventHandler: AddPHGlobalEventHandler =
  legacyEventFunctions.addEventHandler;

/** Returns the reactor client module */
export const useReactorClientModule: UsePHGlobalValue<BrowserReactorClientModule> =
  reactorClientModuleEventFunctions.useValue;

/** Sets the reactor client module */
export const setReactorClientModule: SetPHGlobalValue<BrowserReactorClientModule> =
  reactorClientModuleEventFunctions.setValue;

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
  const fn = useCallback(() => {
    if (!sync) return [];
    return sync.list();
  }, [sync]);

  return useQuery({
    queryKey: ["sync", "list"],
    queryFn: fn,
  });
};

export const useModelRegistry = (): IDocumentModelRegistry | undefined =>
  useReactorClientModule()?.reactorModule?.documentModelRegistry;

export const useDatabase = (): Kysely<Database> | undefined =>
  useReactorClientModule()?.reactorModule?.database;

export const usePGlite = (): PGlite | undefined => useReactorClientModule()?.pg;
