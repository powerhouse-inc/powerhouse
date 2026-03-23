import type {
  DocumentOperations,
  Operation,
  PHBaseState,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import type {
  ConflictInfo,
  RemoteDocumentData,
  RemoteOperation,
} from "./types.js";

/** Convert SCREAMING_SNAKE_CASE to camelCase (e.g. "SET_MODEL_NAME" → "setModelName"). */
export function screamingSnakeToCamel(s: string): string {
  return s
    .toLowerCase()
    .replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Error thrown when a push conflict is detected with the "reject" strategy. */
export class ConflictError extends Error {
  constructor(public readonly conflict: ConflictInfo) {
    super("Push conflict: remote has new operations since last pull");
    this.name = "ConflictError";
  }
}

/** Convert a remote operation to the local Operation type. */
export function remoteOperationToLocal(remote: RemoteOperation): Operation {
  return {
    id: remote.id ?? "",
    index: remote.index,
    skip: remote.skip,
    timestampUtcMs: remote.timestampUtcMs,
    hash: remote.hash,
    error: remote.error ?? undefined,
    action: {
      id: remote.action.id,
      type: remote.action.type,
      timestampUtcMs: remote.action.timestampUtcMs,
      input: remote.action.input,
      scope: remote.action.scope,
      attachments: remote.action.attachments?.map((a) => ({
        data: a.data,
        mimeType: a.mimeType,
        hash: a.hash,
        extension: a.extension ?? undefined,
        fileName: a.fileName ?? undefined,
      })),
      context: remote.action.context?.signer
        ? {
            signer: {
              user: remote.action.context.signer.user ?? {
                address: "",
                networkId: "",
                chainId: 0,
              },
              app: remote.action.context.signer.app ?? {
                name: "",
                key: "",
              },
              signatures: remote.action.context.signer.signatures.map((s) =>
                deserializeSignature(s),
              ),
            },
          }
        : undefined,
    },
  };
}

/**
 * Deserialize a signature string back to a 5-element tuple.
 * The server serializes tuples via `tuple.join(", ")`.
 */
export function deserializeSignature(
  s: string,
): [string, string, string, string, string] {
  const parts = s.split(", ");
  return [
    parts[0] ?? "",
    parts[1] ?? "",
    parts[2] ?? "",
    parts[3] ?? "",
    parts[4] ?? "",
  ];
}

/** Convert remote operations to local DocumentOperations format. */
export function convertRemoteOperations(
  operationsByScope: Record<string, RemoteOperation[]>,
): DocumentOperations {
  const operations: DocumentOperations = {};
  for (const [scope, remoteOps] of Object.entries(operationsByScope)) {
    operations[scope] = remoteOps.map((op) => remoteOperationToLocal(op));
  }
  return operations;
}

/** Reconstruct a PHDocument from remote document data and operations. */
export function buildPulledDocument(
  remoteDoc: RemoteDocumentData,
  operations: DocumentOperations,
  initialDoc: PHDocument<PHBaseState>,
  branch: string,
): PHDocument<PHBaseState> {
  return {
    header: {
      ...initialDoc.header,
      id: remoteDoc.id,
      name: remoteDoc.name,
      slug: remoteDoc.slug ?? "",
      documentType: remoteDoc.documentType,
      createdAtUtcIso:
        typeof remoteDoc.createdAtUtcIso === "string"
          ? remoteDoc.createdAtUtcIso
          : remoteDoc.createdAtUtcIso.toISOString(),
      lastModifiedAtUtcIso:
        typeof remoteDoc.lastModifiedAtUtcIso === "string"
          ? remoteDoc.lastModifiedAtUtcIso
          : remoteDoc.lastModifiedAtUtcIso.toISOString(),
      revision: Object.fromEntries(
        remoteDoc.revisionsList.map((r) => [r.scope, r.revision]),
      ),
      branch,
    },
    state: remoteDoc.state as PHBaseState,
    initialState: initialDoc.initialState,
    operations,
    clipboard: [],
  };
}

/** Extract revision map from a remote document's revisionsList. */
export function extractRevisionMap(
  revisionsList: RemoteDocumentData["revisionsList"],
): Record<string, number> {
  return Object.fromEntries(revisionsList.map((r) => [r.scope, r.revision]));
}

/**
 * Check if any scope in currentRevision is ahead of knownRevision.
 * When `scopes` is provided, only those scopes are checked.
 */
export function hasRevisionConflict(
  currentRevision: Record<string, number>,
  knownRevision: Record<string, number>,
  scopes?: ReadonlySet<string>,
): boolean {
  for (const scope in currentRevision) {
    if (scopes && !scopes.has(scope)) continue;
    if ((currentRevision[scope] ?? 0) > (knownRevision[scope] ?? 0)) {
      return true;
    }
  }
  return false;
}
