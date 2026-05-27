import type { OpenPanelTracker } from "./processor.js";

/**
 * Hard cap on pre-init events held in memory. When full, the oldest entry is
 * evicted (drop-oldest) so the most-recent events survive. Bounded, so an
 * uninitialised client never leaks; `resetOpenPanelClient()` discards it
 * entirely so pre-consent events are never replayed.
 */
const BUFFER_CAP = 200;

type BufferEntry = [name: string, props: Record<string, unknown> | undefined];

const buffer: BufferEntry[] = [];
let activeClient: OpenPanelTracker | undefined;
let errorHandler: ((err: unknown) => void) | undefined;

function defaultOnError(err: unknown): void {
  console.warn("[useOpenPanel] track failed:", err);
}

/**
 * Forward a single event to the active client, swallowing any throw.
 *
 * The outer try/catch handles synchronous throws from `client.track`; the
 * inner `.catch()` handles rejected promises. Both are needed because
 * `Promise.resolve(x).catch()` cannot catch a throw from evaluating `x`.
 */
function forward(
  client: OpenPanelTracker,
  name: string,
  props: Record<string, unknown> | undefined,
): void {
  try {
    Promise.resolve(client.track(name, props)).catch((err) =>
      (errorHandler ?? defaultOnError)(err),
    );
  } catch (err) {
    (errorHandler ?? defaultOnError)(err);
  }
}

/**
 * Drain the pre-init buffer in FIFO order through `client.track`, then forward
 * subsequent events directly. Called once from `getOpenPanelClient()`.
 */
export function drainOpenPanelBuffer(
  client: OpenPanelTracker,
  onError?: (err: unknown) => void,
): void {
  activeClient = client;
  errorHandler = onError;

  // Splice atomically so any track() during the drain is forwarded directly
  // (activeClient is set) rather than re-buffered.
  const pending = buffer.splice(0, buffer.length);
  for (const [name, props] of pending) {
    forward(client, name, props);
  }
}

/**
 * Clear the buffer and reset the active client. Buffered pre-consent events
 * are discarded so they are not replayed if the user later re-accepts.
 */
export function clearOpenPanelBuffer(): void {
  buffer.length = 0;
  activeClient = undefined;
  errorHandler = undefined;
}

/**
 * Track an analytics event. Sync, never throws. Forwards immediately when the
 * client is initialised, otherwise buffers (FIFO, cap 200, drop-oldest).
 */
export function track(name: string, props?: Record<string, unknown>): void {
  if (activeClient) {
    forward(activeClient, name, props);
    return;
  }

  if (buffer.length >= BUFFER_CAP) {
    buffer.shift();
  }
  buffer.push([name, props]);
}
