import { makePHEventFunctions } from "./make-ph-event-functions.js";

const revisionHistoryEventFunctions = makePHEventFunctions(
  "revisionHistoryVisible",
);

/** Returns whether revision history is visible */
export const useRevisionHistoryVisible = revisionHistoryEventFunctions.useValue;

/** Sets revision history visibility */
export const setRevisionHistoryVisible = revisionHistoryEventFunctions.setValue;

/** Adds event handler for revision history visibility */
export const addRevisionHistoryVisibleEventHandler =
  revisionHistoryEventFunctions.addEventHandler;

/** Shows the revision history */
export function showRevisionHistory() {
  setRevisionHistoryVisible(true);
}

/** Hides the revision history */
export function hideRevisionHistory() {
  setRevisionHistoryVisible(false);
}
