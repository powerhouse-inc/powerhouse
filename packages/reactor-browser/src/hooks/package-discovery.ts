import { makePHEventFunctions } from "./make-ph-event-functions.js";

const packageDiscoveryFunctions = makePHEventFunctions(
  "packageDiscoveryService",
);

export const usePackageDiscoveryService = packageDiscoveryFunctions.useValue;
export const setPackageDiscoveryService = packageDiscoveryFunctions.setValue;
export const addPackageDiscoveryServiceEventHandler =
  packageDiscoveryFunctions.addEventHandler;
