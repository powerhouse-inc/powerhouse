import type {
  AddPHGlobalEventHandler,
  SetPHGlobalValue,
  UsePHGlobalValue,
} from "@powerhousedao/reactor-browser";
import type { IDocumentDriveServer } from "document-drive";
import { makePHEventFunctions } from "./make-ph-event-functions.js";

const eventFunctions = makePHEventFunctions("legacyReactor");

/** Returns the legacy reactor */
export const useLegacyReactor: UsePHGlobalValue<IDocumentDriveServer> =
  eventFunctions.useValue;

/** Sets the legacy reactor */
export const setLegacyReactor: SetPHGlobalValue<IDocumentDriveServer> =
  eventFunctions.setValue;

/** Adds an event handler for the reactor */
export const addLegacyReactorEventHandler: AddPHGlobalEventHandler =
  eventFunctions.addEventHandler;
