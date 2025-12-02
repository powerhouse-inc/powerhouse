import type { IRenown } from "@renown/sdk";
import { makePHEventFunctions } from "./make-ph-event-functions.js";

const renownEventFunctions = makePHEventFunctions("renown");

/** Returns the renown instance */
export const useRenown: () => IRenown | undefined = renownEventFunctions.useValue;

/** Sets the renown instance */
export const setRenown: (value: IRenown | undefined) => void = renownEventFunctions.setValue;

/** Adds an event handler for the renown instance */
export const addRenownEventHandler: () => void = renownEventFunctions.addEventHandler;
