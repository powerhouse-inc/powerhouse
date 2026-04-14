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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Open a URL in the default browser (cross-platform).
 */
export async function openBrowser(url: string): Promise<void> {
  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);
  const platform = process.platform;

  if (platform === "darwin") {
    await execAsync(`open "${url}"`);
  } else if (platform === "win32") {
    await execAsync(`start "" "${url}"`);
  } else {
    await execAsync(`xdg-open "${url}"`);
  }
}

async function pollSession(
  renownUrl: string,
  sessionId: string,
  timeoutMs: number,
  onPollTick?: () => void,
): Promise<ReadySessionResponse | null> {
  const startTime = Date.now();
  const sessionUrl = `${renownUrl}/api/console/session/${sessionId}`;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(sessionUrl);
      if (response.ok) {
        const data = (await response.json()) as SessionResponse;
        if (data.status === "ready") {
          return data;
        }
      }
    } catch {
      // Network error, will retry
    }
    onPollTick?.();
    await sleep(POLL_INTERVAL_MS);
  }

  return null;
}

/**
 * Perform a browser-based login flow with Renown.
 * Opens the user's browser to authenticate, then polls for completion.
 * Throws if already authenticated or if the flow times out.
 */
export async function browserLogin(
  renown: IRenown,
  options: BrowserLoginOptions,
): Promise<BrowserLoginResult> {
  if (renown.user) {
    throw new Error(`Already authenticated as ${renown.user.address}`);
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sessionId = crypto.randomUUID();

  const loginUrl = new URL(`${options.renownUrl}/console`);
  loginUrl.searchParams.set("session", sessionId);
  loginUrl.searchParams.set("connect", renown.did);
  loginUrl.searchParams.set("app", renown.did);

  const url = loginUrl.toString();
  options.onLoginUrl?.(url, sessionId);

  await openBrowser(url);

  const result = await pollSession(
    options.renownUrl,
    sessionId,
    timeoutMs,
    options.onPollTick,
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

export interface AccessTokenOptions extends CreateBearerTokenOptions {
  /** Force refresh the token even if a cached one exists */
  refresh?: boolean;
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
  options?: AccessTokenOptions,
): Promise<AccessTokenResult> {
  const user = renown.user;
  if (!user?.credential) {
    throw new Error(
      "Not authenticated. Login first to generate access tokens.",
    );
  }

  const { refresh, ...tokenOptions } = options ?? {};
  const token = await renown.getBearerToken(tokenOptions, refresh);

  return {
    token,
    did: renown.did,
    address: user.address,
    expiresIn: tokenOptions.expiresIn ?? 0,
  };
}

/**
 * Parse a human-readable expiry string to seconds.
 * Supports formats: "7d" (days), "24h" (hours), "3600" (seconds), "3600s" (seconds).
 */
export function parseExpiry(expiry: string): number {
  const trimmed = expiry.trim().toLowerCase();

  if (trimmed.endsWith("d")) {
    const days = parseInt(trimmed.slice(0, -1), 10);
    if (isNaN(days) || days <= 0) {
      throw new Error(
        `Invalid expiry format: ${expiry}. Days must be a positive number.`,
      );
    }
    return days * SECONDS_IN_DAY;
  }

  if (trimmed.endsWith("h")) {
    const hours = parseInt(trimmed.slice(0, -1), 10);
    if (isNaN(hours) || hours <= 0) {
      throw new Error(
        `Invalid expiry format: ${expiry}. Hours must be a positive number.`,
      );
    }
    return hours * 60 * 60;
  }

  const numericValue = trimmed.endsWith("s") ? trimmed.slice(0, -1) : trimmed;
  const seconds = parseInt(numericValue, 10);
  if (isNaN(seconds) || seconds <= 0) {
    throw new Error(
      `Invalid expiry format: ${expiry}. Expected a positive number or format like "7d", "24h", "3600s".`,
    );
  }

  return seconds;
}

/**
 * Format an expiry duration in seconds to a human-readable string.
 */
export function formatExpiry(expiresIn: number): string {
  const days = Math.floor(expiresIn / SECONDS_IN_DAY);
  const hours = Math.floor((expiresIn % SECONDS_IN_DAY) / 3600);

  if (days > 0) {
    const dayStr = `${days} day${days > 1 ? "s" : ""}`;
    if (hours > 0) {
      return `${dayStr} and ${hours} hour${hours > 1 ? "s" : ""}`;
    }
    return dayStr;
  }

  if (hours > 0) {
    return `${hours} hour${hours > 1 ? "s" : ""}`;
  }

  return `${expiresIn} seconds`;
}
