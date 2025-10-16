import type { PHDocument } from "document-model";
import type { SetPHGlobalValue, UsePHGlobalValue } from "../types/global.js";
import { makePHEventFunctions } from "./make-ph-event-functions.js";

const documentEventFunctions = makePHEventFunctions("documents");

/** Returns all documents in the reactor. */
export const useAllDocuments: UsePHGlobalValue<PHDocument[]> =
  documentEventFunctions.useValue;

/** Sets all of the documents in the reactor. */
export const setAllDocuments: SetPHGlobalValue<PHDocument[]> =
  documentEventFunctions.setValue;

/** Adds an event handler for all of the documents in the reactor. */
export const addAllDocumentsEventHandler =
  documentEventFunctions.addEventHandler;
