import type {
  AddPHGlobalEventHandler,
  SetPHGlobalValue,
  UsePHGlobalValue,
} from "../types/global.js";
import { makePHEventFunctions } from "./make-ph-event-functions.js";

const featuresEventFunctions = makePHEventFunctions("features");

export const useFeatures: UsePHGlobalValue<Map<string, boolean>> =
  featuresEventFunctions.useValue;

export const setFeatures: SetPHGlobalValue<Map<string, boolean>> =
  featuresEventFunctions.setValue;

export const addFeaturesEventHandler: AddPHGlobalEventHandler =
  featuresEventFunctions.addEventHandler;
