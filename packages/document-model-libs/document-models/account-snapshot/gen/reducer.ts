import { createReducer, ImmutableStateReducer, isDocumentAction, Reducer } from "document-model";
import { AccountSnapshotState, AccountSnapshotLocalState } from "./types.js";
import { AccountSnapshotAction } from "./actions.js";
import { reducer as SnapshotReducer } from "@document-models/account-snapshot/src/reducers/snapshot.js";
import { SetEndInputSchema, SetIdInputSchema, SetOwnerIdInputSchema, SetOwnerTypeInputSchema, SetPeriodInputSchema, SetStartInputSchema } from "./schema/zod.js";
import { fileExtension } from "./constants.js";

const stateReducer: ImmutableStateReducer<
  AccountSnapshotState,
  AccountSnapshotLocalState,
  AccountSnapshotAction
> = (state, action, dispatch) => {
  if (isDocumentAction(action)) {
    return state;
  }

  switch (action.type) {
    case "SET_ID":
      SetIdInputSchema().parse(action.input);
      SnapshotReducer.setIdOperation(state[action.scope], action, dispatch);
      break;

    case "SET_OWNER_ID":
      SetOwnerIdInputSchema().parse(action.input);
      SnapshotReducer.setOwnerIdOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "SET_OWNER_TYPE":
      SetOwnerTypeInputSchema().parse(action.input);
      SnapshotReducer.setOwnerTypeOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "SET_PERIOD":
      SetPeriodInputSchema().parse(action.input);
      SnapshotReducer.setPeriodOperation(state[action.scope], action, dispatch);
      break;

    case "SET_START":
      SetStartInputSchema().parse(action.input);
      SnapshotReducer.setStartOperation(state[action.scope], action, dispatch);
      break;

    case "SET_END":
      SetEndInputSchema().parse(action.input);
      SnapshotReducer.setEndOperation(state[action.scope], action, dispatch);
      break;

    default:
      return state;
  }
};

export const reducer: Reducer<
AccountSnapshotState,
AccountSnapshotLocalState,
AccountSnapshotAction
> = createReducer(stateReducer);
