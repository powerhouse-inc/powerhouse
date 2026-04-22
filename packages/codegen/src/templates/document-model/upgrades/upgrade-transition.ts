import { ts } from "@tmpl/core";
import type { DocumentModelFileMakerArgs } from "file-builders";

export const upgradeTransitionTemplate = (v: DocumentModelFileMakerArgs) =>
  ts`
import type { Action, PHDocument, UpgradeTransition } from "document-model";
import type { ${v.phStateName} as StateV${v.version - 1} } from "${v.documentModelImportPath}/v${v.version - 1}";
import type { ${v.phStateName} as StateV${v.version} } from "${v.documentModelImportPath}/v${v.version}";

function upgradeReducer(
  document: PHDocument<StateV${v.version - 1}>,
  action: Action,
): PHDocument<StateV${v.version}> {
  return {
    ...document,
  };
}

export const v${v.version}: UpgradeTransition = {
  toVersion: ${v.version},
  upgradeReducer,
  description: "",
};
`.raw;
