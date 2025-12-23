import type { Action, PHDocument, UpgradeTransition } from "document-model";
import type { TodoPHState as StateV1 } from "versioned-documents/document-models/todo/v1";
import type { TodoPHState as StateV2 } from "versioned-documents/document-models/todo/v2";

function upgradeReducer(
  document: PHDocument<StateV1>,
  action: Action,
): PHDocument<StateV2> {
  return {
    ...document,
  };
}

export const v2: UpgradeTransition = {
  toVersion: 2,
  upgradeReducer,
  description: "",
};
