import { makePHEventFunctions } from "./make-ph-event-functions.js";

const selectedTimelineItemEventFunctions = makePHEventFunctions(
  "selectedTimelineItem",
);

/** Returns the selected timeline item */
export const useSelectedTimelineItem =
  selectedTimelineItemEventFunctions.useValue;

/** Sets the selected timeline item */
export const setSelectedTimelineItem =
  selectedTimelineItemEventFunctions.setValue;

/** Adds event handler for selected timeline item */
export const addSelectedTimelineItemEventHandler =
  selectedTimelineItemEventFunctions.addEventHandler;
