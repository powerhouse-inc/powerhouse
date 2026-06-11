import {
  hashDocumentStateForScope,
  replayDocument,
  type PHDocument,
  type PHDocumentHeader,
} from "./documents.js";
import { HashMismatchError } from "./errors.js";
import type { DocumentOperations, Operation } from "./operations.js";
import type { PHBaseState } from "./state.js";
import type {
  Reducer,
  ReplayDocumentOptions,
  SignalDispatch,
  UpgradeDocumentAction,
} from "./types.js";
import {
  applyDeleteDocumentAction,
  applyUpgradeDocumentAction,
  computeUpgradeTransitions,
  type UpgradeManifest,
} from "./upgrades.js";

export type VersionedReducers = Record<number, Reducer<PHBaseState>>;

export type VersionedReplayConfig = {
  reducers: VersionedReducers;
  upgradeManifest?: UpgradeManifest<readonly number[]>;
};

const NON_DOMAIN_SCOPES = new Set(["auth", "document"]);

function highestReducerVersion(reducers: VersionedReducers): number {
  const keys = Object.keys(reducers).map(Number);
  if (keys.length === 0) {
    throw new Error("VersionedReplayConfig.reducers must not be empty");
  }
  return Math.max(...keys);
}

/**
 * Version-aware document replay. Replays a versioned document through per-version
 * reducers, applying upgrade transitions at segment boundaries.
 *
 * Algorithm (D5):
 *   a. Build spine from operations["document"]. Empty spine or no upgrades → legacy fallback.
 *   b. Collect UPGRADE_DOCUMENT ops from the spine.
 *   c. Seed state from the creation upgrade (fromVersion===0). Missing seed with validated
 *      upgrades throws; otherwise falls back to legacy.
 *   d. Identify validated upgrades (fromVersion > 0, version increases). Compute per-scope
 *      boundaries using revision snapshot (preferred) or timestamp fallback.
 *   e. Loop over version segments, replaying each scope's ops through the matching reducer,
 *      then applying the upgrade transition before the next segment.
 *   f. Set header.revision["document"], verify per-scope hashes against state at op-time
 *      (not post-upgrade state) when checkHashes is false, and map timestamps from input.
 *
 * operations must include ALL scopes (document scope is NOT stripped).
 * reuseOperationResultingState is ignored by this function — zip operations never carry
 * resultingState.
 */
export function replayDocumentVersioned<TState extends PHBaseState>(
  initialState: TState,
  operations: DocumentOperations,
  config: VersionedReplayConfig,
  header: PHDocumentHeader,
  dispatch?: SignalDispatch,
  options?: ReplayDocumentOptions,
): PHDocument<TState> {
  const { checkHashes = true, skipIndexValidation } = options || {};

  const protocolVersion = header.protocolVersions?.["base-reducer"] ?? 1;

  const spine = (operations["document"] ?? [])
    .slice()
    .sort((a, b) => a.index - b.index);

  const upgrades = spine.filter((op) => op.action.type === "UPGRADE_DOCUMENT");

  const legacyFallback = (): PHDocument<TState> => {
    const domainOps = Object.fromEntries(
      Object.entries(operations).filter(([s]) => !NON_DOMAIN_SCOPES.has(s)),
    ) as DocumentOperations;
    const latestVersion = highestReducerVersion(config.reducers);
    const reducer = config.reducers[
      latestVersion
    ] as unknown as Reducer<TState>;
    const result = replayDocument(
      initialState,
      domainOps,
      reducer,
      header,
      dispatch,
      {},
      options,
    );
    return { ...result, operations };
  };

  if (spine.length === 0 || upgrades.length === 0) {
    return legacyFallback();
  }

  const seedOp = upgrades[0];
  if (!seedOp) {
    return legacyFallback();
  }
  const seedAction = seedOp.action as UpgradeDocumentAction;
  if (seedAction.input.fromVersion !== 0) {
    return legacyFallback();
  }

  const seedInput = seedAction.input as {
    initialState?: TState;
    state?: TState;
  };
  const seedState = (seedInput.initialState ?? seedInput.state) as
    | TState
    | undefined;

  if (!seedState) {
    const validatedUpgradeCount = upgrades.filter((op) => {
      const a = op.action as UpgradeDocumentAction;
      return a.input.fromVersion > 0 && a.input.fromVersion < a.input.toVersion;
    }).length;

    if (validatedUpgradeCount > 0) {
      throw new Error(
        `Cannot reconstruct versioned history: the creation UPGRADE_DOCUMENT operation ` +
          `carries no initialState, but the document has ${validatedUpgradeCount} version-changing ` +
          `upgrade(s) recorded after creation. Pre-migration states cannot be reconstructed without the seeded initialState.`,
      );
    }
    return legacyFallback();
  }

  const startVersion = seedAction.input.toVersion;

  const validatedUpgrades = upgrades.filter((op) => {
    const a = op.action as UpgradeDocumentAction;
    return a.input.fromVersion > 0 && a.input.fromVersion < a.input.toVersion;
  });

  const domainScopes = Object.keys(operations).filter(
    (s) => !NON_DOMAIN_SCOPES.has(s),
  );
  const scopeOps: Record<string, Operation[]> = {};
  for (const s of domainScopes) {
    scopeOps[s] = (operations[s] ?? [])
      .slice()
      .sort((a, b) => a.index - b.index);
  }

  const boundaries: Array<Record<string, number>> = validatedUpgrades.map(
    (upgradeOp) => {
      const upgradeAction = upgradeOp.action as UpgradeDocumentAction;
      const revisionSnapshot = upgradeAction.input.revision;
      const upgradeTimestamp = upgradeOp.timestampUtcMs;

      const boundary: Record<string, number> = {};
      for (const s of domainScopes) {
        const ops = scopeOps[s] ?? [];
        if (revisionSnapshot !== undefined) {
          const rev = revisionSnapshot[s] ?? 0;
          let b = 0;
          for (let j = 0; j < ops.length; j++) {
            if ((ops[j]?.index ?? 0) < rev) {
              b = j + 1;
            }
          }
          boundary[s] = b;
        } else {
          let b = ops.length;
          for (let j = 0; j < ops.length; j++) {
            const opTs = ops[j]?.timestampUtcMs ?? "";
            if (opTs >= upgradeTimestamp) {
              b = j;
              break;
            }
          }
          boundary[s] = b;
        }
      }
      return boundary;
    },
  );

  for (let i = 1; i < boundaries.length; i++) {
    for (const s of domainScopes) {
      const prev = boundaries[i - 1]?.[s] ?? 0;
      const curr = boundaries[i]?.[s] ?? 0;
      if (boundaries[i]) {
        boundaries[i][s] = Math.max(prev, curr);
      }
    }
  }

  const allScopes = new Set([...Object.keys(operations), "global", "local"]);
  const initialOperations: DocumentOperations = {};
  for (const s of allScopes) {
    initialOperations[s] = [];
  }

  let document: PHDocument<TState> = {
    header,
    state: seedState as TState,
    initialState: seedState,
    operations: initialOperations,
    clipboard: [],
  };

  let currentVersion = startVersion;

  const segmentEndHashPerScope = new Map<string, string>();

  for (let k = 0; k <= validatedUpgrades.length; k++) {
    const reducer = config.reducers[currentVersion] as unknown as
      | Reducer<TState>
      | undefined;
    if (!reducer) {
      const available = Object.keys(config.reducers).join(", ");
      throw new Error(
        `No reducer registered for document version ${currentVersion}. Available versions: ${available}`,
      );
    }

    for (const s of domainScopes) {
      const ops = scopeOps[s] ?? [];
      const segStart = k === 0 ? 0 : (boundaries[k - 1]?.[s] ?? 0);
      const segEnd =
        k < validatedUpgrades.length
          ? (boundaries[k]?.[s] ?? ops.length)
          : ops.length;
      const segOps = ops.slice(segStart, segEnd);

      for (const op of segOps) {
        document = reducer(document, op.action, dispatch, {
          ignoreSkipOperations: true,
          checkHashes,
          skipIndexValidation,
          replayOptions: { operation: op },
          protocolVersion,
        }) as PHDocument<TState>;
        segmentEndHashPerScope.set(s, hashDocumentStateForScope(document, s));
      }
    }

    const prevUpgradeSpineIdx =
      k === 0 ? -1 : spine.indexOf(validatedUpgrades[k - 1]!);
    const nextUpgradeSpineIdx =
      k < validatedUpgrades.length
        ? spine.indexOf(validatedUpgrades[k]!)
        : spine.length;

    for (let si = prevUpgradeSpineIdx + 1; si < nextUpgradeSpineIdx; si++) {
      const spineOp = spine[si];
      if (!spineOp) continue;
      const spineActionType = spineOp.action.type;
      if (
        spineActionType === "CREATE_DOCUMENT" ||
        spineActionType === "UPGRADE_DOCUMENT"
      ) {
        continue;
      }
      if (spineActionType === "DELETE_DOCUMENT") {
        document = applyDeleteDocumentAction(
          document,
          spineOp.action as Parameters<typeof applyDeleteDocumentAction>[1],
        ) as PHDocument<TState>;
      } else {
        document = reducer(document, spineOp.action, dispatch, {
          ignoreSkipOperations: true,
          checkHashes,
          skipIndexValidation,
          replayOptions: { operation: spineOp },
          protocolVersion,
        }) as PHDocument<TState>;
      }
    }

    if (k < validatedUpgrades.length) {
      const upgradeOp = validatedUpgrades[k]!;
      const upgradeAction = upgradeOp.action as UpgradeDocumentAction;
      const fromVer = upgradeAction.input.fromVersion;
      const toVer = upgradeAction.input.toVersion;

      const transitions = computeUpgradeTransitions(
        config.upgradeManifest,
        fromVer,
        toVer,
      );

      document = applyUpgradeDocumentAction(
        document,
        upgradeAction,
        transitions,
      ) as PHDocument<TState>;

      currentVersion = toVer;
    }
  }

  const lastSpineOp = spine.at(-1);
  if (lastSpineOp !== undefined && validatedUpgrades.length > 0) {
    document = {
      ...document,
      header: {
        ...document.header,
        revision: {
          ...document.header.revision,
          document: lastSpineOp.index + 1,
        },
      },
    };
  }

  if (!checkHashes) {
    const allReplayedOps = domainScopes.flatMap((s) => scopeOps[s] ?? []);
    for (const scope of Object.keys(document.state)) {
      const capturedHash = segmentEndHashPerScope.get(scope);
      const scopeHash =
        capturedHash !== undefined
          ? capturedHash
          : hashDocumentStateForScope(document, scope);
      for (let i = allReplayedOps.length - 1; i >= 0; i--) {
        const operation = allReplayedOps[i];
        if (!operation || operation.action.scope !== scope) {
          continue;
        }
        if (operation.hash !== scopeHash) {
          throw new HashMismatchError(scope, document, operation);
        } else {
          break;
        }
      }
    }
  }

  const allResultScopes = new Set([
    ...Object.keys(document.operations),
    ...Object.keys(operations),
    "global",
    "local",
  ]);
  allResultScopes.delete("document");
  const resultOperations: DocumentOperations = {};
  for (const s of allResultScopes) {
    const scopeResultOps = document.operations[s] ?? [];
    resultOperations[s] = scopeResultOps.map((op, index) => ({
      ...op,
      timestamp: operations[s]?.[index]?.timestampUtcMs ?? op.timestampUtcMs,
    }));
  }

  const lastModified = header.lastModifiedAtUtcIso
    ? header.lastModifiedAtUtcIso
    : Object.values(resultOperations).reduce((acc, curr) => {
        if (!curr) return acc;
        const last = curr.at(-1);
        if (last && last.timestampUtcMs > acc) {
          return last.timestampUtcMs;
        }
        return acc;
      }, document.header.lastModifiedAtUtcIso);

  return {
    ...document,
    header: {
      ...document.header,
      lastModifiedAtUtcIso: lastModified,
    },
    operations: { ...operations, ...resultOperations },
  } as PHDocument<TState>;
}
