import type { ProcessorManager } from "document-drive";
import { makePHEventFunctions } from "./make-ph-event-functions.js";

export const {
  useValue: useProcessorManager,
  setValue: setProcessorManager,
  addEventHandler: addProcessorManagerEventHandler,
} = makePHEventFunctions<ProcessorManager>("phProcessorManager");
