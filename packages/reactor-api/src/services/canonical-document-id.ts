import type {
  IReactorReadClient,
  IReactorWriteClient,
} from "@powerhousedao/reactor";
import type { CanonicalDocumentId } from "./authorization.service.js";

/**
 * Raised when a caller-supplied identifier cannot be resolved to a canonical
 * document id. Carries no detail on purpose: resolution failures must not act
 * as a document-existence oracle, so consumers map this to their generic
 * fail-closed response.
 */
export class CanonicalDocumentIdResolutionError extends Error {
  constructor() {
    super("Document identifier could not be resolved");
    this.name = "CanonicalDocumentIdResolutionError";
  }
}

export type CanonicalDocumentIdResolver = (
  identifier: string,
) => Promise<CanonicalDocumentId>;

/** Resolves an identifier the way the read side's data paths do. */
export type ReadSideIdentity = Pick<IReactorReadClient, "resolveIdOrSlug">;

/** Resolves an identifier the way a mutation resolves its target. */
export type WriteSideIdentity = Pick<IReactorWriteClient, "describe">;

/** The halves an identifier can be resolved on; mutations need `write`. */
export type CanonicalIdClients = {
  read: ReadSideIdentity;
  write?: WriteSideIdentity;
};

/** Which side resolves: a mutation resolves on the write side. */
export type CanonicalIdOperation = "query" | "mutation" | "subscription";

/**
 * The sanctioned string-to-CanonicalDocumentId cast: both the GraphQL layer
 * and server routes must resolve caller identifiers through this helper so
 * decision and data layers always agree on the subject document.
 *
 * Queries and subscriptions resolve on the read half (`resolveIdOrSlug`, the
 * lookup their data fetch makes); mutations on the write half (`describe`, the
 * lookup their write makes). A bare read client (or the facade, whose
 * `write` is then used) is accepted as the read half.
 */
export function createCanonicalDocumentIdResolver(
  clients: CanonicalIdClients | ReadSideIdentity,
  operationType: CanonicalIdOperation = "query",
): CanonicalDocumentIdResolver {
  const pair: CanonicalIdClients =
    "resolveIdOrSlug" in clients
      ? {
          read: clients,
          write: (clients as { write?: WriteSideIdentity }).write,
        }
      : clients;
  if (operationType === "mutation" && !pair.write) {
    throw new Error(
      "A mutation resolves identifiers on the write half; none was given",
    );
  }
  return async (identifier: string) => {
    let resolved: string;
    try {
      resolved =
        operationType === "mutation"
          ? (await pair.write!.describe(identifier)).documentId
          : await pair.read.resolveIdOrSlug(identifier);
    } catch {
      throw new CanonicalDocumentIdResolutionError();
    }
    return resolved as CanonicalDocumentId;
  };
}
