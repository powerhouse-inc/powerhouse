import type {
  LocalSignInState,
  SetPHGlobalValue,
  UsePHGlobalValue,
} from "../types/global.js";
import { makePHEventFunctions } from "./make-ph-event-functions.js";

const localSignInEventFunctions = makePHEventFunctions("localSignIn");

/** What sign-in by link needs of the person, if anything. */
export const useLocalSignIn: UsePHGlobalValue<LocalSignInState> =
  localSignInEventFunctions.useValue;

/** Sets (or clears, with `undefined`) what sign-in by link needs. */
export const setLocalSignIn: SetPHGlobalValue<LocalSignInState> =
  localSignInEventFunctions.setValue;

export const addLocalSignInEventHandler =
  localSignInEventFunctions.addEventHandler;
