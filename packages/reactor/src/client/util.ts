import type {
  AuthSubject,
  ISigner,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import type { ViewFilter } from "../shared/types.js";

export function authSubjectFromSigner(signer: ISigner): AuthSubject {
  return { address: signer.user?.address, key: signer.app?.key };
}

// Ensures a scoped read still fetches the auth scope, so the gate sees the policy.
export function withAuthScope(view?: ViewFilter): ViewFilter | undefined {
  if (view?.scopes && view.scopes.length > 0) {
    return { ...view, scopes: [...new Set([...view.scopes, "auth"])] };
  }
  return view;
}

/**
 * Drops the scopes the predicate refuses. The predicate is resolved by the read
 * gate, which decides against the whole policy once per document; this only
 * applies the answer, so it stays synchronous.
 */
export function filterReadableScopes<TDocument extends PHDocument>(
  document: TDocument,
  readable: (scope: string) => boolean,
): TDocument {
  const state = document.state as Record<string, unknown> | undefined;
  if (!state) {
    return document;
  }

  // initialState carries the same scopes as state, so filtering one and
  // spreading the other hands back the contents just removed.
  return {
    ...document,
    state: keepReadableScopes(state, readable),
    initialState: keepReadableScopes(
      document.initialState as Record<string, unknown> | undefined,
      readable,
    ),
  } as TDocument;
}

function keepReadableScopes(
  scopes: Record<string, unknown> | undefined,
  readable: (scope: string) => boolean,
): Record<string, unknown> | undefined {
  if (!scopes) {
    return scopes;
  }
  const kept: Record<string, unknown> = {};
  for (const scope of Object.keys(scopes)) {
    if (readable(scope)) {
      kept[scope] = scopes[scope];
    }
  }
  return kept;
}
