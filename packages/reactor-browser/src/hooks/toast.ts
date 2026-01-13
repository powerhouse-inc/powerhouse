import { makePHEventFunctions } from "./make-ph-event-functions.js";

const toastEventFunctions = makePHEventFunctions("toast");

/** Returns the toast function */
export const usePHToast = toastEventFunctions.useValue;

/** Sets the toast function */
export const setPHToast = toastEventFunctions.setValue;

/** Adds an event handler for the toast */
export const addToastEventHandler = toastEventFunctions.addEventHandler;
