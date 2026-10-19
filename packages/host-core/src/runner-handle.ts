import { z } from "zod";

/**
 * What a server verb returns to its supervisor (typed-host-configs 3.1/3.6).
 * The target contract is `RunnerHandle<O>`; T2 runners adopt it. Until then
 * the compound also accepts the phase-1 facts (`port`, `driveUrls`,
 * `endpoints`) and verbs that return nothing.
 */
export interface RunnerHandle<O = Record<string, unknown>> {
  outputs: O;
  /** Resolves when the member is serving. */
  ready: Promise<void>;
  /** Reverse-order compound teardown (and standalone signal handling). */
  shutdown(): Promise<void>;
}

/** The data half of a handle, validated by the compound. `ready`/`shutdown`
 * are functions and promises, so they are checked as TS fields, not here. */
export const runnerHandleSchema = z.looseObject({
  outputs: z.record(z.string(), z.unknown()).optional(),
  /** @deprecated phase-1 fact; replaced by outputs in T3. */
  port: z.number().int().optional(),
  /** @deprecated read only by `{ from, slug }` drive references (T3). */
  driveUrls: z.array(z.string().nullish()).optional(),
  /** @deprecated phase-1 fact; replaced by outputs in T3. */
  endpoints: z.record(z.string(), z.string()).optional(),
});

export type RunnerHandleData = z.infer<typeof runnerHandleSchema>;

/** A verb's return value, normalized: validated data plus the live fields
 * when present. */
export interface StartedHandle extends RunnerHandleData {
  outputs: Record<string, unknown>;
  ready?: PromiseLike<unknown>;
  shutdown?: () => unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return isRecord(value) && typeof value.then === "function";
}

function isCallable(value: unknown): value is (this: unknown) => unknown {
  return typeof value === "function";
}

/** Normalize what a verb returned. `undefined` (a self-sustaining bridge)
 * is an empty handle; anything else must match runnerHandleSchema. */
export function toStartedHandle(value: unknown, where: string): StartedHandle {
  if (value === undefined || value === null) return { outputs: {} };
  const parsed = runnerHandleSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `${where} returned an invalid runner handle:\n${z.prettifyError(parsed.error)}`,
    );
  }
  const live = isRecord(value) ? value : {};
  const shutdown = live.shutdown;
  return {
    ...parsed.data,
    outputs: parsed.data.outputs ?? {},
    ...(isPromiseLike(live.ready) ? { ready: live.ready } : {}),
    ...(isCallable(shutdown) ? { shutdown: () => shutdown.call(value) } : {}),
  };
}
