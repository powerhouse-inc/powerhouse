import { ImmutableStateReducer, utils } from "document-model/document";
import { AccountSnapshotState, AccountSnapshotLocalState, z } from "./types";
import { AccountSnapshotAction } from "./actions";

import { reducer as SnapshotReducer } from "../src/reducers/snapshot";

const stateReducer: ImmutableStateReducer<
  AccountSnapshotState,
  AccountSnapshotAction,
  AccountSnapshotLocalState
> = (state, action, dispatch) => {
  if (utils.isBaseAction(action)) {
    return state;
  }

  switch (action.type) {
    case "SET_ID":
      z.SetIdInputSchema().parse(action.input);
      SnapshotReducer.setIdOperation(state[action.scope], action, dispatch);
      break;

    case "SET_OWNER_ID":
      z.SetOwnerIdInputSchema().parse(action.input);
      SnapshotReducer.setOwnerIdOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "SET_OWNER_TYPE":
      z.SetOwnerTypeInputSchema().parse(action.input);
      SnapshotReducer.setOwnerTypeOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "SET_PERIOD":
      z.SetPeriodInputSchema().parse(action.input);
      SnapshotReducer.setPeriodOperation(state[action.scope], action, dispatch);
      break;

    case "SET_START":
      z.SetStartInputSchema().parse(action.input);
      SnapshotReducer.setStartOperation(state[action.scope], action, dispatch);
      break;

    case "SET_END":
      z.SetEndInputSchema().parse(action.input);
      SnapshotReducer.setEndOperation(state[action.scope], action, dispatch);
      break;

    default:
      return state;
  }
};

export const reducer = utils.createReducer<
  AccountSnapshotState,
  AccountSnapshotAction,
  AccountSnapshotLocalState
>(stateReducer);
