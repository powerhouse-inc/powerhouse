import type { ProcessorManager } from "document-drive";
import { makePHEventFunctions } from "./make-ph-event-functions.js";
import type {
  AddPHGlobalEventHandler,
  SetPHGlobalValue,
  UsePHGlobalValue,
} from "./types.js";

const eventFunctions = makePHEventFunctions("processorManager");

export const useProcessorManager: UsePHGlobalValue<ProcessorManager> =
  eventFunctions.useValue;

export const setProcessorManager: SetPHGlobalValue<ProcessorManager> =
  eventFunctions.setValue;

export const addProcessorManagerEventHandler: AddPHGlobalEventHandler =
  eventFunctions.addEventHandler;
