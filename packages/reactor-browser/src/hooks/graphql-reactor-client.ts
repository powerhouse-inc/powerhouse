import type { ReactorGraphQLClient } from "../graphql/types.js";
import type { SetPHGlobalValue, UsePHGlobalValue } from "../types/global.js";
import { makePHEventFunctions } from "./make-ph-event-functions.js";

const graphQLReactorClientEventFunctions = makePHEventFunctions(
  "reactorGraphQLClient",
);

export const useGraphQLReactorClient: UsePHGlobalValue<ReactorGraphQLClient> =
  graphQLReactorClientEventFunctions.useValue;

export const setGraphQLReactorClient: SetPHGlobalValue<ReactorGraphQLClient> =
  graphQLReactorClientEventFunctions.setValue;
export const addGraphQLReactorClientEventHandler =
  graphQLReactorClientEventFunctions.addEventHandler;
