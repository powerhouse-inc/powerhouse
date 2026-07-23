import { z } from "zod";
import { createAction, type Action } from "./actions.js";
import { base58Decode, base64UrlToBytes } from "./crypto.js";
import type { PHDocument } from "./documents.js";
import {
  AuthActionNotAllowedError,
  AuthAlreadyInitializedError,
  AuthInitializerNotCreatorError,
  GrantNotFoundError,
  InvalidAuthVersionError,
} from "./errors.js";
import {
  createAuthState,
  type Capability,
  type Grant,
  type PHAuthState,
  type PHBaseState,
  type Principal,
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

// --- Input schemas -------------------------------------------------------

// Grants carry the not-yet-enforced policy shapes (principal/capability/where),
// so only the scalar fields are validated; principal and capability are checked
// as present objects, not by their full union shape.
function isGrantShape(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const g = value as Record<string, unknown>;
  return (
    typeof g.id === "string" &&
    typeof g.description === "string" &&
    (g.effect === "allow" || g.effect === "deny") &&
    typeof g.principal === "object" &&
    g.principal !== null &&
    typeof g.capability === "object" &&
    g.capability !== null
  );
}

const GrantSchema = () => z.custom<Grant>(isGrantShape);

export const InitializeAuthActionInputSchema = () =>
  z.object({
    version: z.number().int().min(1),
    grants: z.array(GrantSchema()),
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
 */
export function applyInitializeAuthAction<TState extends PHBaseState>(
  document: PHDocument<TState>,
  action: InitializeAuthAction,
): PHDocument<TState> {
  const { version, grants } = action.input;
  if (!Number.isInteger(version) || version < 1) {
    throw new InvalidAuthVersionError(document.header.id, version);
  }
  if (document.state.auth.version !== 0) {
    throw new AuthAlreadyInitializedError(document.header.id);
  }
  const creatorKey = document.header.sig.publicKey;
  const signerKey = action.context?.signer?.app.key;
  const hasCreator = Boolean(creatorKey.x && creatorKey.y);
  if (hasCreator && !isDocumentCreator(creatorKey, signerKey)) {
    throw new AuthInitializerNotCreatorError(document.header.id);
  }
  const creator = hasCreator ? signerKey : undefined;
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
  const { grant } = action.input;
  const grants = document.state.auth.grants;
  const exists = grants.some((g) => g.id === grant.id);
  const next = exists
    ? grants.map((g) => (g.id === grant.id ? grant : g))
    : [...grants, grant];
  return withGrants(document, next);
}

/** Removes a grant by id; throws if the id is not present. */
export function applyRemoveGrantAction<TState extends PHBaseState>(
  document: PHDocument<TState>,
  action: RemoveGrantAction,
): PHDocument<TState> {
  const { id } = action.input;
  const grants = document.state.auth.grants;
  if (!grants.some((g) => g.id === id)) {
    throw new GrantNotFoundError(id);
  }
  return withGrants(
    document,
    grants.filter((g) => g.id !== id),
  );
}

/**
 * Moves a grant by id to a new index. Order is load-bearing (the last
 * applicable grant wins), so the relative order of the other grants is kept.
 * The target index is clamped to the valid range; an unknown id throws.
 */
export function applyMoveGrantAction<TState extends PHBaseState>(
  document: PHDocument<TState>,
  action: MoveGrantAction,
): PHDocument<TState> {
  const { id, index } = action.input;
  const grants = document.state.auth.grants;
  const from = grants.findIndex((g) => g.id === id);
  if (from === -1) {
    throw new GrantNotFoundError(id);
  }
  const next = [...grants];
  const [moved] = next.splice(from, 1);
  const to = Math.max(0, Math.min(index, next.length));
  next.splice(to, 0, moved);
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

export type DecideOptions = {
  /** Supreme-admin addresses that may always administer the auth scope. */
  admins?: string[];
};

function capabilityCovers(
  capability: Capability,
  request: AuthRequest,
): boolean {
  if (capability.can !== request.verb) {
    return false;
  }
  const scope = capability.scope;
  if (scope !== undefined && scope !== "*" && scope !== request.scope) {
    return false;
  }
  if (capability.can === "execute") {
    // An execute capability with no operation list covers every operation in the scope.
    if (capability.operation === undefined) {
      return true;
    }
    return (
      request.operation !== undefined &&
      capability.operation.includes(request.operation)
    );
  }
  return true;
}

function principalMatches(principal: Principal, subject: AuthSubject): boolean {
  if ("anyone" in principal) {
    return true;
  }
  if ("address" in principal) {
    return (
      subject.address !== undefined &&
      subject.address.toLowerCase() === principal.address.toLowerCase()
    );
  }
  // { group } and { match } are not evaluated yet: group membership needs the
  // PHGroup model (a missing group never widens access) and conditions are deferred.
  return false;
}

/**
 * Evaluates the auth policy for a single request. Pure and deterministic.
 *
 * An uninitialized policy (version 0, or absent auth state) leaves the document
 * open. Once a policy exists the default is deny, and grants stack in order.
 *
 * Group and match principals and `where` conditions are not evaluated yet; a
 * grant that uses any of them never applies.
 */
export function decide(
  auth: PHAuthState | undefined,
  subject: AuthSubject,
  request: AuthRequest,
  options?: DecideOptions,
): AuthDecision {
  if (!auth || auth.version === 0) {
    return "allow";
  }
  // the creator can always execute auth-scope operations
  if (request.verb === "execute" && request.scope === "auth") {
    if (subject.key !== undefined && subject.key === auth.creator) {
      return "allow";
    }
    const address = subject.address;
    if (
      address !== undefined &&
      options?.admins?.some((a) => a.toLowerCase() === address.toLowerCase())
    ) {
      return "allow";
    }
  }
  let decision: AuthDecision = "deny";
  for (const grant of auth.grants) {
    // `where` is not evaluated yet; a conditional grant never applies.
    if (grant.where !== undefined) {
      continue;
    }
    if (
      capabilityCovers(grant.capability, request) &&
      principalMatches(grant.principal, subject)
    ) {
      decision = grant.effect;
    }
  }
  return decision;
}
