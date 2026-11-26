import { shortHostSessionId } from "@powerhousedao/shared/clis/host-sessions";
import type {
  RouteHostSession,
  RouteUser,
} from "@powerhousedao/shared/processors";
import { childLogger } from "document-model";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * While a request borne by a host session token runs, this scope holds the
 * session, so the decisions that take an address only (`isOperator`, and
 * `isSupremeAdmin` outside OPEN) answer no for it: a host session signs its
 * user's document writes and administers nothing, whoever its user is.
 *
 * The GraphQL door, the resolver binder, HTTP `/mcp` and the attachment
 * routes run their work in it; host work (processors, workflows) runs outside
 * any request and is never in it.
 */

const logger = childLogger(["reactor-api", "host-sessions"]);

/** A caller whose bearer is a host session token. */
export type HostSessionUser = RouteUser & {
  via: "host-session";
  hostSession: RouteHostSession;
};

type Scope = {
  user: HostSessionUser;
  /** The field or tool the scope runs, for the log. */
  where: string | undefined;
  refusalLogged: boolean;
};

const scope = new AsyncLocalStorage<Scope | undefined>();

export function isHostSessionUser(user: unknown): user is HostSessionUser {
  const u = user as Partial<HostSessionUser> | undefined;
  return u?.via === "host-session" && typeof u.hostSession?.id === "string";
}

/**
 * Runs `run` as `user`: in the scope of its host session when its bearer is a
 * host session token, else outside any. `where` names the field or tool.
 */
export function runAsCaller<T>(
  user: RouteUser | undefined,
  run: () => T,
  where?: string,
): T {
  if (isHostSessionUser(user)) {
    return scope.run({ user, where, refusalLogged: false }, run);
  }
  return scope.getStore() ? scope.run(undefined, run) : run();
}

/** The host session the running request is borne by, if any. */
export function currentHostSession(): HostSessionUser | undefined {
  return scope.getStore()?.user;
}

/** `0x1a2b...9f3c`. */
export function shortAddress(address: string): string {
  return address.length > 12
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : address;
}

/** `Host session 3f9c1a2b "billing" for 0x1a2b...9f3c`: what a log line names. */
export function describeHostSession(
  user: Pick<HostSessionUser, "address" | "label" | "hostSession">,
): string {
  return `Host session ${shortHostSessionId(user.hostSession.id)} "${user.label ?? ""}" for ${shortAddress(user.address)}`;
}

/**
 * Whether the running request is borne by a host session, which may not
 * administer. Logs the refusal once per field or tool.
 */
export function refusesAdministration(): boolean {
  const held = scope.getStore();
  if (!held) return false;
  if (!held.refusalLogged) {
    held.refusalLogged = true;
    logger.warn(
      "@session: administrative call refused@where (a host session administers nothing)",
      describeHostSession(held.user),
      held.where ? ` (${held.where})` : "",
    );
  }
  return true;
}
