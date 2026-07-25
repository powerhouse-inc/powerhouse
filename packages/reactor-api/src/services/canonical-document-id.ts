import type { IReactorClient } from "@powerhousedao/reactor";
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

/**
 * The sanctioned string-to-CanonicalDocumentId cast: both the GraphQL layer
 * and server routes must resolve caller identifiers through this helper so
 * decision and data layers always agree on the subject document.
 */
export function createCanonicalDocumentIdResolver(
  client: Pick<IReactorClient, "resolveIdOrSlug">,
): CanonicalDocumentIdResolver {
  return async (identifier: string) => {
    let resolved: string;
    try {
      resolved = await client.resolveIdOrSlug(identifier);
    } catch {
      throw new CanonicalDocumentIdResolutionError();
    }
    return resolved as CanonicalDocumentId;
  };
}
