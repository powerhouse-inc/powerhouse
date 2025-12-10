import type { PGlite } from "@electric-sql/pglite";
import type {
  Database,
  IReactorClient,
  ISyncManager,
} from "@powerhousedao/reactor";
import type { Kysely } from "kysely";
import type {
  AddPHGlobalEventHandler,
  BrowserReactorClientModule,
  SetPHGlobalValue,
  UsePHGlobalValue,
} from "@powerhousedao/reactor-browser";
import type { IDocumentDriveServer } from "document-drive";
import { makePHEventFunctions } from "./make-ph-event-functions.js";

const legacyEventFunctions = makePHEventFunctions("legacyReactor");
const reactorClientModuleEventFunctions = makePHEventFunctions(
  "reactorClientModule",
);
const reactorClientEventFunctions = makePHEventFunctions("reactorClient");
const syncEventFunctions = makePHEventFunctions("sync");

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

/** Returns the sync manager */
export const useSync: UsePHGlobalValue<ISyncManager> =
  syncEventFunctions.useValue;

/** Sets the sync manager */
export const setSync: SetPHGlobalValue<ISyncManager> =
  syncEventFunctions.setValue;

/** Adds an event handler for the sync manager */
export const addSyncEventHandler: AddPHGlobalEventHandler =
  syncEventFunctions.addEventHandler;

const databaseEventFunctions = makePHEventFunctions("database");

/** Returns the database */
export const useDatabase: UsePHGlobalValue<Kysely<Database>> =
  databaseEventFunctions.useValue;

/** Sets the database */
export const setDatabase: SetPHGlobalValue<Kysely<Database>> =
  databaseEventFunctions.setValue;

/** Adds an event handler for the database */
export const addDatabaseEventHandler: AddPHGlobalEventHandler =
  databaseEventFunctions.addEventHandler;

const pgliteEventFunctions = makePHEventFunctions("pglite");

/** Returns the PGlite instance */
export const usePGlite: UsePHGlobalValue<PGlite> =
  pgliteEventFunctions.useValue;

/** Sets the PGlite instance */
export const setPGlite: SetPHGlobalValue<PGlite> =
  pgliteEventFunctions.setValue;

/** Adds an event handler for the PGlite instance */
export const addPGliteEventHandler: AddPHGlobalEventHandler =
  pgliteEventFunctions.addEventHandler;
