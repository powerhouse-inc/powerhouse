import type { IRenown } from "@renown/sdk";
import { makePHEventFunctions } from "../events/make-ph-event-functions.js";

export const {
  useValue: useRenown,
  setValue: setRenown,
  addEventHandler: addRenownEventHandler,
} = makePHEventFunctions<IRenown>("renown");
