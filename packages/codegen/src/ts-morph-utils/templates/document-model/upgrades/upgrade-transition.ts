import { ts } from "@tmpl/core";

export const upgradeTransitionTemplate = (v: {
  version: number;
  previousVersion: number;
  documentModelPackageImportPath: string;
  phStateName: string;
}) =>
  ts`
import type { Action, PHDocument, UpgradeTransition } from "document-model";
import type { ${v.phStateName} as StateV${v.previousVersion} } from "${v.documentModelPackageImportPath}/v${v.previousVersion}";
import type { ${v.phStateName} as StateV${v.version} } from "${v.documentModelPackageImportPath}/v${v.version}";

function upgradeReducer(
  document: PHDocument<StateV${v.previousVersion}>,
  action: Action,
): PHDocument<StateV${v.version}> {
  return {
    ...document,
  };
}

export const upgradeToV2: UpgradeTransition = {
  toVersion: ${v.version},
  upgradeReducer,
  description: "",
};
`.raw;
