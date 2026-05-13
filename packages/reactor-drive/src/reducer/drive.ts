import type {
  Action,
  StateReducer,
} from "@powerhousedao/shared/document-model";
import { isDocumentAction } from "@powerhousedao/shared/document-model";
import type {
  SetAvailableOfflineInput,
  SetDriveIconInput,
  SetDriveNameInput,
  SetSharingTypeInput,
} from "../actions.js";
import type { ReactorDrivePHState } from "../types.js";

type TypedAction = Action & { type: string };

export const reactorDriveStateReducer: StateReducer<ReactorDrivePHState> = (
  state,
  action,
) => {
  if (isDocumentAction(action)) {
    return state;
  }

  const typedAction = action as TypedAction;

  switch (typedAction.type) {
    case "SET_DRIVE_NAME": {
      const input = typedAction.input as SetDriveNameInput;
      state.global.name = input.name;
      return state;
    }
    case "SET_DRIVE_ICON": {
      const input = typedAction.input as SetDriveIconInput;
      state.global.icon = input.icon;
      return state;
    }
    case "SET_SHARING_TYPE": {
      const input = typedAction.input as SetSharingTypeInput;
      state.local.sharingType = input.sharingType;
      return state;
    }
    case "SET_AVAILABLE_OFFLINE": {
      const input = typedAction.input as SetAvailableOfflineInput;
      state.local.availableOffline = input.availableOffline;
      return state;
    }
    default:
      return state;
  }
};
