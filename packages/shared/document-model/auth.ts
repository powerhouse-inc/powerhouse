import { z } from "zod";
import { createAction, type Action } from "./actions.js";
import type { PHDocument } from "./documents.js";
import {
  AuthActionNotAllowedError,
  AuthAlreadyInitializedError,
  GrantNotFoundError,
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
    version: z.number(),
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

/**
 * Genesis action: sets the initial policy. Valid only while the auth scope is
 * uninitialized (version 0); a second INITIALIZE_AUTH throws.
 */
export function applyInitializeAuthAction<TState extends PHBaseState>(
  document: PHDocument<TState>,
  action: InitializeAuthAction,
): PHDocument<TState> {
  if (document.state.auth.version !== 0) {
    throw new AuthAlreadyInitializedError(document.header.id);
  }
  const { version, grants } = action.input;
  return {
    ...document,
    state: {
      ...document.state,
      auth: createAuthState({ version, grants }),
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
};

export type AuthDecision = "allow" | "deny";

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
 * open (legacy). Once a policy exists the default is deny, and grants stack in
 * order — the last grant whose capability and principal both match decides.
 * Group principals and `where` conditions are not evaluated yet, so grants that
 * rely on them never match.
 */
export function decide(
  auth: PHAuthState | undefined,
  subject: AuthSubject,
  request: AuthRequest,
): AuthDecision {
  if (!auth || auth.version === 0) {
    return "allow";
  }
  let decision: AuthDecision = "deny";
  for (const grant of auth.grants) {
    if (
      capabilityCovers(grant.capability, request) &&
      principalMatches(grant.principal, subject)
    ) {
      decision = grant.effect;
    }
  }
  return decision;
}
