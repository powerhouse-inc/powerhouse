import type { Action } from "./actions.js";
import type { PHDocument } from "./documents.js";
import { DowngradeNotSupportedError } from "./errors.js";
import type { PHBaseState } from "./state.js";
import type { DeleteDocumentAction, UpgradeDocumentAction } from "./types.js";

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

function applyInitialState(
  document: PHDocument,
  action: UpgradeDocumentAction,
): void {
  const input = action.input as {
    initialState?: PHDocument["state"];
    state?: PHDocument["state"];
  };

  const newState = input.initialState || input.state;
  if (newState) {
    document.state = { ...document.state, ...newState };
    document.initialState = document.state;
  }
}

/**
 * Applies an UPGRADE_DOCUMENT action to a document.
 * Handles all upgrade scenarios including initial upgrades, no-ops, and multi-step upgrades.
 *
 * Behavior based on fromVersion/toVersion:
 * - fromVersion === toVersion (and fromVersion > 0): No-op - return unchanged document
 * - fromVersion > toVersion: Throw DowngradeNotSupportedError
 * - All other cases: Apply upgradePath transitions (if provided), then apply initialState, set version
 */
export function applyUpgradeDocumentAction(
  document: PHDocument,
  action: UpgradeDocumentAction,
  upgradePath?: UpgradeTransition[],
): PHDocument {
  const fromVersion = action.input.fromVersion;
  const toVersion = action.input.toVersion;

  if (fromVersion === toVersion && fromVersion > 0) {
    return document;
  }

  if (fromVersion > toVersion) {
    throw new DowngradeNotSupportedError(
      document.header.documentType,
      fromVersion,
      toVersion,
    );
  }

  if (upgradePath) {
    for (const transition of upgradePath) {
      document = transition.upgradeReducer(document, action);
    }
  }

  applyInitialState(document, action);

  document.state.document = {
    ...document.state.document,
    version: toVersion,
  };
  return document;
}

/**
 * Applies a DELETE_DOCUMENT action to a document.
 * Marks the document as deleted in the document scope state.
 */
export function applyDeleteDocumentAction(
  document: PHDocument,
  action: DeleteDocumentAction,
): PHDocument {
  const deletedAt = action.timestampUtcMs || new Date().toISOString();

  document.state = {
    ...document.state,
    document: {
      ...document.state.document,
      isDeleted: true,
      deletedAtUtcIso: deletedAt,
    },
  };

  return document;
}

/**
 * Computes the ordered list of upgrade transitions needed to move from
 * fromVersion to toVersion using the provided manifest.
 * Walks keys v(fromVersion+1)..v(toVersion) and throws a descriptive Error
 * if the manifest is absent or any step is missing.
 */
export function computeUpgradeTransitions(
  manifest: UpgradeManifest<readonly number[]> | undefined,
  fromVersion: number,
  toVersion: number,
): UpgradeTransition[] {
  if (!manifest) {
    throw new Error(
      `No upgrade manifest provided for transition from version ${fromVersion} to ${toVersion}`,
    );
  }

  const transitions: UpgradeTransition[] = [];
  const upgrades = manifest.upgrades as Record<string, UpgradeTransition>;

  for (let v = fromVersion + 1; v <= toVersion; v++) {
    const key = `v${v}`;
    const transition = upgrades[key];
    if (!transition) {
      throw new Error(
        `Upgrade manifest for "${manifest.documentType}" is missing step "${key}" (from v${fromVersion} to v${toVersion}). Available keys: ${Object.keys(upgrades).join(", ")}`,
      );
    }
    transitions.push(transition);
  }

  return transitions;
}
