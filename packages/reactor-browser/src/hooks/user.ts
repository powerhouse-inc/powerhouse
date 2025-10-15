import { makePHEventFunctions } from "./make-ph-event-functions.js";

export const {
  useValue: useUser,
  setValue: setUser,
  addEventHandler: addUserEventHandler,
} = makePHEventFunctions("user");
