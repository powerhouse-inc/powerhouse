import type {
  DocumentOperations,
  Operation,
  PHBaseState,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import type { SignaturePolicy } from "@powerhousedao/shared/document-model";
import {
  creationState,
  deserializeSignature,
  signaturePolicyOf,
  withSignaturePolicy,
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
    deniedReason: remote.deniedReason ?? undefined,
    action: {
      id: remote.action.id,
      type: remote.action.type,
      timestampUtcMs: remote.action.timestampUtcMs,
      input: remote.action.input,
      scope: remote.action.scope,
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
 * Re-exported from shared, where it sits beside the serializer it has to agree
 * with. Kept exported here because this module's consumers import it from here.
 */
export { deserializeSignature };

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

/**
 * Reconstruct a PHDocument from remote document data and operations; the
 * header carries the remote protocol versions. `initialDoc` supplies the rest
 * of the header, and the initial state when the operations do not record one.
 */
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
      // The creator chose these; the local reducer must run what the host runs.
      ...(remoteDoc.protocolVersions != null
        ? {
            protocolVersions: remoteDoc.protocolVersions as Record<
              string,
              number
            >,
          }
        : {}),
    },
    state: remoteDoc.state as PHBaseState,
    // Undo re-derives a scope from here, so it must be the state the creator recorded.
    initialState:
      creationState(operations.document ?? []) ?? initialDoc.initialState,
    operations,
    clipboard: [],
  };
}

/** `document` as created: its header and initial state, without scope operations. */
export function uncreatedDocument(
  document: PHDocument<PHBaseState>,
): PHDocument<PHBaseState> {
  const { header, initialState } = structuredClone({
    header: document.header,
    initialState: document.initialState,
  });
  return {
    header,
    state: initialState,
    initialState,
    operations: {},
    clipboard: [],
  };
}

/** An uncreated `document` under `policy`; a legacy one keeps its id. */
export function underSignaturePolicy(
  document: PHDocument<PHBaseState>,
  policy: SignaturePolicy,
): PHDocument<PHBaseState> {
  if (signaturePolicyOf(document.header) === policy) {
    return document;
  }
  return withSignaturePolicy(document, policy, { id: document.header.id });
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
