import type { Action, PHDocument, UpgradeTransition } from "document-model";
import type { TestEmptyCodesPHState as StateV1 } from "test/document-models/test-empty-codes/v1";
import type { TestEmptyCodesPHState as StateV2 } from "test/document-models/test-empty-codes/v2";

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
