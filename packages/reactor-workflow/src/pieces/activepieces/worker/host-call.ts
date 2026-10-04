// The child's half of the call channel: how piece code reaches durable host
// state mid-step, instead of handing everything back when the step returns.

// Modelled on their engine RPC (createRpcClient): a method name, a payload, an
// id, and failures returned as data rather than thrown across the boundary.
import { markIndeterminate } from "../indeterminate.js";
import {
  REACTOR_SUBMIT,
  REACTOR_SUBMIT_CREATE,
  REACTOR_WAIT,
  STORE_DELETE,
  STORE_PUT,
  type HostCallResponse,
} from "./protocol.js";

// A host call is a local IPC round trip, so ten seconds is pathological in the
// ordinary case. It was not in the field: a reactor dispatch under load, or a
// store write behind a saturated PGlite, outran it and the step was reported
// FAILED for a write that had in fact been committed (backlog item 6). The cap
// is now the host's to set (PH_WORKFLOWS_HOST_CALL_TIMEOUT_MS, and never
// shorter than the step's own timeoutSeconds), and a mutating call that does
// time out is INDETERMINATE rather than failed.
export const DEFAULT_HOST_CALL_TIMEOUT_MS = 10_000;

/**
 * The host calls that may have committed something by the time they time out.
 *
 * A read that times out is just a read that did not answer. A write is not:
 * the host may have written and simply not got the answer back in time, so
 * reporting it as a failure is a claim nobody can stand behind. `reactor.wait`
 * is in the set because what it waits on is a submitted write.
 */
export const MUTATING_HOST_CALLS: readonly string[] = [
  STORE_PUT,
  STORE_DELETE,
  REACTOR_SUBMIT,
  REACTOR_SUBMIT_CREATE,
  REACTOR_WAIT,
];

// Set per request from the wire; requests are serialized per worker.
let fromWire: number | undefined;

export function setHostCallTimeout(timeoutMs: number | undefined): void {
  fromWire = timeoutMs;
}

export function hostCallTimeoutMs(): number {
  return fromWire ?? DEFAULT_HOST_CALL_TIMEOUT_MS;
}

interface Pending {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

const pending = new Map<number, Pending>();
let nextId = 1;
let listening = false;

export class HostCallError extends Error {
  constructor(method: string, detail: string) {
    super(`Host call "${method}" failed: ${detail}`);
    this.name = "HostCallError";
  }
}

/** A read-ish host call that did not answer. An ordinary failure. */
export class HostCallTimeoutError extends Error {
  constructor(method: string, timeoutMs: number) {
    super(`Host call "${method}" got no answer within ${timeoutMs}ms`);
    this.name = "HostCallTimeoutError";
  }
}

/**
 * A WRITING host call that did not answer: the write may have landed.
 *
 * Marked indeterminate (`../indeterminate.ts`), which is what survives the
 * worker boundary — this is thrown in the forked child, where the class does
 * not cross but the error's own enumerable properties do.
 */
export const INDETERMINATE_ERROR_NAME = "HostCallIndeterminateError";

export class HostCallIndeterminateError extends Error {
  constructor(method: string, timeoutMs: number) {
    super(
      `Host call "${method}" got no answer within ${timeoutMs}ms; it writes, ` +
        "so whether it was committed is unknown and the step is neither a " +
        "success nor a failure",
    );
    this.name = INDETERMINATE_ERROR_NAME;
    markIndeterminate(this);
  }
}

function timeoutError(method: string, timeoutMs: number): Error {
  return MUTATING_HOST_CALLS.includes(method)
    ? new HostCallIndeterminateError(method, timeoutMs)
    : new HostCallTimeoutError(method, timeoutMs);
}

function isHostCallResponse(value: unknown): value is HostCallResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "host-result"
  );
}

// Registered once, on the same channel the job messages arrive on. The job
// dispatcher ignores `host-result` because it only knows its own request types.
function ensureListening(): void {
  if (listening) return;
  listening = true;
  process.on("message", (message: unknown) => {
    if (!isHostCallResponse(message)) return;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.error !== undefined) {
      entry.reject(new HostCallError(entry.method, message.error));
      return;
    }
    entry.resolve(message.value);
  });
}

export function callHost<T = unknown>(
  method: string,
  payload: unknown,
  timeoutMs: number = hostCallTimeoutMs(),
): Promise<T> {
  if (!process.send) {
    return Promise.reject(
      new HostCallError(method, "the worker has no channel to its host"),
    );
  }
  ensureListening();
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(timeoutError(method, timeoutMs));
    }, timeoutMs);
    pending.set(id, {
      method,
      resolve: resolve as (value: unknown) => void,
      reject,
      timer,
    });
    process.send?.({ id, type: "host-call", method, payload });
  });
}

// Test seam: a worker replaced between suites must not inherit pending calls.
export function resetHostCalls(): void {
  for (const entry of pending.values()) clearTimeout(entry.timer);
  pending.clear();
}

// The one-way half: a report with no answer to wait for. It cannot fail from
// the piece's side, so a missing channel is dropped rather than raised.
export function notifyHost(method: string, payload: unknown): void {
  try {
    process.send?.({ type: "host-notify", method, payload });
  } catch {
    // `process.send` stays defined after the channel closes and throws. A tap
    // that threw here would be a tap that changed the step.
  }
}
