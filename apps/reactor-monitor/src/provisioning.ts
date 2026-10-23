import type { ReactorDescriptor } from "@powerhousedao/reactor-monitor";
import type { ProvisionRequest } from "./components/ProvisionPanel.js";

/**
 * Constructs this app's SharedWorker for a worker-hosted reactor.
 *
 * The literal `new URL("./reactor-monitor.worker.js", import.meta.url)`
 * below is the "hand the library the worker" seam from
 * `@powerhousedao/reactor-monitor`'s `reactorMonitorWorkerUrl` doc: a
 * bundler emits a worker chunk only when it can see this exact pattern at
 * a construction site, which is why it is written here rather than inside
 * the library. `./reactor-monitor.worker.js` resolves to the sibling
 * `reactor-monitor.worker.ts`, which calls `startMonitorWorker()` from
 * `@powerhousedao/reactor-monitor/worker` — the `.js` specifier resolving to
 * a `.ts` sibling is the same Vite/TypeScript resolution the library's own
 * worker entry relies on.
 */
export function createMonitorWorker(name: string): SharedWorker {
  return new SharedWorker(
    new URL("./reactor-monitor.worker.js", import.meta.url),
    { name, type: "module" },
  );
}

/** Prefix of the sessionStorage key holding a host's bearer, by its GraphQL url. */
export const REMOTE_BEARER_KEY_PREFIX = "ph:reactor-monitor:bearer:";

// Where storage is blocked, the bearers live as long as the page instead.
const unstoredBearers = new Map<string, string>();

function sessionStore(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

/** True for a JWT whose `exp` has passed; any other token is taken as it is. */
function isExpired(token: string): boolean {
  const payload = token.split(".")[1];
  if (!payload) return false;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const { exp } = JSON.parse(atob(base64)) as { exp?: unknown };
    return typeof exp === "number" && exp * 1000 <= Date.now();
  } catch {
    return false;
  }
}

/**
 * Sets (or, when empty, clears) the bearer sent to the host at `url`. It is
 * kept for the tab's session, so a reload keeps it and closing the tab drops
 * it, and read per request, so one pasted after provisioning is sent at once.
 */
export function setRemoteBearer(url: string, bearer: string): void {
  const trimmed = bearer.trim().replace(/^Bearer\s+/i, "");
  const key = REMOTE_BEARER_KEY_PREFIX + url;
  const store = sessionStore();
  try {
    if (store && trimmed) store.setItem(key, trimmed);
    else if (store) store.removeItem(key);
    if (store) return;
  } catch {
    // Storage refused the write; keep the bearer for this page instead.
  }
  if (trimmed) unstoredBearers.set(url, trimmed);
  else unstoredBearers.delete(url);
}

function bearerFor(url: string): string | undefined {
  let bearer = unstoredBearers.get(url);
  try {
    bearer ??=
      sessionStore()?.getItem(REMOTE_BEARER_KEY_PREFIX + url) ?? undefined;
  } catch {
    // Unreadable storage holds no bearer.
  }
  if (bearer && isExpired(bearer)) {
    setRemoteBearer(url, "");
    return undefined;
  }
  return bearer;
}

/** The headers for the host at `url`: its bearer, unless that has expired. */
export function remoteHeaders(url: string): Record<string, string> {
  const bearer = bearerFor(url);
  return bearer ? { Authorization: `Bearer ${bearer}` } : {};
}

/**
 * Builds the descriptor the provision form submits.
 *
 * `syncMode: "local"` builds a lone `LocalChannelFactory` (no "Add remote");
 * `"connect"` keeps the gql scheme, which also composes a local factory.
 * A remote's bearer rides `remote.headers`, a function reading the tab's
 * session store, so a monitoring set never carries it.
 */
export function buildDescriptor(request: ProvisionRequest): ReactorDescriptor {
  const {
    name,
    kind,
    syncMode = "local",
    remoteUrl,
    bearer,
    attachmentStore = "none",
  } = request;
  if (kind === "remote") {
    const url = remoteUrl ?? "";
    // No bearer keeps the one this tab already holds for the host.
    if (bearer) setRemoteBearer(url, bearer);
    return { kind, name, remote: { url, headers: () => remoteHeaders(url) } };
  }
  const sync = syncMode === "local" ? { local: true } : undefined;
  if (kind === "worker") {
    // No `attachments`: byte movement is in-process only; the form says so.
    return {
      kind,
      name,
      createWorker: createMonitorWorker,
      ...(sync ? { sync } : {}),
    };
  }
  return {
    kind,
    name,
    ...(sync ? { sync } : {}),
    ...(attachmentStore === "none"
      ? {}
      : { attachments: { store: attachmentStore } }),
  };
}
