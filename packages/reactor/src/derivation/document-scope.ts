import type {
  CreateDocumentAction,
  DeleteDocumentAction,
  Operation,
  PHDocument,
  PurgeDocumentAction,
  UpgradeDocumentAction,
  UpgradeTransition,
} from "@powerhousedao/shared/document-model";
import {
  applyDeleteDocumentAction,
  applyUpgradeDocumentAction,
  baseReducerVersion,
  isDenied,
  isPurgeMarker,
  normalizeDocumentModelVersion,
  PURGE_DOCUMENT,
  withProtocolVersions,
} from "@powerhousedao/shared/document-model";
import { createDocumentFromAction } from "../executor/util.js";
import type { IProtocolGate } from "../protocol/gate.js";
import type { IDocumentModelRegistry } from "../registry/interfaces.js";
import {
  DocumentNotFoundError,
  DocumentPurgedError,
} from "../shared/errors.js";
import type { IOperationStore } from "../storage/interfaces.js";

/**
 * An UPGRADE_DOCUMENT spine event validated as version-changing
 * (fromVersion > 0 and fromVersion < toVersion), as opposed to the
 * creation-time 0->N seed upgrade. Used to segment scope replay.
 */
export type ValidatedUpgrade = {
  fromVersion: number;
  toVersion: number;
  revision: Record<string, number> | undefined;
  timestampUtcMs: string;
};

/**
 * A validated upgrade held back by the document scope pass so its transitions
 * run against the state the requested scope has reached at the upgrade's
 * boundary, rather than the state the pass starts from.
 */
export type PendingUpgrade = {
  action: UpgradeDocumentAction;
  upgradePath: UpgradeTransition[] | undefined;
  /** The upgrade operation's index in the document scope. */
  index: number;
  /**
   * DELETE_DOCUMENT and PURGE_DOCUMENT actions the document scope recorded
   * after this upgrade.
   * The document-scope pass applies deletes inline while the upgrade is held
   * back, inverting log order; re-applying them after the upgrade restores it
   * — without this, an upgrade seeded from an initialState snapshot replaces
   * the state wholesale and a rebuilt deleted document comes back live.
   */
  subsequentDeletes: (DeleteDocumentAction | PurgeDocumentAction)[];
};

/** The document scope, rebuilt with its version-changing upgrades held back. */
export type DocumentScopeRead = {
  document: PHDocument;
  documentType: string;
  validatedUpgrades: ValidatedUpgrade[];
  pendingUpgrades: PendingUpgrade[];
  lastDocumentScopeOperation: Operation | undefined;
};

export function extractModuleVersion(doc: PHDocument): number {
  const v = (doc.state as Record<string, Record<string, unknown>>).document
    .version as number | undefined;
  return normalizeDocumentModelVersion(v);
}

/**
 * Resolves which module version to use for a given operation in phase 2.
 *
 * Uses the validated-upgrade boundary rules from D7:
 * - If `input.revision` is present: op.index < revision[scope] → before the upgrade boundary
 * - Otherwise: timestamp fallback
 * - Falls back to final module version when neither is decidable
 */
export function resolveModuleVersionForOp(
  opIndex: number,
  opTimestamp: string,
  scope: string,
  validatedUpgrades: ValidatedUpgrade[],
  finalVersion: number | undefined,
): number | undefined {
  if (validatedUpgrades.length === 0) {
    return finalVersion;
  }

  let currentVersion: number | undefined = validatedUpgrades[0]?.fromVersion;

  for (const upgrade of validatedUpgrades) {
    let beforeUpgrade: boolean;

    if (upgrade.revision !== undefined) {
      const boundary = upgrade.revision[scope] ?? 0;
      beforeUpgrade = opIndex < boundary;
    } else {
      beforeUpgrade = opTimestamp < upgrade.timestampUtcMs;
    }

    if (beforeUpgrade) {
      return currentVersion;
    }

    currentVersion = upgrade.toVersion;
  }

  return currentVersion;
}

/**
 * Applies one held-back upgrade, then re-applies the deletes the document
 * scope recorded after it so the hold-back cannot invert their order.
 */
function applyPendingUpgrade(
  document: PHDocument,
  pending: PendingUpgrade,
): PHDocument {
  document = applyUpgradeDocumentAction(
    document,
    pending.action,
    pending.upgradePath,
  );

  for (const deleteAction of pending.subsequentDeletes) {
    document = applyDeleteDocumentAction(document, deleteAction);
  }

  return document;
}

/**
 * Applies and removes every held-back upgrade whose target version is at or
 * below `throughVersion`, in the order the document scope recorded them.
 */
export function applyPendingUpgrades(
  document: PHDocument,
  pendingUpgrades: PendingUpgrade[],
  throughVersion: number,
): PHDocument {
  while (pendingUpgrades.length > 0) {
    const pending = pendingUpgrades[0];

    if (throughVersion < pending.action.input.toVersion) {
      break;
    }

    pendingUpgrades.shift();
    document = applyPendingUpgrade(document, pending);
  }

  return document;
}

/**
 * Applies the remaining held-back upgrades after the requested scope's
 * replay has finished. A head read applies them all. A positional read
 * applies only those whose boundary for this scope lies at or before the
 * target position: applying a later one would label migrated state with a
 * pre-upgrade revision, and a keyframe stored from that poisons every
 * rebuild that resumes from it. Boundaries come from the upgrade's revision
 * snapshot; an upgrade without one records no position for this scope, and
 * the replay loop not having crossed it already places it past the target.
 */
export function applyTailPendingUpgrades(
  document: PHDocument,
  pendingUpgrades: PendingUpgrade[],
  scope: string,
  targetRevision: number | undefined,
): PHDocument {
  while (pendingUpgrades.length > 0) {
    const pending = pendingUpgrades[0];

    if (targetRevision !== undefined) {
      const snapshot = pending.action.input.revision;
      if (snapshot === undefined) {
        break;
      }
      const boundary = snapshot[scope] ?? 0;
      if (boundary > targetRevision) {
        break;
      }
    }

    pendingUpgrades.shift();
    document = applyPendingUpgrade(document, pending);
  }

  return document;
}

/**
 * Rebuilds the document scope from its first row, holding back each
 * version-changing upgrade for the scope replay to apply at its boundary.
 */
export async function readDocumentScope(
  operationStore: IOperationStore,
  registry: IDocumentModelRegistry,
  gate: IProtocolGate | undefined,
  documentId: string,
  branch: string,
  documentScopeBound: number | undefined,
  signal?: AbortSignal,
): Promise<DocumentScopeRead> {
  let document: PHDocument;
  let lastDocumentScopeOperation: Operation | undefined;
  const validatedUpgrades: ValidatedUpgrade[] = [];
  const pendingUpgrades: PendingUpgrade[] = [];

  const createOpResult = await operationStore.getSince(
    documentId,
    "document",
    branch,
    -1,
    undefined,
    { cursor: "0", limit: 1 },
    signal,
  );

  // Typed, so the executor defers the job until the document arrives.
  if (createOpResult.results.length === 0) {
    throw new DocumentNotFoundError(documentId);
  }

  const createOp = createOpResult.results[0];
  if (isPurgeMarker(createOp)) {
    throw new DocumentPurgedError(documentId);
  }
  if (createOp.action.type !== "CREATE_DOCUMENT") {
    throw new Error(
      `Failed to rebuild document ${documentId}: first operation in document scope must be CREATE_DOCUMENT, found ${createOp.action.type}`,
    );
  }

  const documentCreateAction = createOp.action as CreateDocumentAction;
  const documentType = documentCreateAction.input.model;
  if (!documentType) {
    throw new Error(
      `Failed to rebuild document ${documentId}: CREATE_DOCUMENT action missing model in input`,
    );
  }

  document = createDocumentFromAction(documentCreateAction);
  gate?.assertRunnable(documentId, document.header.protocolVersions);
  lastDocumentScopeOperation = createOp;

  let docModule = registry.getModule(
    documentType,
    extractModuleVersion(document),
  );
  const docScopeOps = await operationStore.getSince(
    documentId,
    "document",
    branch,
    0,
    undefined,
    undefined,
    signal,
  );

  for (const operation of docScopeOps.results) {
    if (
      // in the case that the document scope was requested, we can exit early
      documentScopeBound !== undefined &&
      operation.index > documentScopeBound
    ) {
      break;
    }

    lastDocumentScopeOperation = operation;

    if (operation.index === 0) {
      continue;
    }

    if (operation.error || isDenied(operation)) {
      continue;
    }

    if (operation.action.type === "UPGRADE_DOCUMENT") {
      const upgradeAction = operation.action as UpgradeDocumentAction;
      const fromVersion = upgradeAction.input.fromVersion;
      const toVersion = upgradeAction.input.toVersion;

      if (fromVersion > 0 && fromVersion < toVersion) {
        let upgradePath: UpgradeTransition[] | undefined;
        try {
          upgradePath = registry.computeUpgradePath(
            documentType,
            fromVersion,
            toVersion,
          );
        } catch (err) {
          const upgradeInput = upgradeAction.input as {
            initialState?: unknown;
          };
          if (upgradeInput.initialState !== undefined) {
            upgradePath = undefined;
          } else {
            throw new Error(
              `Failed to rebuild document ${documentId}: no upgrade manifest for ${documentType} v${fromVersion}→v${toVersion} and no initialState snapshot. ${err instanceof Error ? err.message : String(err)}`,
              { cause: err },
            );
          }
        }
        validatedUpgrades.push({
          fromVersion,
          toVersion,
          revision: upgradeAction.input.revision,
          timestampUtcMs: operation.timestampUtcMs,
        });
        pendingUpgrades.push({
          action: upgradeAction,
          upgradePath,
          index: operation.index,
          subsequentDeletes: [],
        });
      } else {
        document = applyUpgradeDocumentAction(
          document,
          upgradeAction,
          undefined,
        );
      }

      docModule = registry.getModule(
        documentType,
        normalizeDocumentModelVersion(toVersion),
      );
    } else if (
      operation.action.type === "DELETE_DOCUMENT" ||
      operation.action.type === PURGE_DOCUMENT
    ) {
      applyDeleteDocumentAction(document, operation.action as never);
      for (const pending of pendingUpgrades) {
        pending.subsequentDeletes.push(
          operation.action as DeleteDocumentAction | PurgeDocumentAction,
        );
      }
    } else {
      const protocolVersion = baseReducerVersion(document.header);
      document = withProtocolVersions(
        docModule.reducer(document, operation.action, undefined, {
          skip: operation.skip,
          protocolVersion,
        }),
        document.header.protocolVersions,
      );
    }
  }

  return {
    document,
    documentType,
    validatedUpgrades,
    pendingUpgrades,
    lastDocumentScopeOperation,
  };
}
