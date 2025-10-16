import { makePHEventFunctions } from "./make-ph-event-functions.js";

export const {
  useValue: useLoading,
  setValue: setLoading,
  addEventHandler: addLoadingEventHandler,
} = makePHEventFunctions("loading");
