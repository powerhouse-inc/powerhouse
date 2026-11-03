import type {
  AddPHGlobalEventHandler,
  SetPHGlobalValue,
  SwitchboardDirectory,
  UsePHGlobalValue,
} from "@powerhousedao/reactor-browser";
import { makePHEventFunctions } from "./make-ph-event-functions.js";

const switchboardsEventFunctions = makePHEventFunctions("switchboards");

/** The switchboards the app reaches, from the provided store. */
export const useSwitchboards: UsePHGlobalValue<SwitchboardDirectory> =
  switchboardsEventFunctions.useValue;

/** Sets the app's switchboard directory; the host does this at boot. */
export const setSwitchboards: SetPHGlobalValue<SwitchboardDirectory> =
  switchboardsEventFunctions.setValue;

/** Registers the switchboards window event handler */
export const addSwitchboardsEventHandler: AddPHGlobalEventHandler =
  switchboardsEventFunctions.addEventHandler;
