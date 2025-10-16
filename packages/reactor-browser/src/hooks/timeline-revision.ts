import { makePHEventFunctions } from "./make-ph-event-functions.js";

const selectedTimelineRevisionEventFunctions = makePHEventFunctions(
  "selectedTimelineRevision",
);

/** Returns the selected timeline revision. */
export const useSelectedTimelineRevision =
  selectedTimelineRevisionEventFunctions.useValue;

/** Sets the selected timeline revision. */
export const setSelectedTimelineRevision =
  selectedTimelineRevisionEventFunctions.setValue;

/** Adds an event handler for the selected timeline revision. */
export const addSelectedTimelineRevisionEventHandler =
  selectedTimelineRevisionEventFunctions.addEventHandler;
