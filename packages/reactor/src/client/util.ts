import type {
  AuthSubject,
  ISigner,
  PHAuthState,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { decide } from "@powerhousedao/shared/document-model";
import type { ViewFilter } from "../shared/types.js";

// Metadata scopes, always readable; only domain scopes are read-gated.
const ALWAYS_READABLE_SCOPES = new Set(["auth", "document"]);

export function authSubjectFromSigner(signer: ISigner): AuthSubject {
  return { address: signer.user?.address, key: signer.app?.key };
}

// True if the subject may read the scope (metadata scopes always readable).
export function canReadScope(
  auth: PHAuthState | undefined,
  subject: AuthSubject,
  scope: string,
): boolean {
  return (
    ALWAYS_READABLE_SCOPES.has(scope) ||
    decide(auth, subject, { verb: "read", scope }) === "allow"
  );
}

// Ensures a scoped read still fetches the auth scope, so the gate sees the policy.
export function withAuthScope(view?: ViewFilter): ViewFilter | undefined {
  if (view?.scopes && view.scopes.length > 0) {
    return { ...view, scopes: [...new Set([...view.scopes, "auth"])] };
  }
  return view;
}

// Drops domain scopes the subject may not read; auth/document always kept.
export function filterReadableScopes<TDocument extends PHDocument>(
  document: TDocument,
  subject: AuthSubject,
): TDocument {
  const state = document.state as Record<string, unknown> | undefined;
  if (!state) {
    return document;
  }
  const auth = document.state.auth;
  const filtered: Record<string, unknown> = {};
  for (const scope of Object.keys(state)) {
    if (canReadScope(auth, subject, scope)) {
      filtered[scope] = state[scope];
    }
  }
  return { ...document, state: filtered } as TDocument;
}
