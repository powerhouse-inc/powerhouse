import type { User } from "@renown/sdk";
import { makePHEventFunctions } from "./make-ph-event-functions.js";

const userEventFunctions = makePHEventFunctions("user");

/** Returns the current user */
export const useUser: () => User | undefined = userEventFunctions.useValue;

/** Sets the current user */
export const setUser: (value: User | undefined) => void =
  userEventFunctions.setValue;

/** Adds an event handler for user changes */
export const addUserEventHandler: () => void =
  userEventFunctions.addEventHandler;
