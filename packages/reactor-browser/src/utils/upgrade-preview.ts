import type { IDocumentModelRegistry } from "@powerhousedao/reactor";
import type {
  Action,
  PHDocument,
  UpgradeTransition,
} from "@powerhousedao/shared/document-model";

const NON_DOMAIN_SCOPES = new Set(["auth", "document"]);

export type UpgradeStepInfo = {
  toVersion: number;
  description: string;
};

export type DocumentUpgradePreview = {
  fromVersion: number;
  toVersion: number;
  steps: UpgradeStepInfo[];
  addedFields: string[];
  removedFields: string[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function walkShapes(
  before: unknown,
  after: unknown,
  path: string,
  added: string[],
  removed: string[],
): void {
  if (isPlainObject(before) && isPlainObject(after)) {
    const beforeKeys = Object.keys(before);
    const afterKeys = Object.keys(after);
    for (const key of afterKeys) {
      const childPath = path ? `${path}.${key}` : key;
      if (!beforeKeys.includes(key)) {
        added.push(childPath);
        continue;
      }
      walkShapes(before[key], after[key], childPath, added, removed);
    }
    for (const key of beforeKeys) {
      if (!afterKeys.includes(key)) {
        removed.push(path ? `${path}.${key}` : key);
      }
    }
    return;
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    if (before.length > 0 && after.length > 0) {
      walkShapes(before[0], after[0], `${path}[]`, added, removed);
    }
  }
}

/**
 * Recursively diffs the structural shape of two values, returning dot-paths
 * of keys present in `after` but not `before` (added) and vice versa
 * (removed). Array fields are compared by the shape of a representative
 * element (the first element on each side, when both sides have one) using
 * the `path[]` notation, e.g. `todos[].status`. Only key presence is
 * compared — array length and primitive values are ignored.
 */
export function diffStateShapes(
  before: unknown,
  after: unknown,
): { added: string[]; removed: string[] } {
  const added: string[] = [];
  const removed: string[] = [];
  walkShapes(before, after, "", added, removed);
  return { added, removed };
}

/**
 * Computes a dry-run preview of upgrading `document` to the latest
 * registered version of its document model: the version jump, the upgrade
 * steps that will run, and which state fields will be added or removed.
 * Applies the upgrade reducers against a deep clone of the document, so the
 * original is left untouched.
 *
 * Returns undefined when the registry is unavailable, the document is
 * already at (or above) the latest registered version, or the upgrade path
 * cannot be computed.
 */
export function getDocumentUpgradePreview(
  document: PHDocument,
  registry: IDocumentModelRegistry | undefined,
): DocumentUpgradePreview | undefined {
  if (!registry) {
    return undefined;
  }

  const documentType = document.header.documentType;
  const fromVersion = document.state.document.version || 1;
  let latestVersion: number;
  try {
    latestVersion = registry.getLatestVersion(documentType);
  } catch {
    return undefined;
  }
  if (fromVersion >= latestVersion) {
    return undefined;
  }

  let transitions: UpgradeTransition[];
  try {
    transitions = registry.computeUpgradePath(
      documentType,
      fromVersion,
      latestVersion,
    );
  } catch {
    return undefined;
  }

  const stubAction: Action = {
    id: "",
    type: "UPGRADE_DOCUMENT",
    scope: "document",
    timestampUtcMs: "",
    input: {
      documentId: document.header.id,
      model: documentType,
      fromVersion,
      toVersion: latestVersion,
    },
  };

  // The dry-run executes real upgrade reducers during render; a migration
  // that is not implemented yet (codegen's manual stub throws) must not
  // crash the caller.
  let upgraded = structuredClone(document);
  try {
    for (const transition of transitions) {
      upgraded = transition.upgradeReducer(upgraded, stubAction);
    }
  } catch {
    return undefined;
  }

  const addedFields: string[] = [];
  const removedFields: string[] = [];
  const scopes = new Set([
    ...Object.keys(document.state),
    ...Object.keys(upgraded.state),
  ]);
  for (const scope of scopes) {
    if (NON_DOMAIN_SCOPES.has(scope)) {
      continue;
    }
    const beforeScope = (document.state as Record<string, unknown>)[scope];
    const afterScope = (upgraded.state as Record<string, unknown>)[scope];
    const { added, removed } = diffStateShapes(beforeScope, afterScope);
    for (const path of added) {
      addedFields.push(`${scope}.${path}`);
    }
    for (const path of removed) {
      removedFields.push(`${scope}.${path}`);
    }
  }

  return {
    fromVersion,
    toVersion: latestVersion,
    steps: transitions.map((transition) => ({
      toVersion: transition.toVersion,
      description: transition.description ?? "",
    })),
    addedFields,
    removedFields,
  };
}
