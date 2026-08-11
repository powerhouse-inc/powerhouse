/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { Reducer, StateReducer } from "document-model";
import { createReducer, isDocumentAction } from "document-model";
import type { ReactorGroupPHState } from "document-models/reactor-group/v1";

import { reactorGroupGroupOperations } from "../src/reducers/group.js";

import {
  AddMemberInputSchema,
  RemoveMemberInputSchema,
  SetGroupDescriptionInputSchema,
  SetGroupNameInputSchema,
} from "./schema/zod.js";

const stateReducer: StateReducer<ReactorGroupPHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "SET_GROUP_NAME": {
      SetGroupNameInputSchema().parse(action.input);

      reactorGroupGroupOperations.setGroupNameOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_GROUP_DESCRIPTION": {
      SetGroupDescriptionInputSchema().parse(action.input);

      reactorGroupGroupOperations.setGroupDescriptionOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADD_MEMBER": {
      AddMemberInputSchema().parse(action.input);

      reactorGroupGroupOperations.addMemberOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_MEMBER": {
      RemoveMemberInputSchema().parse(action.input);

      reactorGroupGroupOperations.removeMemberOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    default:
      return state;
  }
};

export const reducer: Reducer<ReactorGroupPHState> =
  createReducer(stateReducer);
