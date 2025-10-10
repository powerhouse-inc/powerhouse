import { makePHEventFunctions } from "./make-ph-event-functions.js";

export const {
  useValue: useRenown,
  setValue: setRenown,
  addEventHandler: addRenownEventHandler,
} = makePHEventFunctions("renown");
