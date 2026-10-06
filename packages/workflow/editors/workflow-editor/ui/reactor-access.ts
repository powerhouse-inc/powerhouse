// Reactor connections in the editor (ADR 0005 §5, §8, §9): which connections
// a step may bind, when to ask for sign-in, and the grant the Switchboard needs.
import {
  decide,
  type Grant,
  type PHAuthState,
} from "@powerhousedao/shared/document-model";
import { REACTOR_CONNECTOR_ID } from "document-models/connection";

export const REACTOR_AUTH_TYPE = "REACTOR";

export function isReactorConnection(connection: {
  connectorId: string;
  authType: string;
}): boolean {
  return (
    connection.authType === REACTOR_AUTH_TYPE &&
    connection.connectorId === REACTOR_CONNECTOR_ID
  );
}

export function reactorConnections<
  T extends { connectorId: string; authType: string },
>(connections: readonly T[]): T[] {
  return connections.filter(isReactorConnection);
}

// Unknown enforcement asks for nothing; the runtime still refuses.
export function signInRequired(
  access: { authEnforcement: boolean } | undefined,
  signedIn: boolean,
): boolean {
  return access?.authEnforcement === true && !signedIn;
}

export interface ReactorIdentityView {
  address: string | null;
  key: string;
}

// Stable per identity, so granting again replaces the same grant.
export function switchboardGrantId(identity: ReactorIdentityView): string {
  return `switchboard:${identity.address ?? identity.key}`;
}

// Document-scope operations the Switchboard applies for a piece: create in a
// drive and delete (with the parents' relationship removals).
export const SWITCHBOARD_DOCUMENT_OPERATIONS = [
  "DELETE_DOCUMENT",
  "ADD_RELATIONSHIP",
  "REMOVE_RELATIONSHIP",
] as const;

// By key under authConditions, else by address; empty when neither can match.
// Never the auth scope, so the Switchboard cannot change grants.
export function switchboardGrants(
  identity: ReactorIdentityView | null | undefined,
  authConditions: boolean | null | undefined,
): Grant[] {
  if (!identity) return [];
  const principal: Grant["principal"] | null = authConditions
    ? { match: { eq: [{ attr: "subject.key" }, { lit: identity.key }] } }
    : identity.address
      ? { address: identity.address }
      : null;
  if (!principal) return [];
  const grant = (id: string, capability: Grant["capability"]): Grant => ({
    id,
    description: "Lets the Switchboard apply workflow writes",
    effect: "allow",
    principal,
    capability,
  });
  return [
    grant(switchboardGrantId(identity), { can: "execute", scope: "global" }),
    grant(`${switchboardGrantId(identity)}:document`, {
      can: "execute",
      scope: "document",
      operation: [...SWITCHBOARD_DOCUMENT_OPERATIONS],
    }),
  ];
}

// Whether a document already lets the Switchboard write: open, granted from
// here, or granted to its address.
export function switchboardMayWrite(
  auth: PHAuthState | undefined,
  identity: ReactorIdentityView,
): boolean {
  const id = switchboardGrantId(identity);
  const ids = new Set(auth?.grants.map((grant) => grant.id));
  if (ids.has(id) && ids.has(`${id}:document`)) return true;
  const subject = identity.address ? { address: identity.address } : {};
  return (
    decide(auth, subject, { verb: "execute", scope: "global" }) === "allow" &&
    SWITCHBOARD_DOCUMENT_OPERATIONS.every(
      (operation) =>
        decide(auth, subject, {
          verb: "execute",
          scope: "document",
          operation,
        }) === "allow",
    )
  );
}

export interface GrantSubject {
  address?: string;
  key?: string;
}

// Whether the subject may change a document's grants; groups and conditions
// are not known here, so a grant through either reads as none.
export function canChangeGrants(
  auth: PHAuthState | undefined,
  subject: GrantSubject,
): boolean {
  return (
    decide(auth, subject, {
      verb: "execute",
      scope: "auth",
      operation: "SET_GRANT",
    }) === "allow"
  );
}

export interface GrantPlan {
  grantable: string[];
  // Documents whose grants the user may not change: their admin must grant.
  noPermission: string[];
  // Documents this Connect doesn't hold, so it can't grant on them.
  notHere: string[];
}

// Splits documents by whether the user may grant on each; `auth` is null for
// a document this editor cannot load.
export function planGrants(
  ids: readonly string[],
  authOf: (id: string) => PHAuthState | undefined | null,
  subject: GrantSubject,
): GrantPlan {
  const plan: GrantPlan = { grantable: [], noPermission: [], notHere: [] };
  for (const id of ids) {
    const auth = authOf(id);
    if (auth === null) plan.notHere.push(id);
    else if (canChangeGrants(auth, subject)) plan.grantable.push(id);
    else plan.noPermission.push(id);
  }
  return plan;
}

export interface ReactorConfigDraft {
  access?: "read";
}

// A REACTOR config with its access changed; write access is left out.
export function withReactorConfig(
  current: ReactorConfigDraft,
  patch: { access?: "read" | "write" },
): { endpoint: "local"; access?: "read" } {
  const access =
    patch.access === undefined
      ? current.access
      : patch.access === "read"
        ? "read"
        : undefined;
  return { endpoint: "local", ...(access ? { access } : {}) };
}

// A write step bound to a read-only connection fails on its first write.
export function accessMismatch(
  requireReactor: "read" | "write" | null | undefined,
  access: "read" | undefined,
): string | null {
  return requireReactor === "write" && access === "read"
    ? "Writes, but this connection allows reads only"
    : null;
}
