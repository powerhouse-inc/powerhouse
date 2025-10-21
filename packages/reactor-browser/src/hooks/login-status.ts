import { makePHEventFunctions } from "./make-ph-event-functions.js";

export const {
  useValue: useLoginStatus,
  setValue: setLoginStatus,
  addEventHandler: addLoginStatusEventHandler,
} = makePHEventFunctions("loginStatus");
