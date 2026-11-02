import type { IRenown, User } from "./types.js";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL_MS = 500; // 0.5s: session store is in-memory, cheap to poll

export interface ConsoleLoginOptions {
  /** Renown server URL */
  renownUrl: string;
  /**
   * Opens the sign-in page somewhere the person can use it. The page stays
   * there: this side only polls, so no redirect has to find its way back.
   */
  open: (url: string) => void | Promise<void>;
  /** Timeout in milliseconds. Defaults to 5 minutes. */
  timeoutMs?: number;
  /** Called with the login URL and session ID before it is opened */
  onLoginUrl?: (url: string, sessionId: string) => void;
  /** Called on each poll tick while waiting for authentication */
  onPollTick?: () => void;
  /** Called when `open` failed; the flow goes on polling */
  onOpenFailed?: (url: string) => void;
  /** AbortSignal to cancel the login flow */
  signal?: AbortSignal;
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
 * Signs `renown`'s own key in through Renown's console session: opens the page
 * for that key, polls until the person has finished, then logs in. It works
 * from anywhere that can open a page and fetch, which is why a CLI and an app
 * window with no popup both use it.
 */
export async function consoleLogin(
  renown: IRenown,
  options: ConsoleLoginOptions,
): Promise<User> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sessionId = crypto.randomUUID();

  const loginUrl = new URL("/console", options.renownUrl);
  loginUrl.searchParams.set("session", sessionId);
  loginUrl.searchParams.set("connect", renown.did);
  loginUrl.searchParams.set("app", renown.did);

  const url = loginUrl.toString();
  options.onLoginUrl?.(url, sessionId);

  try {
    await options.open(url);
  } catch {
    options.onOpenFailed?.(url);
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

  return renown.login(result.did);
}
