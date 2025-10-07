import { makePHEventFunctions } from "../events/make-ph-event-functions.js";

export const {
  useValue: useAnalyticsDatabaseName,
  setValue: setAnalyticsDatabaseName,
  addEventHandler: addAnalyticsDatabaseNameEventHandler,
} = makePHEventFunctions<string>("analyticsDatabaseName");

export const {
  useValue: useAllowList,
  setValue: setAllowList,
  addEventHandler: addAllowListEventHandler,
} = makePHEventFunctions<string[]>("allowList");

export const {
  useValue: useIsSearchBarEnabled,
  setValue: setIsSearchBarEnabled,
  addEventHandler: addIsSearchBarEnabledEventHandler,
} = makePHEventFunctions<boolean>("isSearchBarEnabled");
