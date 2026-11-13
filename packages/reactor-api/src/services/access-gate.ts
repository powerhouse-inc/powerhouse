import { childLogger, type ILogger } from "document-model";

/**
 * Where an {@link AccessGate} answer came from:
 * - `gate`: Vetra answered just now;
 * - `cache`: Vetra's answer, still inside its `ttlSeconds`;
 * - `grace`: Vetra is unreachable and the caller was allowed within the grace period;
 * - `refused`: no usable answer (Vetra unreachable with no recent positive
 *   answer, or Vetra refused the request itself with a 401 or 400).
 */
export type AccessVerdict = {
  allowed: boolean;
  source: "gate" | "cache" | "grace" | "refused";
};

/** `ACCESS=licensed`: asks whether a (non-admin) address may use this host. */
export interface AccessGate {
  /** `address` is lower-cased by the caller. Never throws. */
  check(address: string): Promise<AccessVerdict>;
}

export interface VetraAccessGateOptions {
  /** Vetra's `…/apps/gate/check` URL (`VETRA_GATE_URL`). */
  url: string;
  /** The instance's gate token (`VETRA_GATE_TOKEN`). Never logged. */
  token: string;
  /** `VETRA_APP_ID`, sent as `x-vetra-app-id` (informational). */
  appId?: string;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  /** A request taking longer counts as Vetra being unavailable. */
  timeoutMs?: number;
  /** Used when Vetra's `ttlSeconds` is absent or not a number. */
  defaultTtlMs?: number;
  /** How long a positive answer still admits while Vetra is unreachable
   *  (`ACCESS_GATE_GRACE_MS`). */
  graceMs?: number;
  maxEntries?: number;
  logger?: ILogger;
}

export const DEFAULT_ACCESS_GATE_TIMEOUT_MS = 5_000;
export const DEFAULT_ACCESS_GATE_TTL_MS = 60_000;
export const DEFAULT_ACCESS_GATE_GRACE_MS = 86_400_000;
export const DEFAULT_ACCESS_GATE_MAX_ENTRIES = 10_000;
const MIN_TTL_MS = 1_000;
const MAX_TTL_MS = 300_000;
/** A failing Vetra is asked at most once per address per this long. */
const UNAVAILABLE_BACKOFF_MS = 5_000;
const LOG_INTERVAL_MS = 60_000;

interface Entry {
  /** Vetra's last answer, valid until `expiresAt`. */
  fresh?: { allowed: boolean; expiresAt: number };
  /** When Vetra last allowed this address; what the grace period runs from. */
  lastPositiveAt?: number;
  /** Until then, no request goes to Vetra for this address. */
  retryAt?: number;
  inflight?: Promise<AccessVerdict>;
}

type Outcome =
  | { kind: "answer"; allowed: boolean; ttlMs: number }
  | { kind: "rejected"; status: 400 | 401 }
  | { kind: "unavailable"; reason: string };

const REFUSED: AccessVerdict = { allowed: false, source: "refused" };

/**
 * The `ACCESS=licensed` client of Vetra's licence gate.
 *
 * - Answers (allowed or not) are cached per address for Vetra's `ttlSeconds`,
 *   clamped to 1-300 s; concurrent checks of one address share one request.
 * - While Vetra is unreachable (network error, timeout, 429, 5xx, any other
 *   unexpected answer) an address Vetra allowed within `graceMs` stays
 *   allowed; a never-seen address is refused. It never fails open.
 * - A 401 (the token is bad or revoked) or 400 is final: it is never answered
 *   from grace, and it drops the address's last positive answer.
 */
export function createVetraAccessGate(o: VetraAccessGateOptions): AccessGate {
  const doFetch = o.fetch ?? globalThis.fetch.bind(globalThis);
  const now = o.now ?? Date.now;
  const timeoutMs = o.timeoutMs ?? DEFAULT_ACCESS_GATE_TIMEOUT_MS;
  const defaultTtlMs = o.defaultTtlMs ?? DEFAULT_ACCESS_GATE_TTL_MS;
  const graceMs = o.graceMs ?? DEFAULT_ACCESS_GATE_GRACE_MS;
  const maxEntries = Math.max(
    1,
    o.maxEntries ?? DEFAULT_ACCESS_GATE_MAX_ENTRIES,
  );
  const logger = o.logger ?? childLogger(["reactor-api", "access-gate"]);
  const entries = new Map<string, Entry>();
  let lastWarnAt = -Infinity;
  let lastErrorAt = -Infinity;

  const redact = (text: string) =>
    o.token ? text.split(o.token).join("[redacted]") : text;

  function graceVerdict(entry: Entry, at: number): AccessVerdict {
    return entry.lastPositiveAt !== undefined &&
      at - entry.lastPositiveAt <= graceMs
      ? { allowed: true, source: "grace" }
      : REFUSED;
  }

  function entryFor(address: string): Entry {
    let entry = entries.get(address);
    if (!entry) {
      entry = {};
      entries.set(address, entry);
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    }
    return entry;
  }

  async function ask(address: string): Promise<Outcome> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = {
        authorization: `Bearer ${o.token}`,
        "content-type": "application/json",
      };
      if (o.appId) headers["x-vetra-app-id"] = o.appId;
      const response = await doFetch(o.url, {
        method: "POST",
        headers,
        body: JSON.stringify({ address }),
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 400) {
        return { kind: "rejected", status: response.status };
      }
      if (response.status !== 200) {
        return { kind: "unavailable", reason: `HTTP ${response.status}` };
      }
      const body = (await response.json().catch(() => undefined)) as
        | { allowed?: unknown; ttlSeconds?: unknown }
        | undefined;
      if (typeof body?.allowed !== "boolean") {
        return { kind: "unavailable", reason: "an unreadable answer" };
      }
      return {
        kind: "answer",
        allowed: body.allowed,
        ttlMs: ttlMsOf(body.ttlSeconds, defaultTtlMs),
      };
    } catch (error) {
      const reason = controller.signal.aborted
        ? `no answer within ${timeoutMs} ms`
        : error instanceof Error
          ? `${error.name}: ${error.message}`
          : "a network error";
      return { kind: "unavailable", reason };
    } finally {
      clearTimeout(timer);
    }
  }

  function record(entry: Entry, outcome: Outcome): AccessVerdict {
    const at = now();
    switch (outcome.kind) {
      case "answer":
        entry.fresh = {
          allowed: outcome.allowed,
          expiresAt: at + outcome.ttlMs,
        };
        entry.retryAt = undefined;
        // A denial is authoritative: a later outage must not revive the caller.
        entry.lastPositiveAt = outcome.allowed ? at : undefined;
        return { allowed: outcome.allowed, source: "gate" };
      case "rejected":
        entry.fresh = undefined;
        entry.lastPositiveAt = undefined;
        entry.retryAt = at + UNAVAILABLE_BACKOFF_MS;
        if (at - lastErrorAt >= LOG_INTERVAL_MS) {
          lastErrorAt = at;
          logger.error(
            outcome.status === 401
              ? "Vetra refused the gate token (401): only ADMINS can sign in"
              : "Vetra refused the gate check (400): only ADMINS can sign in",
          );
        }
        return REFUSED;
      case "unavailable":
        entry.fresh = undefined;
        entry.retryAt = at + UNAVAILABLE_BACKOFF_MS;
        if (at - lastWarnAt >= LOG_INTERVAL_MS) {
          lastWarnAt = at;
          logger.warn(
            "Vetra's licence gate is unavailable (@reason): admitting only ADMINS and callers Vetra allowed in the last @hours h",
            redact(outcome.reason),
            Math.round((graceMs / 3_600_000) * 10) / 10,
          );
        }
        return graceVerdict(entry, at);
    }
  }

  async function check(address: string): Promise<AccessVerdict> {
    try {
      const at = now();
      const entry = entryFor(address);
      if (entry.fresh && entry.fresh.expiresAt > at) {
        return { allowed: entry.fresh.allowed, source: "cache" };
      }
      if (entry.inflight) return await entry.inflight;
      if (entry.retryAt !== undefined && entry.retryAt > at) {
        return graceVerdict(entry, at);
      }
      const inflight = (async () => {
        try {
          return record(entry, await ask(address));
        } catch {
          return REFUSED;
        } finally {
          entry.inflight = undefined;
        }
      })();
      entry.inflight = inflight;
      return await inflight;
    } catch {
      return REFUSED;
    }
  }

  return { check };
}

function ttlMsOf(ttlSeconds: unknown, defaultTtlMs: number): number {
  if (typeof ttlSeconds !== "number" || !Number.isFinite(ttlSeconds)) {
    return defaultTtlMs;
  }
  return Math.min(MAX_TTL_MS, Math.max(MIN_TTL_MS, ttlSeconds * 1000));
}
