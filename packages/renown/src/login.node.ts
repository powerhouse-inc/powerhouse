import type { CreateBearerTokenOptions, IRenown, User } from "./types.js";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL_MS = 2000; // 2 seconds
const SECONDS_IN_DAY = 24 * 60 * 60;

export interface BrowserLoginOptions {
  /** Renown server URL */
  renownUrl: string;
  /** Timeout in milliseconds. Defaults to 5 minutes. */
  timeoutMs?: number;
  /** Called with the login URL and session ID before the browser is opened */
  onLoginUrl?: (url: string, sessionId: string) => void;
  /** Called on each poll tick while waiting for authentication */
  onPollTick?: () => void;
  /** Called when the browser failed to open automatically */
  onBrowserOpenFailed?: (url: string) => void;
  /** AbortSignal to cancel the login flow */
  signal?: AbortSignal;
}

export interface BrowserLoginResult {
  user: User;
  cliDid: string;
}

export interface AuthStatusResult {
  authenticated: boolean;
  address?: string;
  userDid?: string;
  chainId?: number;
  cliDid: string;
  authenticatedAt?: Date;
  baseUrl: string;
}

interface PendingSessionResponse {
  sessionId: string;
  status: "pending";
}

interface ReadySessionResponse {
  sessionId: string;
  status: "ready";
  address: string;
  chainId: number;
  did: string;
  credentialId: string;
  userDocumentId: string;
}

type SessionResponse = PendingSessionResponse | ReadySessionResponse;

function abortReason(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  if (signal.reason) return new Error(String(signal.reason));
  return new DOMException("Aborted", "AbortError");
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal!));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Open a URL in the default browser (cross-platform).
 */
export async function openBrowser(url: string): Promise<void> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  const platform = process.platform;

  if (platform === "darwin") {
    await execFileAsync("open", [url]);
  } else if (platform === "win32") {
    await execFileAsync("cmd", ["/c", "start", "", url]);
  } else {
    await execFileAsync("xdg-open", [url]);
  }
}

async function pollSession(
  renownUrl: string,
  sessionId: string,
  timeoutMs: number,
  onPollTick?: () => void,
  signal?: AbortSignal,
): Promise<ReadySessionResponse | null> {
  const startTime = Date.now();
  const sessionUrl = new URL(
    `/api/console/session/${sessionId}`,
    renownUrl,
  ).toString();

  while (Date.now() - startTime < timeoutMs) {
    signal?.throwIfAborted();
    try {
      const response = await fetch(sessionUrl, { signal });
      if (response.ok) {
        const data = (await response.json()) as SessionResponse;
        if (data.status === "ready") {
          return data;
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError")
        throw error;
      // Network error, will retry
    }
    onPollTick?.();
    await sleep(POLL_INTERVAL_MS, signal);
  }

  return null;
}

/**
 * Perform a browser-based login flow with Renown.
 * Opens the user's browser to authenticate, then polls for completion.
 * Throws if already authenticated or if the flow times out.
 * If the browser fails to open, the flow continues polling — callers
 * can use onBrowserOpenFailed to show the URL as a fallback.
 */
export async function browserLogin(
  renown: IRenown,
  options: BrowserLoginOptions,
): Promise<BrowserLoginResult> {
  if (renown.user?.credential) {
    throw new Error(
      `Already authenticated as ${renown.user.address}. Logout first.`,
    );
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sessionId = crypto.randomUUID();

  const loginUrl = new URL("/console", options.renownUrl);
  loginUrl.searchParams.set("session", sessionId);
  loginUrl.searchParams.set("connect", renown.did);
  loginUrl.searchParams.set("app", renown.did);

  const url = loginUrl.toString();
  options.onLoginUrl?.(url, sessionId);

  try {
    await openBrowser(url);
  } catch {
    options.onBrowserOpenFailed?.(url);
  }

  const result = await pollSession(
    options.renownUrl,
    sessionId,
    timeoutMs,
    options.onPollTick,
    options.signal,
  );

  if (!result) {
    throw new Error("Authentication timed out.");
  }

  const user = await renown.login(result.did);
  return { user, cliDid: renown.did };
}

/**
 * Get the current authentication status from a Renown instance.
 */
export function getAuthStatus(renown: IRenown): AuthStatusResult {
  const user = renown.user;
  const credential = user?.credential;

  return {
    authenticated: !!credential,
    address: user?.address,
    userDid: user?.did,
    chainId: user?.chainId,
    cliDid: renown.did,
    authenticatedAt: credential ? new Date(credential.issuanceDate) : undefined,
    baseUrl: renown.baseUrl,
  };
}

export interface AccessTokenResult {
  token: string;
  did: string;
  address: string;
  expiresIn: number;
}

/**
 * Generate a bearer token for API authentication.
 * Requires the user to be authenticated (via browserLogin or equivalent).
 * Throws if not authenticated.
 */
export async function generateAccessToken(
  renown: IRenown,
  options?: CreateBearerTokenOptions,
): Promise<AccessTokenResult> {
  const user = renown.user;
  if (!user?.credential) {
    throw new Error(
      "Not authenticated. Login first to generate access tokens.",
    );
  }

  const token = await renown.getBearerToken(options ?? {});

  return {
    token,
    did: renown.did,
    address: user.address,
    expiresIn: options?.expiresIn ?? 0,
  };
}

/**
 * Parse a human-readable expiry string to seconds.
 * Supports formats: "7d" (days), "24h" (hours), "3600" (seconds), "3600s" (seconds).
 * Only accepts positive integers — decimals like "1.5h" are rejected.
 */
export function parseExpiry(expiry: string): number {
  const trimmed = expiry.trim().toLowerCase();
  const match = trimmed.match(/^(\d+)(d|h|s)?$/);

  if (!match) {
    throw new Error(
      `Invalid expiry format: ${expiry}. Expected a positive integer with optional suffix: "7d", "24h", "3600s", or "3600".`,
    );
  }

  const value = Number(match[1]);
  const unit = match[2];

  if (value <= 0) {
    throw new Error(
      `Invalid expiry format: ${expiry}. Value must be a positive integer.`,
    );
  }

  switch (unit) {
    case "d":
      return value * SECONDS_IN_DAY;
    case "h":
      return value * 60 * 60;
    default:
      return value;
  }
}

/**
 * Format an expiry duration in seconds to a human-readable string.
 */
export function formatExpiry(expiresIn: number): string {
  const days = Math.floor(expiresIn / SECONDS_IN_DAY);
  const hours = Math.floor((expiresIn % SECONDS_IN_DAY) / 3600);

  if (days > 0) {
    const dayStr = `${days} day${days !== 1 ? "s" : ""}`;
    if (hours > 0) {
      return `${dayStr} and ${hours} hour${hours !== 1 ? "s" : ""}`;
    }
    return dayStr;
  }

  if (hours > 0) {
    return `${hours} hour${hours !== 1 ? "s" : ""}`;
  }

  return `${expiresIn} second${expiresIn !== 1 ? "s" : ""}`;
}
