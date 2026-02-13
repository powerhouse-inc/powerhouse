import type { Action } from "./actions.js";
import type { PHDocument } from "./documents.js";
import type { PHBaseState } from "./state.js";

/** Upgrade reducer transforms a document from one version to another */
export type UpgradeReducer<
  TFrom extends PHBaseState,
  TTo extends PHBaseState,
> = (document: PHDocument<TFrom>, action: Action) => PHDocument<TTo>;
type ModelVersion = number;

/** Metadata about a version transition */
export type UpgradeTransition = {
  toVersion: ModelVersion;
  upgradeReducer: UpgradeReducer<any, any>;
  description?: string;
};

type TupleMember<T extends readonly unknown[]> = T[number];

/** Manifest declaring all supported versions and upgrade paths */

export type UpgradeManifest<TVersions extends readonly number[]> = {
  documentType: string;
  // union of all versions, e.g. 1 | 2 | 3 for [1, 2, 3]
  latestVersion: TupleMember<TVersions>;
  // the tuple itself, e.g. [1, 2, 3]
  supportedVersions: TVersions;
  // mapped over each version in the tuple
  upgrades: {
    // keys: "v2" | "v3" | ... (no "v1")
    [V in Exclude<TupleMember<TVersions>, 1> as `v${V}`]: UpgradeTransition;
  };
};
