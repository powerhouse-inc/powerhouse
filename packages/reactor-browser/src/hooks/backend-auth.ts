import { isDriveAuthError } from "@powerhousedao/reactor";
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
  // Forbidden/Unauthorized GraphQL errors without a status: the sync layer's rule.
  if (isDriveAuthError(error)) return 403;
  return null;
}

/** True when a backend refused the caller as unauthenticated or unauthorized. */
export function isBackendAuthError(error: unknown): boolean {
  return backendAuthStatusOf(error) !== null;
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
