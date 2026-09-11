// The child's half of the call channel: how piece code reaches durable host
// state mid-step, instead of handing everything back when the step returns.

// Modelled on their engine RPC (createRpcClient): a method name, a payload, an
// id, and failures returned as data rather than thrown across the boundary.
import type { HostCallResponse } from "./protocol.js";

// A host call is a local IPC round trip. Ten seconds is already pathological;
// the step's own timeout is the outer bound and kills the worker outright.
const DEFAULT_HOST_CALL_TIMEOUT_MS = 10_000;

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

export class HostCallTimeoutError extends Error {
  constructor(method: string, timeoutMs: number) {
    super(`Host call "${method}" got no answer within ${timeoutMs}ms`);
    this.name = "HostCallTimeoutError";
  }
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
  timeoutMs: number = DEFAULT_HOST_CALL_TIMEOUT_MS,
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
      reject(new HostCallTimeoutError(method, timeoutMs));
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
