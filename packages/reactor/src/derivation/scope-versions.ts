import type {
  Operation,
  PHDocument,
  PHDocumentHeader,
  ScopeVersions,
  StateReducer,
} from "@powerhousedao/shared/document-model";
import { reduceOne } from "@powerhousedao/shared/document-model";
import { stateReducerOrRefusal } from "../protocol/gate.js";
import type { IDocumentModelRegistry } from "../registry/interfaces.js";
import {
  applyPendingUpgrades,
  resolveModuleVersionForOp,
  type PendingUpgrade,
  type ValidatedUpgrade,
} from "./document-scope.js";

/**
 * Base-reducer 3: applies each row `applies` admits to the scope state, in
 * order, each with its version's reducer. A row that throws applies nothing.
 */
export function applyRowsByRule(
  document: PHDocument,
  rows: readonly Operation[],
  applies: (operation: Operation) => boolean,
  versions: ScopeVersions,
): PHDocument {
  for (const operation of rows) {
    const version = versions.versionOf(operation);
    document = versions.upgradeTo(document, version);
    if (!applies(operation)) {
      continue;
    }
    // Resolved outside the try: a model without a state reducer must fail.
    const reducer = versions.reducerOf(version);
    try {
      document = reduceOne(document, operation, () => reducer);
    } catch {
      // A row that throws applies nothing.
    }
  }
  return document;
}

/** One module version and no upgrades. */
export function singleVersion(
  version: number,
  reducer: StateReducer,
): ScopeVersions {
  return {
    versionOf: () => version,
    reducerOf: () => reducer,
    upgradeTo: (document) => document,
  };
}

/** Which module version each row of `scope` takes, and the upgrades between. */
export function scopeVersions(
  registry: IDocumentModelRegistry,
  header: PHDocumentHeader,
  scope: string,
  validatedUpgrades: ValidatedUpgrade[],
  pendingUpgrades: PendingUpgrade[],
  finalVersion: number,
): ScopeVersions {
  const reducers = new Map<number, StateReducer>();
  return {
    versionOf: (operation) =>
      resolveModuleVersionForOp(
        operation.index,
        operation.timestampUtcMs,
        scope,
        validatedUpgrades,
        finalVersion,
      ) ?? finalVersion,
    reducerOf: (version) => {
      let reducer = reducers.get(version);
      if (!reducer) {
        reducer = stateReducerOrRefusal(
          registry.getModule(header.documentType, version).reducer,
          header.id,
          header.documentType,
          version,
          header.protocolVersions,
        );
        reducers.set(version, reducer);
      }
      return reducer;
    },
    upgradeTo: (document, version) =>
      applyPendingUpgrades(
        document,
        pendingUpgrades,
        version,
      ) as typeof document,
  };
}
