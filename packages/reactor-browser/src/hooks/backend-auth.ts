import { ORIGIN_PLACEHOLDER } from "@powerhousedao/shared/connect/origin-placeholder";
import { switchboardOfDrive } from "@powerhousedao/shared/host-tokens";
import { answerCredentialRefusal } from "../graphql-client/auth.js";
import { GQL_CHANNEL_SUFFIX } from "../utils/gql-channel.js";
import type {
  BackendAuthState,
  SetPHGlobalValue,
  UsePHGlobalValue,
} from "../types/global.js";
import { makePHEventFunctions } from "./make-ph-event-functions.js";

const backendAuthEventFunctions = makePHEventFunctions("backendAuth");

/** Whether the app's backend refused this tab's caller, and how. */
export const useBackendAuth: UsePHGlobalValue<BackendAuthState> =
  backendAuthEventFunctions.useValue;

/** Records (or clears, with `undefined`) a backend's refusal of the caller. */
export const setBackendAuth: SetPHGlobalValue<BackendAuthState> =
  backendAuthEventFunctions.setValue;

export const addBackendAuthEventHandler =
  backendAuthEventFunctions.addEventHandler;

const STATUS_IN_MESSAGE = /\(Code: (401|403)\)/;

/**
 * The messages a Switchboard's GraphQL layer refuses with, without an HTTP
 * status (the sync layer's `DRIVE_AUTH_ERROR_MESSAGES`). Inlined: this file
 * is reachable from the browser entry, which must not import the reactor
 * package as a value.
 */
const GRAPHQL_REFUSALS = [
  "Forbidden: insufficient permissions",
  "Forbidden: authentication required",
  "Authentication required",
] as const;

/**
 * The HTTP status with which a backend refused the caller, or null when the
 * error is something else.
 *
 * Covers every shape a refusal reaches the browser in: the sync layer's
 * errors (`isDriveAuthError`), graphql-request's `ClientError` from the
 * remote GraphQL client (`response.status`, and "(Code: 401)" in its
 * message), and the router's partial-failure error that wraps one such
 * failure per backend.
 */
export function backendAuthStatusOf(error: unknown): 401 | 403 | null {
  if (!error || typeof error !== "object") return null;
  const e = error as {
    response?: { status?: unknown };
    statusCode?: unknown;
    message?: unknown;
    failures?: unknown;
  };
  const direct = [e.response?.status, e.statusCode].find(
    (s) => s === 401 || s === 403,
  );
  if (direct === 401 || direct === 403) return direct;
  if (typeof e.message === "string") {
    const m = STATUS_IN_MESSAGE.exec(e.message);
    if (m) return m[1] === "401" ? 401 : 403;
  }
  if (Array.isArray(e.failures)) {
    for (const failure of e.failures as { error?: unknown }[]) {
      const status = backendAuthStatusOf(failure.error);
      if (status) return status;
    }
  }
  // A Forbidden/authentication GraphQL error without a status.
  if (
    typeof e.message === "string" &&
    GRAPHQL_REFUSALS.some((m) => (e.message as string).includes(m))
  ) {
    return /authentication required/i.test(e.message) ? 401 : 403;
  }
  return null;
}

/** True when a backend refused the caller as unauthenticated or unauthorized. */
export function isBackendAuthError(error: unknown): boolean {
  return backendAuthStatusOf(error) !== null;
}

/** A switchboard's base, `${origin}` resolved against the page, without a trailing slash. */
function switchboardBaseOf(url: string): string {
  const drive = switchboardOfDrive(url);
  let base = drive
    ? drive.base
    : url.endsWith(GQL_CHANNEL_SUFFIX)
      ? url.slice(0, -GQL_CHANNEL_SUFFIX.length)
      : url.replace(/\/graphql\/?$/, "");
  if (base.startsWith(ORIGIN_PLACEHOLDER) && typeof location !== "undefined") {
    base = location.origin + base.slice(ORIGIN_PLACEHOLDER.length);
  }
  return base.replace(/\/+$/, "").toLowerCase();
}

/**
 * Whether the sync channel `url` is one of `backend`'s: the app's own
 * switchboard, named by a drive address or its GraphQL endpoint.
 */
export function isOwnBackend(
  url: string,
  backend: string | undefined,
): boolean {
  if (!backend) return false;
  return switchboardBaseOf(url) === switchboardBaseOf(backend);
}

/**
 * The app's answer to a sync channel's refusal (`withSyncRefusalHandler`):
 * a refused credential goes to the app's credential refusal handler (dropped
 * or enrolled, as a GraphQL request's would). A refusal by the app's own
 * backend (`ownBackend`) is recorded for the full-page sign-in gate, naming
 * it; one by another switchboard, a drive the person added, is not.
 */
export function handleSyncRefusal(
  url: string,
  refusal: { status: 401 | 403; reason?: string },
  ownBackend?: string,
): void {
  if (refusal.reason) {
    void answerCredentialRefusal({ reason: refusal.reason, url });
  }
  if (!isOwnBackend(url, ownBackend)) return;
  setBackendAuth({
    requiresAuth: true,
    status: refusal.status,
    backend: url,
    at: new Date().toISOString(),
  });
}

/** Records the refusal `error` carries, if it is one; returns whether it was. */
export function recordBackendAuthError(
  error: unknown,
  backend?: string,
): boolean {
  const status = backendAuthStatusOf(error);
  if (status === null) return false;
  setBackendAuth({
    requiresAuth: true,
    status,
    backend,
    at: new Date().toISOString(),
  });
  return true;
}
