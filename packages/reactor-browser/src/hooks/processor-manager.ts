import type { IProcessorManager } from "@powerhousedao/reactor";
import type {
  AddPHGlobalEventHandler,
  SetPHGlobalValue,
  UsePHGlobalValue,
} from "@powerhousedao/reactor-browser";
import { makePHEventFunctions } from "./make-ph-event-functions.js";

const eventFunctions = makePHEventFunctions("processorManager");

/** Returns the processor manager */
export const useProcessorManager: UsePHGlobalValue<IProcessorManager> =
  eventFunctions.useValue;

/** Sets the processor manager */
export const setProcessorManager: SetPHGlobalValue<IProcessorManager> =
  eventFunctions.setValue;

/** Adds an event handler for the processor manager */
export const addProcessorManagerEventHandler: AddPHGlobalEventHandler =
  eventFunctions.addEventHandler;
