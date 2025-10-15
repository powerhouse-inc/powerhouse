import { makePHEventFunctions } from "./make-ph-event-functions.js";

const renownEventFunctions = makePHEventFunctions("renown");

/** Returns the renown instance */
export const useRenown = renownEventFunctions.useValue;

/** Sets the renown instance */
export const setRenown = renownEventFunctions.setValue;

/** Adds an event handler for the renown instance */
export const addRenownEventHandler = renownEventFunctions.addEventHandler;
