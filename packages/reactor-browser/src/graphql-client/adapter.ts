import type {
  DocumentOperations,
  PHBaseState,
  PHDocument,
  PHDocumentHeader,
} from "document-model";
import type { GetDocumentQuery } from "../graphql/gen/schema.js";
import type { RemoteOperation } from "../remote-controller/types.js";
import { remoteOperationToLocal } from "../remote-controller/utils.js";

/** The `document` payload of a `GetDocument` query, once the null case is handled. */
export type GetDocumentQueryResult = NonNullable<GetDocumentQuery["document"]>;

/** The `PHDocumentFields` fragment as returned by `GetDocument`. */
export type GetDocumentQueryFields = GetDocumentQueryResult["document"];

/** The `revisionsList` selection of the `PHDocumentFields` fragment. */
export type RevisionsListSelection = GetDocumentQueryFields["revisionsList"];

/**
 * Converts a `GetDocument` result into a `PHDocument`.
 *
 * Unlike the legacy `src/graphql/adapters.ts` this preserves the per-scope
 * revision map, which the write path needs to compute the `prevOpIndex` of a
 * signed action. `sig` is filled with the empty shape used by
 * `createPresignedHeader`: the creation signature is not fetchable over
 * GraphQL and is not part of the operation signing payload.
 *
 * The read path never fetches operation history, so `operations` is a map of
 * the document's known scopes to empty arrays.
 *
 * `branch` is the branch the document was read from. The GraphQL type does not
 * carry it, so it has to be passed back in by the caller; it defaults to the
 * server's own default branch.
 */
export function phDocumentFromGetDocument<
  TDocument extends PHDocument = PHDocument,
>(document: GetDocumentQueryFields, branch?: string): TDocument {
  const state = document.state as PHBaseState;
  const phDocument: PHDocument = {
    header: phDocumentHeaderFromGetDocument(document, branch),
    state,
    initialState: state,
    operations: emptyOperationsForScopes(document.revisionsList),
    clipboard: [],
  };
  return phDocument as TDocument;
}

/**
 * Converts a mutation result into a `PHDocument`, carrying the operations the
 * mutation produced.
 *
 * `dispatchActions` reads per-action failures out of `operations[scope]`, so
 * unlike the read path this one must not return empty operation lists.
 */
export function phDocumentFromMutation<
  TDocument extends PHDocument = PHDocument,
>(
  document: GetDocumentQueryFields,
  operations: readonly RemoteOperation[],
  branch?: string,
): TDocument {
  const phDocument = phDocumentFromGetDocument<TDocument>(document, branch);
  const operationsByScope: DocumentOperations = { ...phDocument.operations };

  for (const remote of operations) {
    const operation = remoteOperationToLocal(remote);
    const scope = operation.action.scope;
    const scopeOperations = operationsByScope[scope] ?? [];
    scopeOperations.push(operation);
    operationsByScope[scope] = scopeOperations;
  }

  phDocument.operations = operationsByScope;
  return phDocument;
}

/** Turns a `revisionsList` selection into the header's per-scope revision map. */
export function revisionMapFromRevisionsList(
  revisionsList: RevisionsListSelection,
): Record<string, number> {
  return Object.fromEntries(revisionsList.map((r) => [r.scope, r.revision]));
}

/** The branch the server reads and writes when none is asked for. */
const defaultBranch = "main";

function phDocumentHeaderFromGetDocument(
  document: GetDocumentQueryFields,
  branch?: string,
): PHDocumentHeader {
  return {
    id: document.id,
    sig: {
      publicKey: {},
      nonce: "",
    },
    documentType: document.documentType,
    createdAtUtcIso: isoStringFromDateTime(document.createdAtUtcIso),
    slug: document.slug ?? "",
    name: document.name,
    branch: branch ?? defaultBranch,
    revision: revisionMapFromRevisionsList(document.revisionsList),
    lastModifiedAtUtcIso: isoStringFromDateTime(document.lastModifiedAtUtcIso),
  };
}

function emptyOperationsForScopes(
  revisionsList: RevisionsListSelection,
): DocumentOperations {
  return Object.fromEntries(revisionsList.map((r) => [r.scope, []]));
}

/** The `DateTime` scalar deserializes as either an ISO string or a `Date`. */
function isoStringFromDateTime(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}
