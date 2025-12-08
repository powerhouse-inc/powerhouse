import type { Action, PHDocument, UpgradeTransition } from "document-model";
import type { TestDocPHState as StateV1 } from "test/document-models/test-doc/v1";
import type { TestDocPHState as StateV2 } from "test/document-models/test-doc/v2";

function upgradeReducer(
  document: PHDocument<StateV1>,
  action: Action,
): PHDocument<StateV2> {
  return {
    ...document,
  };
}

export const upgradeToV2: UpgradeTransition = {
  toVersion: 2,
  upgradeReducer,
  description: "",
};
