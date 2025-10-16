import type { DocumentDriveDocument } from "document-drive";
import type { SetPHGlobalValue, UsePHGlobalValue } from "../types/global.js";
import { makePHEventFunctions } from "./make-ph-event-functions.js";

const drivesEventFunctions = makePHEventFunctions("drives");

/** Returns all of the drives in the reactor */
export const useDrives: UsePHGlobalValue<DocumentDriveDocument[]> =
  drivesEventFunctions.useValue;

/** Sets the drives in the reactor */
export const setDrives: SetPHGlobalValue<DocumentDriveDocument[]> =
  drivesEventFunctions.setValue;

/** Adds an event handler for the drives */
export const addDrivesEventHandler = drivesEventFunctions.addEventHandler;
