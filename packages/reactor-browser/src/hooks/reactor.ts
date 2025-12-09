import type {
  IReactorClient,
  ISyncManager,
  ReactorClientModule,
} from "@powerhousedao/reactor";
import type {
  AddPHGlobalEventHandler,
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
export const useReactorClientModule: UsePHGlobalValue<ReactorClientModule> =
  reactorClientModuleEventFunctions.useValue;

/** Sets the reactor client module */
export const setReactorClientModule: SetPHGlobalValue<ReactorClientModule> =
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
