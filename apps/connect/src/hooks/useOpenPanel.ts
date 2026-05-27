// Type-only import — erased at compile time; no runtime dependency on the
// service layer, so there is no circular-import risk.
import type { OpenPanelTracker } from "../services/openpanel/processor.js";

// ---------------------------------------------------------------------------
// Buffer configuration
// ---------------------------------------------------------------------------

/**
 * Hard cap on the number of pre-init events held in memory.
 *
 * **Drop policy: drop-oldest.**
 * When the buffer is full and a new event arrives, the oldest entry is
 * evicted (`buffer.shift()`) to make room, and the new entry is appended.
 * This keeps the most-recent pre-init events, which are the ones most likely
 * to be meaningful when the client eventually initialises.
 *
 * If the user never accepts the analytics cookie (and the client is never
 * initialised) the buffer is bounded and never becomes a memory leak.
 * `resetOpenPanelClient()` discards it entirely, so pre-consent events are
 * never replayed retroactively.
 */
const BUFFER_CAP = 200;

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

type BufferEntry = [name: string, props: Record<string, unknown> | undefined];

/** FIFO queue of events buffered before the client was available. */
const buffer: BufferEntry[] = [];

/** Set by `drainOpenPanelBuffer`; cleared by `clearOpenPanelBuffer`. */
let activeClient: OpenPanelTracker | undefined;

/** Optional custom error handler; falls back to `defaultOnError`. */
let errorHandler: ((err: unknown) => void) | undefined;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function defaultOnError(err: unknown): void {
  console.warn("[useOpenPanel] track failed:", err);
}

/**
 * Forward a single event to the active client, swallowing any throw.
 * Errors are routed to `errorHandler` if set, otherwise `defaultOnError`.
 *
 * Uses `Promise.resolve().catch()` so that both synchronous throws and
 * rejected-promise returns from `client.track` are captured — a plain
 * try/catch only handles the synchronous case.
 */
function forward(
  client: OpenPanelTracker,
  name: string,
  props: Record<string, unknown> | undefined,
): void {
  Promise.resolve(client.track(name, props)).catch((err) =>
    (errorHandler ?? defaultOnError)(err),
  );
}

// ---------------------------------------------------------------------------
// Public buffer API (consumed by client.ts and tests)
// ---------------------------------------------------------------------------

/**
 * Drain the pre-init buffer in FIFO order through `client.track`.
 *
 * Should be called exactly once, immediately after the `OpenPanel` singleton
 * is constructed in `getOpenPanelClient()`.  Sets `activeClient` so that
 * subsequent `track()` calls are forwarded directly without buffering.
 *
 * @param client   The freshly-built OpenPanel tracker.
 * @param onError  Optional error handler; defaults to `console.warn`.
 */
export function drainOpenPanelBuffer(
  client: OpenPanelTracker,
  onError?: (err: unknown) => void,
): void {
  activeClient = client;
  errorHandler = onError;

  // Splice the whole buffer out atomically so that any `track()` call that
  // happens during the drain loop is forwarded directly (activeClient is set)
  // rather than re-buffered.
  const pending = buffer.splice(0, buffer.length);
  for (const [name, props] of pending) {
    forward(client, name, props);
  }
}

/**
 * Clear the buffer and reset the active client reference.
 *
 * Called by `resetOpenPanelClient()` on consent revocation or sign-out.
 * Any buffered pre-consent events are discarded — they must **not** be
 * replayed if the user later re-accepts the cookie.
 */
export function clearOpenPanelBuffer(): void {
  buffer.length = 0;
  activeClient = undefined;
  errorHandler = undefined;
}

// ---------------------------------------------------------------------------
// Stable track function (exported for tree-shake-friendly direct use)
// ---------------------------------------------------------------------------

/**
 * Track an analytics event.
 *
 * - **Sync, never throws.**
 * - If the OpenPanel client is already initialised the event is forwarded
 *   immediately; any `client.track` failure is caught and passed to the
 *   configured error handler (or `console.warn`).
 * - If the client is not yet initialised the event is queued in the
 *   module-level buffer (FIFO, cap 200, drop-oldest policy).
 */
export function track(
  name: string,
  props?: Record<string, unknown>,
): void {
  if (activeClient) {
    forward(activeClient, name, props);
    return;
  }

  // Buffer cap enforcement — drop-oldest.
  if (buffer.length >= BUFFER_CAP) {
    buffer.shift();
  }
  buffer.push([name, props]);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Stable return value — created once at module load. */
const openPanelApi = { track } as const;

/**
 * Returns `{ track(name, props) }` backed by the module-level pre-init
 * buffer.  The object reference is stable (no React state involved), so
 * callers can safely depend on it without `useMemo`.
 *
 * Usage:
 * ```ts
 * const { track } = useOpenPanel();
 * track("button.clicked", { label: "save" });
 * ```
 */
export function useOpenPanel(): { track: typeof track } {
  return openPanelApi;
}
