import type {
  AddPHGlobalEventHandler,
  SetPHGlobalValue,
  UsePHGlobalValue,
} from "@powerhousedao/reactor-browser";
import type { IDocumentDriveServer } from "document-drive";
import { makePHEventFunctions } from "./make-ph-event-functions.js";

const eventFunctions = makePHEventFunctions("reactor");

/** Returns the reactor */
export const useReactor: UsePHGlobalValue<IDocumentDriveServer> =
  eventFunctions.useValue;

/** Sets the reactor */
export const setReactor: SetPHGlobalValue<IDocumentDriveServer> =
  eventFunctions.setValue;

/** Adds an event handler for the reactor */
export const addReactorEventHandler: AddPHGlobalEventHandler =
  eventFunctions.addEventHandler;
