// TODO: remove eslint-disable rules once refactor is done
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  type StateReducer,
  isDocumentAction,
  createReducer,
} from "document-model";
import { SubgraphModulePHState } from "./ph-factories.js";
import { z } from "./types.js";

import { reducer as BaseOperationsReducer } from "../src/reducers/base-operations.js";

export const stateReducer: StateReducer<SubgraphModulePHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }

  switch (action.type) {
    case "SET_SUBGRAPH_NAME":
      z.SetSubgraphNameInputSchema().parse(action.input);
      BaseOperationsReducer.setSubgraphNameOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_SUBGRAPH_STATUS":
      z.SetSubgraphStatusInputSchema().parse(action.input);
      BaseOperationsReducer.setSubgraphStatusOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );
      break;

    default:
      return state;
  }
};

export const reducer = createReducer<SubgraphModulePHState>(stateReducer);
