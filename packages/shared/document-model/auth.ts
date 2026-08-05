import { stringify } from "safe-stable-stringify";
import { z } from "zod";
import { createAction, type Action } from "./actions.js";
import {
  assertAuthAdministrationRetained,
  assertValidGrantUpsert,
  assertValidInitialGrants,
  evaluateGrantStack,
  GrantSchema,
  isPlainValue,
  MAX_AUTH_GRANTS,
} from "./auth-v1.js";
import { base58Decode, base64UrlToBytes } from "./crypto.js";
import type { PHDocument } from "./documents.js";
import {
  AuthActionNotAllowedError,
  AuthAlreadyInitializedError,
  AuthInitializerNotCreatorError,
  AuthPolicyNotPreservedError,
  GrantNotFoundError,
  InvalidActionInputError,
  InvalidAuthVersionError,
} from "./errors.js";
import {
  createAuthState,
  type Grant,
  type PHAuthState,
  type PHBaseState,
} from "./state.js";

// --- Action types --------------------------------------------------------

export type InitializeAuthActionInput = {
  version: number;
  grants: Grant[];
};

export type SetGrantActionInput = {
  grant: Grant;
};

export type RemoveGrantActionInput = {
  id: string;
};

export type MoveGrantActionInput = {
  id: string;
  /** Target index in the grant list; clamped to the valid range. */
  index: number;
};

export type InitializeAuthAction = Action & {
  type: "INITIALIZE_AUTH";
  input: InitializeAuthActionInput;
};

export type SetGrantAction = Action & {
  type: "SET_GRANT";
  input: SetGrantActionInput;
};

export type RemoveGrantAction = Action & {
  type: "REMOVE_GRANT";
  input: RemoveGrantActionInput;
};

export type MoveGrantAction = Action & {
  type: "MOVE_GRANT";
  input: MoveGrantActionInput;
};

export type AuthAction =
  | InitializeAuthAction
  | SetGrantAction
  | RemoveGrantAction
  | MoveGrantAction;

export const AUTH_ACTION_TYPES = [
  "INITIALIZE_AUTH",
  "SET_GRANT",
  "REMOVE_GRANT",
  "MOVE_GRANT",
] as const;

export function isAuthAction(action: Action): action is AuthAction {
  return (AUTH_ACTION_TYPES as readonly string[]).includes(action.type);
}

// --- Version-1 grant validation ------------------------------------------

/** Highest known policy version; decide() fails closed above it. */
export const MAX_SUPPORTED_AUTH_VERSION = 1;

// --- Input schemas -------------------------------------------------------

export const InitializeAuthActionInputSchema = () =>
  z.object({
    version: z.number().int().min(1),
    grants: z.array(GrantSchema()).max(MAX_AUTH_GRANTS),
  });

export const SetGrantActionInputSchema = () =>
  z.object({
    grant: GrantSchema(),
  });

export const RemoveGrantActionInputSchema = () =>
  z.object({
    id: z.string(),
  });

export const MoveGrantActionInputSchema = () =>
  z.object({
    id: z.string(),
    index: z.number(),
  });

// --- Action creators -----------------------------------------------------

export const initializeAuth = (input: InitializeAuthActionInput) =>
  createAction<InitializeAuthAction>(
    "INITIALIZE_AUTH",
    input,
    undefined,
    InitializeAuthActionInputSchema,
    "auth",
  );

export const setGrant = (input: SetGrantActionInput) =>
  createAction<SetGrantAction>(
    "SET_GRANT",
    input,
    undefined,
    SetGrantActionInputSchema,
    "auth",
  );

export const removeGrant = (input: RemoveGrantActionInput) =>
  createAction<RemoveGrantAction>(
    "REMOVE_GRANT",
    input,
    undefined,
    RemoveGrantActionInputSchema,
    "auth",
  );

export const moveGrant = (input: MoveGrantActionInput) =>
  createAction<MoveGrantAction>(
    "MOVE_GRANT",
    input,
    undefined,
    MoveGrantActionInputSchema,
    "auth",
  );

// --- Handlers ------------------------------------------------------------

/**
 * Destructuring a null input (reachable via raw synced operations) would
 * store an engine-specific TypeError message on the error operation.
 */
function assertActionInputShape(input: unknown): void {
  if (!isPlainValue(input)) {
    throw new InvalidActionInputError({ input: "must be an object" });
  }
}

function withGrants<TState extends PHBaseState>(
  document: PHDocument<TState>,
  grants: Grant[],
): PHDocument<TState> {
  return {
    ...document,
    state: {
      ...document.state,
      auth: { ...document.state.auth, grants },
    },
  };
}

const P256_PUBKEY_MULTICODEC = [0x80, 0x24] as const;
const DID_KEY_PREFIX = "did:key:z";

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

/**
 * True when `signerKey` (an ActionSigner app key, a did:key) identifies the same
 * key recorded as the document creator. Returns false
 * when there is no creator (empty JWK) or no signer key.
 */
export function isDocumentCreator(
  creatorKey: JsonWebKey | undefined,
  signerKey: string | undefined,
): boolean {
  if (!creatorKey?.x || !creatorKey.y) {
    return false;
  }
  if (!signerKey || !signerKey.startsWith(DID_KEY_PREFIX)) {
    return false;
  }
  const decoded = base58Decode(signerKey.slice(DID_KEY_PREFIX.length));
  // 2-byte P-256 multicodec + 33-byte compressed point (prefix + 32-byte x).
  if (!decoded || decoded.length !== 35) {
    return false;
  }
  if (
    decoded[0] !== P256_PUBKEY_MULTICODEC[0] ||
    decoded[1] !== P256_PUBKEY_MULTICODEC[1]
  ) {
    return false;
  }
  const parityPrefix = decoded[2];
  if (parityPrefix !== 0x02 && parityPrefix !== 0x03) {
    return false;
  }
  const didX = decoded.subarray(3, 35);
  const jwkX = base64UrlToBytes(creatorKey.x);
  const jwkY = base64UrlToBytes(creatorKey.y);
  if (jwkX.length !== 32 || jwkY.length !== 32) {
    return false;
  }
  if (!bytesEqual(didX, jwkX)) {
    return false;
  }
  const jwkYIsOdd = (jwkY[31] & 1) === 1;
  const didYIsOdd = parityPrefix === 0x03;
  return jwkYIsOdd === didYIsOdd;
}

/**
 * Sets the initial policy. Valid only while the auth scope is uninitialized
 * (version 0). The input version is the policy language version and must be an
 * integer >= 1; 0 is reserved for the uninitialized state. On a signed-header
 * document it must be signed by the document creator (`header.sig.publicKey`).
 * A creator-less policy must include a grant permitting execute on the auth
 * scope, or it would be born locked out.
 */
export function applyInitializeAuthAction<TState extends PHBaseState>(
  document: PHDocument<TState>,
  action: InitializeAuthAction,
): PHDocument<TState> {
  assertActionInputShape(action.input);
  const { version, grants } = action.input;
  if (!Number.isInteger(version) || version < 1) {
    throw new InvalidAuthVersionError(document.header.id, version);
  }
  if (document.state.auth.version !== 0) {
    throw new AuthAlreadyInitializedError(document.header.id);
  }
  if (!Array.isArray(grants)) {
    throw new InvalidActionInputError({ grants: "must be an array" });
  }
  const creatorKey = document.header.sig.publicKey;
  const signerKey = action.context?.signer?.app.key;
  // Any key material marks a signed header. Unsupported key types then fail
  // closed through isDocumentCreator instead of degrading to an open genesis.
  const hasCreator = Boolean(creatorKey.kty || creatorKey.x || creatorKey.y);
  if (hasCreator && !isDocumentCreator(creatorKey, signerKey)) {
    throw new AuthInitializerNotCreatorError(document.header.id);
  }
  const creator = hasCreator ? signerKey : undefined;
  assertValidInitialGrants(grants, document.header.documentType, creator);
  return {
    ...document,
    state: {
      ...document.state,
      auth: createAuthState(
        creator ? { version, grants, creator } : { version, grants },
      ),
    },
  };
}

/** Upserts a grant by id: replaces in place if present, otherwise appends. */
export function applySetGrantAction<TState extends PHBaseState>(
  document: PHDocument<TState>,
  action: SetGrantAction,
): PHDocument<TState> {
  assertActionInputShape(action.input);
  const { grant } = action.input;
  const grants = document.state.auth.grants;
  assertValidGrantUpsert(
    grant,
    grants,
    document.header.documentType,
    document.state.auth.creator,
  );
  const exists = grants.some((g) => g.id === grant.id);
  const next = exists
    ? grants.map((g) => (g.id === grant.id ? grant : g))
    : [...grants, grant];
  return withGrants(document, next);
}

/**
 * Removes a grant by id; throws if the id is not present or if the removal
 * would leave a creator-less policy with no auth-administration grant.
 */
export function applyRemoveGrantAction<TState extends PHBaseState>(
  document: PHDocument<TState>,
  action: RemoveGrantAction,
): PHDocument<TState> {
  assertActionInputShape(action.input);
  const { id } = action.input;
  const { grants, creator } = document.state.auth;
  if (!grants.some((g) => g.id === id)) {
    throw new GrantNotFoundError(id);
  }
  const next = grants.filter((g) => g.id !== id);
  assertAuthAdministrationRetained(creator, grants, next, id);
  return withGrants(document, next);
}

/**
 * Moves a grant by id to a new index. Order is load-bearing (the last
 * applicable grant wins), so the relative order of the other grants is kept.
 * The target index is clamped to the valid range; an unknown id throws.
 *
 * Order alone decides which grant wins, so a move can take administration away
 * without changing the list's contents. It carries the same retention rule as
 * the two mutation paths.
 */
export function applyMoveGrantAction<TState extends PHBaseState>(
  document: PHDocument<TState>,
  action: MoveGrantAction,
): PHDocument<TState> {
  assertActionInputShape(action.input);
  const { id, index } = action.input;
  const { grants, creator } = document.state.auth;
  const from = grants.findIndex((g) => g.id === id);
  if (from === -1) {
    throw new GrantNotFoundError(id);
  }
  const next = [...grants];
  const [moved] = next.splice(from, 1);
  const to = Math.max(0, Math.min(index, next.length));
  next.splice(to, 0, moved);
  assertAuthAdministrationRetained(creator, grants, next, id);
  return withGrants(document, next);
}

/**
 * Dispatches an auth-scope action to its handler. This is the auth scope's
 * dedicated reducer: it is applied by the base reducer instead of the model
 * reducer, mirroring the document-scope platform handlers. Unknown types are a
 * no-op, matching the model-reducer default.
 */
export function applyAuthAction<TState extends PHBaseState>(
  document: PHDocument<TState>,
  action: Action,
): PHDocument<TState> {
  switch (action.type) {
    case "INITIALIZE_AUTH":
      return applyInitializeAuthAction(
        document,
        action as InitializeAuthAction,
      );
    case "SET_GRANT":
      return applySetGrantAction(document, action as SetGrantAction);
    case "REMOVE_GRANT":
      return applyRemoveGrantAction(document, action as RemoveGrantAction);
    case "MOVE_GRANT":
      return applyMoveGrantAction(document, action as MoveGrantAction);
    default:
      return document;
  }
}

/**
 * Because only creators can initialize auth scopes, we must verify that either
 * the document has no auth or the version and creator match.
 */
export function assertAuthPreservedOnDuplicate(
  documentId: string,
  source: PHAuthState | undefined,
  duplicated: PHAuthState | undefined,
): void {
  if (!source || source.version === 0) {
    return;
  }
  if (
    duplicated === undefined ||
    duplicated.version !== source.version ||
    duplicated.creator !== source.creator
  ) {
    throw new AuthPolicyNotPreservedError(documentId);
  }
}

/**
 * The auth scope a state snapshot may install, given the policy already there.
 *
 * `applyAuthAction` is the validated door onto `state.auth`, but a whole-state
 * snapshot (UPGRADE_DOCUMENT's `initialState`, LOAD_STATE's `data`) replaces the
 * scope wholesale and is authorized as a `document`-scope write. Without this,
 * a subject holding `execute` on `document` and no auth grant at all can install
 * a policy of its choosing, name itself `creator` (which exempts the policy from
 * the retention rule for good), or wipe an existing policy by carrying the
 * default uninitialized one.
 *
 * Three cases:
 *
 *   - the snapshot carries no policy, or an uninitialized one: the document
 *     keeps the policy it has, so a default-state upgrade cannot reset it;
 *   - the document is uninitialized and the snapshot carries a policy: the
 *     policy is installed after the same validation genesis applies, so it
 *     cannot be born locked out;
 *   - both carry a policy: they must agree. A duplicate preserves its source's
 *     policy (see {@link assertAuthPreservedOnDuplicate}), and anything else is
 *     an attempt to replace one policy with another.
 */
export function resolveSnapshotAuth(
  documentId: string,
  documentType: string,
  current: PHAuthState | undefined,
  incoming: PHAuthState | undefined,
): PHAuthState {
  const currentAuth = current ?? createAuthState({ version: 0, grants: [] });

  if (!incoming || !incoming.version) {
    return currentAuth;
  }

  if (currentAuth.version !== 0) {
    // The whole policy has to match, grants included: version and creator alone
    // would let one policy be swapped for another with the same version and no
    // creator. Serialized with sorted keys, because jsonb storage does not
    // preserve key order.
    if (stringify(incoming) !== stringify(currentAuth)) {
      throw new AuthPolicyNotPreservedError(documentId);
    }
    return incoming;
  }

  if (!Array.isArray(incoming.grants)) {
    throw new InvalidActionInputError({ grants: "must be an array" });
  }
  assertValidInitialGrants(incoming.grants, documentType, incoming.creator);
  return incoming;
}

/** UNDO, REDO and PRUNE are rejected on the auth scope. */
export function assertAuthScopeActionAllowed(action: Action): void {
  if (
    action.scope === "auth" &&
    ["UNDO", "REDO", "PRUNE"].includes(action.type)
  ) {
    throw new AuthActionNotAllowedError(action.type);
  }
}

// --- Decision (read-only policy evaluation) ------------------------------

export type AuthVerb = "read" | "execute";

export type AuthRequest = {
  verb: AuthVerb;
  scope: string;
  /** For execute: the operation (action type) being attempted. Omitted for reads. */
  operation?: string;
};

export type AuthSubject = {
  /** Verified signer address; undefined for an anonymous subject. */
  address?: string;
  /** The signer's app key (a did:key), used to match the document creator. */
  key?: string;
};

export type AuthDecision = "allow" | "deny";

/** Why the policy refused a request. */
export type AuthRefusal =
  | "version-unsupported"
  | "no-applicable-grant"
  | "denied-by-grant";

/**
 * A decision together with why it refused. A refusal names which of the
 * policy's rules produced it, so an operation records the reason it was refused
 * rather than one reason standing for every refusal.
 */
export type AuthEvaluation =
  | { decision: "allow" }
  | { decision: "deny"; refusal: AuthRefusal; grantId?: string };

/**
 * Evaluates the auth policy for a single request and reports why it refused.
 * Pure and deterministic.
 *
 * An uninitialized policy (version 0, absent auth state, or a legacy `{}`
 * auth scope serialized before PHAuthState had a version) leaves the document
 * open. Once a policy exists the default is deny, and grants stack in order.
 */
export function evaluate(
  auth: PHAuthState | undefined,
  subject: AuthSubject,
  request: AuthRequest,
): AuthEvaluation {
  if (!auth || !auth.version) {
    return { decision: "allow" };
  }

  // creators can always administer the auth scope, checked before the version
  // gate so an unknown policy version cannot brick its own administration
  if (
    request.verb === "execute" &&
    request.scope === "auth" &&
    subject.key !== undefined &&
    subject.key === auth.creator
  ) {
    return { decision: "allow" };
  }

  if (auth.version > MAX_SUPPORTED_AUTH_VERSION) {
    return { decision: "deny", refusal: "version-unsupported" };
  }

  return evaluateGrantStack(auth.grants, subject, request);
}

/**
 * Evaluates the auth policy for a single request. Pure and deterministic. This
 * is {@link evaluate} with the reason dropped.
 */
export function decide(
  auth: PHAuthState | undefined,
  subject: AuthSubject,
  request: AuthRequest,
): AuthDecision {
  return evaluate(auth, subject, request).decision;
}
