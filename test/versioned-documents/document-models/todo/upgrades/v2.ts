import type {
  Action,
  PHDocument,
  UpgradeTransition,
} from "@powerhousedao/shared/document-model";
import type { TodoPHState as StateV1 } from "document-models/todo/v1";
import type { TodoPHState as StateV2 } from "document-models/todo/v2";

function upgradeReducer(
  document: PHDocument<StateV1>,
  action: Action,
): PHDocument<StateV2> {
  return {
    ...document,
    state: {
      ...document.state,
      global: {
        ...document.state.global,
        title: "",
      },
    },
    initialState: {
      ...document.initialState,
      global: {
        ...document.initialState.global,
        title: "",
      },
    },
  };
}

export const v2: UpgradeTransition = {
  toVersion: 2,
  upgradeReducer,
  description: "",
};
