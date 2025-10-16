import { makePHEventFunctions } from "./make-ph-event-functions.js";

export const {
  useValue: useDid,
  setValue: setDid,
  addEventHandler: addDidEventHandler,
} = makePHEventFunctions("did");
