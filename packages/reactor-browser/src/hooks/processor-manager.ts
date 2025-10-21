import type {
  AddPHGlobalEventHandler,
  SetPHGlobalValue,
  UsePHGlobalValue,
} from "@powerhousedao/reactor-browser";
import type { ProcessorManager } from "document-drive";
import { makePHEventFunctions } from "./make-ph-event-functions.js";

const eventFunctions = makePHEventFunctions("processorManager");

/** Returns the processor manager */
export const useProcessorManager: UsePHGlobalValue<ProcessorManager> =
  eventFunctions.useValue;

/** Sets the processor manager */
export const setProcessorManager: SetPHGlobalValue<ProcessorManager> =
  eventFunctions.setValue;

/** Adds an event handler for the processor manager */
export const addProcessorManagerEventHandler: AddPHGlobalEventHandler =
  eventFunctions.addEventHandler;
